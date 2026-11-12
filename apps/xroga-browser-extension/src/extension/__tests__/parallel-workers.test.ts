import { describe, expect, it } from 'vitest';
import { ParallelWorkers, PARALLEL_TOOLS, MAX_ACTIVE_WORKERS, type WorkerDeps, type WorkerJob } from '../parallel-workers';
import { kindOf } from '@src/agent/tools';

function harness(overrides: Partial<WorkerDeps> = {}) {
  let clock = 1_000_000;
  let counter = 0;
  const stored: { jobs: Record<string, WorkerJob> } = { jobs: {} };
  const opened: Array<{ parentId: string; url: string }> = [];
  const stopped: string[] = [];
  const closed: number[] = [];
  const deps: WorkerDeps = {
    now: () => clock,
    newId: () => `job${++counter}`,
    load: async () => stored.jobs,
    save: async jobs => { stored.jobs = jobs; },
    open: async (parentId, task) => { opened.push({ parentId, url: task.url }); return { conversationId: `conv-${opened.length}`, windowId: 100 + opened.length }; },
    stop: id => { stopped.push(id); },
    closeWindow: async id => { closed.push(id); },
    refuse: url => (/^https:\/\//.test(url) && !url.includes('blocked') ? null : 'that start page is not allowed.'),
    wait: async ms => { clock += ms; },
    ...overrides,
  };
  return { workers: new ParallelWorkers(deps), stored, opened, stopped, closed, tick: (ms: number) => { clock += ms; } };
}
const task = (n: number) => ({ instruction: `Research competitor ${n}`, url: `https://c${n}.example/pricing` });
const parse = (r: { text: string }) => JSON.parse(r.text);

describe('the tools', () => {
  it('start is an effect and status is a read for the execution policy', () => {
    expect(PARALLEL_TOOLS.map(t => t.name)).toEqual(['start_parallel_tasks', 'parallel_task_status']);
  });
  it('is fenced like other effects on recovery', () => {
    expect(kindOf('start_parallel_tasks', {})).toBe('mutate');
    expect(kindOf('parallel_task_status', {})).toBe('read');
  });
});

describe('starting workers', () => {
  it('opens one worker per task, up to three, and reports them', async () => {
    const h = harness();
    const r = await h.workers.start('parent', { tasks: [task(1), task(2), task(3)] });
    expect(r.isError).toBe(false);
    expect(parse(r).started).toHaveLength(3);
    expect(h.opened.map(o => o.url)).toEqual(['https://c1.example/pricing', 'https://c2.example/pricing', 'https://c3.example/pricing']);
    expect(Object.values(h.stored.jobs).every(j => j.state === 'running' && j.parentId === 'parent')).toBe(true);
  });

  it('checks the whole batch first: one bad task opens nothing', async () => {
    const h = harness();
    const r = await h.workers.start('parent', { tasks: [task(1), { instruction: 'x', url: 'https://blocked.example' }] });
    expect(r.isError).toBe(true);
    expect(r.text).toContain('nothing started');
    expect(h.opened).toHaveLength(0);
    expect(Object.keys(h.stored.jobs)).toHaveLength(0);
  });

  it('runs at most three at a time, queues the fourth, and starts it as soon as a worker ends', async () => {
    const h = harness();
    const r = parse(await h.workers.start('parent', { tasks: [task(1), task(2), task(3), task(4)] }));
    expect(r.started.map((s: { state: string }) => s.state)).toEqual(['running', 'running', 'running', 'waiting']);
    expect(h.opened).toHaveLength(MAX_ACTIVE_WORKERS);
    await h.workers.ended('conv-2', { status: 'done', outcome: 'success', result: 'two' });
    expect(h.opened).toHaveLength(4);
    // Another parent has its own three.
    expect((await h.workers.start('other', { tasks: [task(6)] })).isError).toBe(false);
  });

  it('refuses a fifth task, counting those running and waiting', async () => {
    const h = harness();
    await h.workers.start('parent', { tasks: Array.from({ length: 3 }, (_, i) => task(i + 1)) });
    const r = await h.workers.start('parent', { tasks: [task(7), task(8)] });
    expect(r.isError).toBe(true);
    expect(r.text).toContain('at most 4');
    expect(h.opened).toHaveLength(MAX_ACTIVE_WORKERS);
  });

  it('refuses empty, missing and oversized input', async () => {
    const h = harness();
    for (const input of [{}, { tasks: [] }, { tasks: [{ instruction: '', url: 'https://a.example' }] }, { tasks: [{ instruction: 'x'.repeat(4_001), url: 'https://a.example' }] }, { tasks: Array.from({ length: 5 }, (_, i) => task(i + 1)) }]) {
      expect((await h.workers.start('parent', input)).isError).toBe(true);
    }
    expect(h.opened).toHaveLength(0);
  });

  it('does not let a worker start workers', async () => {
    const h = harness();
    await h.workers.start('parent', { tasks: [task(1)] });
    expect(await h.workers.isWorker('conv-1')).toBe(true);
    const r = await h.workers.start('conv-1', { tasks: [task(2)] });
    expect(r.isError).toBe(true);
    expect(r.text).toContain('cannot start more workers');
    expect(h.opened).toHaveLength(1);
  });

  it('records a worker that cannot start as failed without stopping the others', async () => {
    let calls = 0;
    const h = harness({ open: async () => { calls++; if (calls === 2) throw new Error('run limit'); return { conversationId: `c${calls}`, windowId: calls }; } });
    const r = parse(await h.workers.start('parent', { tasks: [task(1), task(2), task(3)] }));
    expect(r.started.map((s: { state: string }) => s.state)).toEqual(['running', 'failed', 'running']);
    expect(r.started[1].note).toContain('run limit');
  });
});

describe('collecting results', () => {
  it('returns finished results compactly and never the running workers results', async () => {
    const h = harness();
    await h.workers.start('parent', { tasks: [task(1), task(2)] });
    await h.workers.ended('conv-1', { status: 'done', outcome: 'success', result: 'Competitor 1 charges 10 euro. https://c1.example/pricing' });
    const s = parse(await h.workers.status('parent', 0));
    expect(s.workers[0]).toMatchObject({ state: 'completed', outcome: 'success', result: expect.stringContaining('10 euro') });
    expect(s.workers[1]).toMatchObject({ state: 'running' });
    expect(s.workers[1].result).toBeUndefined();
    expect(h.closed).toEqual([101]);
  });

  it('truncates a long result and maps each ending to a state', async () => {
    const h = harness();
    await h.workers.start('parent', { tasks: [task(1), task(2), task(3)] });
    await h.workers.ended('conv-1', { status: 'done', outcome: 'partial', result: 'x'.repeat(20_000) });
    await h.workers.ended('conv-2', { status: 'failed', reason: 'The run failed.' });
    await h.workers.ended('conv-3', { status: 'stopped' });
    const s = parse(await h.workers.status('parent', 0)).workers;
    expect(s.map((w: { state: string }) => w.state)).toEqual(['completed', 'failed', 'cancelled']);
    expect(s[0].result.length).toBe(6_000);
    expect(s[1].result).toBe('The run failed.');
  });

  it('waits for a change, up to the limit, and stops waiting as soon as something finishes', async () => {
    const h = harness();
    await h.workers.start('parent', { tasks: [task(1)] });
    // Nothing changes: it waits out the limit (2 s of the harness clock) and answers with the running worker.
    const none = parse(await h.workers.status('parent', 2));
    expect(none.workers[0].state).toBe('running');
    // Finishing while another status call waits ends that wait.
    const h2 = harness();
    await h2.workers.start('parent', { tasks: [task(1)] });
    const pending = h2.workers.status('parent', 15);
    await h2.workers.ended('conv-1', { status: 'done', outcome: 'success', result: 'ok' });
    expect(parse(await pending).workers[0].state).toBe('completed');
  });
});

describe('stopping', () => {
  it('stopping the parent stops its running workers and keeps the finished ones', async () => {
    const h = harness();
    await h.workers.start('parent', { tasks: [task(1), task(2), task(3)] });
    await h.workers.ended('conv-1', { status: 'done', outcome: 'success', result: 'done early' });
    await h.workers.cancelFor('parent', 'Stopped by the parent task.');
    expect(h.stopped.sort()).toEqual(['conv-2', 'conv-3']);
    const s = parse(await h.workers.status('parent', 0)).workers;
    expect(s.map((w: { state: string }) => w.state)).toEqual(['completed', 'cancelled', 'cancelled']);
    expect(s[0].result).toBe('done early');
    expect(h.closed.sort()).toEqual([101, 102, 103]);
  });

  it('a closed worker window fails only that worker', async () => {
    const h = harness();
    await h.workers.start('parent', { tasks: [task(1), task(2)] });
    await h.workers.windowClosed(102);
    const s = parse(await h.workers.status('parent', 0)).workers;
    expect(s.map((w: { state: string }) => w.state)).toEqual(['running', 'failed']);
    expect(h.stopped).toEqual(['conv-2']);
  });

  it('a late ending after a stop changes nothing', async () => {
    const h = harness();
    await h.workers.start('parent', { tasks: [task(1)] });
    await h.workers.cancelFor('parent', 'Stopped by the parent task.');
    await h.workers.ended('conv-1', { status: 'done', outcome: 'success', result: 'too late' });
    expect(parse(await h.workers.status('parent', 0)).workers[0]).toMatchObject({ state: 'cancelled', result: 'Stopped by the parent task.' });
  });
});

describe('survives a restart of the extension worker', () => {
  it('reads its table back from storage and finishes a job it did not start in this session', async () => {
    const first = harness();
    await first.workers.start('parent', { tasks: [task(1)] });
    const second = new ParallelWorkers({
      now: () => 2_000_000, newId: () => 'x', load: async () => first.stored.jobs, save: async jobs => { first.stored.jobs = jobs; },
      open: async () => ({ conversationId: 'n' }), stop: () => undefined, closeWindow: async () => undefined, refuse: () => null, wait: async () => undefined,
    });
    expect(await second.isWorker('conv-1')).toBe(true);
    await second.ended('conv-1', { status: 'done', outcome: 'success', result: 'after restart' });
    expect(parse(await second.status('parent', 0)).workers[0]).toMatchObject({ state: 'completed', result: 'after restart' });
  });

  it('drops old finished jobs and keeps recent ones', async () => {
    const h = harness();
    await h.workers.start('parent', { tasks: [task(1)] });
    await h.workers.ended('conv-1', { status: 'done', outcome: 'success', result: 'old' });
    h.tick(25 * 3_600_000);
    await h.workers.start('parent', { tasks: [task(2)] });
    expect(Object.values(h.stored.jobs).map(j => j.instruction)).toEqual(['Research competitor 2']);
  });
});
