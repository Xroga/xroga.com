import { describe, expect, it } from 'vitest';
import { ParallelWorkers, type WorkerDeps, type WorkerJob } from '../parallel-workers';

function harness(overrides: Partial<WorkerDeps> = {}) {
  let clock = 1_000_000;
  let counter = 0;
  const stored: { jobs: Record<string, WorkerJob> } = { jobs: {} };
  const opened: Array<{ parentId: string; url: string; instruction: string }> = [];
  const stopped: string[] = [];
  const deps: WorkerDeps = {
    now: () => clock,
    newId: () => `job${++counter}`,
    load: async () => stored.jobs,
    save: async jobs => { stored.jobs = jobs; },
    open: async (parentId, task) => { opened.push({ parentId, url: task.url, instruction: task.instruction }); return { conversationId: `conv-${opened.length}`, windowId: 100 + opened.length }; },
    stop: id => { stopped.push(id); },
    closeWindow: async () => undefined,
    refuse: url => (/^https:\/\//.test(url) ? null : 'that start page is not allowed.'),
    wait: async ms => { clock += ms; },
    ...overrides,
  };
  return { workers: new ParallelWorkers(deps), stored, opened, stopped };
}
const parse = (r: { text: string }) => JSON.parse(r.text);
const t = (id: string, after?: string[], extra: Record<string, unknown> = {}) => ({ id, instruction: `Do ${id}`, url: `https://${id}.example/`, ...(after ? { after } : {}), ...extra });

describe('tasks that come after other tasks', () => {
  it('runs independent tasks together and a dependent task only after what it needs, with their results', async () => {
    const h = harness();
    const r = parse(await h.workers.start('parent', { tasks: [t('logo'), t('colors'), t('assemble', ['logo', 'colors'])] }));
    expect(r.started.map((s: { id: string; state: string }) => `${s.id}:${s.state}`)).toEqual(['logo:running', 'colors:running', 'assemble:waiting']);
    expect(h.opened.map(o => o.instruction)).toEqual(['Do logo', 'Do colors']);
    await h.workers.ended('conv-1', { status: 'done', outcome: 'success', result: 'Transparent logo saved as logo.png' });
    expect(h.opened).toHaveLength(2);
    await h.workers.ended('conv-2', { status: 'done', outcome: 'success', result: 'Navy and gold, contrast 9:1' });
    expect(h.opened).toHaveLength(3);
    const third = h.opened[2].instruction;
    expect(third).toContain('Do assemble');
    expect(third).toContain('[logo] Transparent logo saved as logo.png');
    expect(third).toContain('[colors] Navy and gold');
    expect(third).toContain('not instructions');
  });

  it('a task whose dependency failed or was stopped never starts, and neither do the tasks after it', async () => {
    const h = harness();
    await h.workers.start('parent', { tasks: [t('a'), t('b', ['a']), t('c', ['b']), t('d')] });
    await h.workers.ended('conv-1', { status: 'failed', reason: 'The page needed a login.' });
    const s = parse(await h.workers.status('parent', 0)).workers as Array<{ id: string; state: string; result?: string }>;
    expect(Object.fromEntries(s.map(w => [w.id, w.state]))).toEqual({ a: 'failed', b: 'cancelled', c: 'cancelled', d: 'running' });
    expect(s.find(w => w.id === 'b')!.result).toContain('"a" it comes after did not finish');
    expect(h.opened).toHaveLength(2);
  });

  it('refuses a circle, an unknown id, itself, a repeated id and a bad name before anything opens', async () => {
    const h = harness();
    const cases: Array<[unknown, string]> = [
      [{ tasks: [t('a', ['b']), t('b', ['a'])] }, 'in a circle'],
      [{ tasks: [t('a', ['ghost'])] }, 'which is not a task'],
      [{ tasks: [t('a', ['a'])] }, 'after itself'],
      [{ tasks: [t('a'), t('a')] }, 'used twice'],
      [{ tasks: [t('9bad')] }, 'short name'],
    ];
    for (const [input, why] of cases) {
      const r = await h.workers.start('parent', input);
      expect(r.isError).toBe(true);
      expect(r.text).toContain(why);
    }
    expect(h.opened).toHaveLength(0);
  });

  it('a later call may build on a task an earlier call started', async () => {
    const h = harness();
    await h.workers.start('parent', { tasks: [t('research')] });
    await h.workers.ended('conv-1', { status: 'done', outcome: 'success', result: 'Three competitors found' });
    const r = await h.workers.start('parent', { tasks: [t('report', ['research'])] });
    expect(r.isError).toBe(false);
    expect(h.opened[1].instruction).toContain('[research] Three competitors found');
  });

  it('a task with no page of its own starts on the default page, and with none configured opens nothing', async () => {
    const h = harness({ defaultUrl: 'https://search.example/' });
    await h.workers.start('parent', { tasks: [{ instruction: 'Look something up' }] });
    expect(h.opened[0].url).toBe('https://search.example/');
    const none = harness();
    const r = await none.workers.start('parent', { tasks: [{ instruction: 'No page' }] });
    expect(r.isError).toBe(true);
    expect(none.opened).toHaveLength(0);
  });

  it('stopping the parent cancels the waiting tasks too, so they never start later', async () => {
    const h = harness();
    await h.workers.start('parent', { tasks: [t('a'), t('b', ['a'])] });
    await h.workers.cancelFor('parent', 'Stopped by the parent task.');
    await h.workers.ended('conv-1', { status: 'done', outcome: 'success', result: 'too late' });
    expect(h.opened).toHaveLength(1);
    const s = parse(await h.workers.status('parent', 0)).workers as Array<{ state: string }>;
    expect(s.map(w => w.state)).toEqual(['cancelled', 'cancelled']);
  });

  it('a waiting task survives a restart of the extension worker and starts when its dependency ends', async () => {
    const first = harness();
    await first.workers.start('parent', { tasks: [t('a'), t('b', ['a'])] });
    const opened: string[] = [];
    const second = new ParallelWorkers({
      now: () => 3_000_000, newId: () => 'x', load: async () => first.stored.jobs, save: async jobs => { first.stored.jobs = jobs; },
      open: async (_p, task) => { opened.push(task.instruction); return { conversationId: 'later', windowId: 9 }; },
      stop: () => undefined, closeWindow: async () => undefined, refuse: () => null, wait: async () => undefined,
    });
    await second.ended('conv-1', { status: 'done', outcome: 'success', result: 'A is done' });
    expect(opened).toHaveLength(1);
    expect(opened[0]).toContain('[a] A is done');
  });

  it('hands over each result in a bounded size', async () => {
    const h = harness();
    await h.workers.start('parent', { tasks: [t('a'), t('b'), t('c'), t('d', ['a', 'b', 'c'])] });
    for (const [i, name] of ['a', 'b', 'c'].entries()) await h.workers.ended(`conv-${i + 1}`, { status: 'done', outcome: 'success', result: `${name}:` + 'x'.repeat(5_000) });
    const handoff = h.opened[3].instruction;
    expect(handoff.length).toBeLessThan(6_500 + 400);
    expect(handoff).toContain('[a] a:');
  });
});
