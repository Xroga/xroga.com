import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { ScriptedModel, resolveProfile } from '@src/llm';
import { appendEntry, createConversation, activeBranch } from '@src/store/conversations';
import { closeDb } from '@src/store/db';
import { AgentLoop } from '../loop';
import { toolsForRun } from '../tools';
import { PLAN_TOOL, type PlanSnapshot } from '../task-plan';
import { FakeHost, FakeLayer, ok } from '../testing/fake-layer';

afterEach(async () => {
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
});

const snap = () => ({ ok: true, text: 'button "Save"', page: { tabId: 1, url: 'https://shop.example.test/admin', title: 't', rev: 3 } as never });
const done = { toolCalls: [{ name: 'done', input: { outcome: 'success', summary: 'ok' }, id: 'd' }] };
type Step = { toolCalls: Array<{ name: string; input: unknown; id: string }> };

async function run(steps: Step[], layer: FakeLayer, preload?: PlanSnapshot) {
  const c = await createConversation({ mode: 'ask' });
  await appendEntry(c.id, { type: 'message', message: { role: 'user', parts: [{ type: 'text', text: 'Set up the store' }] } });
  if (preload) {
    await appendEntry(c.id, { type: 'message', message: { role: 'assistant', parts: [{ type: 'tool-call', toolCallId: 'p0', toolName: 'plan', input: {} }] } } as never);
    await appendEntry(c.id, { type: 'message', message: { role: 'tool', parts: [{ type: 'tool-result', toolCallId: 'p0', toolName: 'plan', text: 'x', isError: false, result: { ok: true, data: { plan: preload } } }] } } as never);
  }
  layer.tabsData = { tabs: [{ tabId: 1, url: 'https://shop.example.test/admin', title: 't', active: true }], activeTabId: 1 } as never;
  const scripted = new ScriptedModel(steps);
  const events: Array<{ type: string; row?: { tool: string; result?: { data?: { plan?: PlanSnapshot } } } }> = [];
  const loop = new AgentLoop({
    conversationId: c.id, runId: 'r',
    model: { ref: { providerId: 'p', model: 'm' }, chat: scripted.chat(), profile: resolveProfile({ kind: 'openai-compatible', modelName: 'm' }), reasoning: 'none' },
    system: 's', tools: [...toolsForRun({ vision: true, pointAt: true }), PLAN_TOOL], layer, host: new FakeHost(),
    signal: new AbortController().signal, emit: e => { events.push(e as never); }, turnCap: 8,
  });
  await loop.run();
  const results = (await activeBranch(c.id)).flatMap(e => (e.type === 'message' && e.message.role === 'tool' ? e.message.parts : [])).filter(p => p.type === 'tool-result') as Array<{ toolName: string; text: string; isError?: boolean }>;
  return { results, events };
}
const plans = (events: Array<{ row?: { tool: string; result?: { data?: { plan?: PlanSnapshot } } } }>) => events.filter(e => e.row?.tool === 'plan' && e.row.result?.data?.plan).map(e => e.row!.result!.data!.plan!);
const set = { toolCalls: [{ name: 'plan', id: 'p1', input: { action: 'set', milestones: [{ id: 'edit', title: 'Edit the product', check: { text: 'Saved' } }, { id: 'verify', title: 'Check the result' }] } }] };

describe('plan in a run', () => {
  it('a milestone with a check is verified only when the page shows it', async () => {
    const l = new FakeLayer({ snapshot: snap, wait: () => ok('wait · met') });
    const { results } = await run([set, { toolCalls: [{ name: 'plan', id: 'p2', input: { action: 'update', id: 'edit', status: 'done' } }] }, done], l);
    const r = results.filter(x => x.toolName === 'plan');
    expect(r[1]!.text).toContain('[x] edit');
    const l2 = new FakeLayer({ snapshot: snap, wait: () => ({ ok: false, text: 'timeout', error: { code: 'TIMEOUT', message: 'no' } } as never) });
    const r2 = await run([set, { toolCalls: [{ name: 'plan', id: 'p2', input: { action: 'update', id: 'edit', status: 'done' } }] }, done], l2);
    const u = r2.results.filter(x => x.toolName === 'plan')[1]!;
    expect(u.isError).toBe(true);
    expect(u.text).toContain('NOT verified');
  });
  it('a milestone without a check is only reported, never verified', async () => {
    const l = new FakeLayer({ snapshot: snap });
    const { results } = await run([set, { toolCalls: [{ name: 'plan', id: 'p2', input: { action: 'update', id: 'verify', status: 'done' } }] }, done], l);
    expect(results.filter(x => x.toolName === 'plan')[1]!.text).toContain('[?] verify');
  });
  it('a failing tool moves the working milestone to recovering, and the next success back to working', async () => {
    const l = new FakeLayer({ snapshot: snap, click: () => ({ ok: false, text: 'x', error: { code: 'NODE_DETACHED', message: 'stale' } } as never), wait: () => ok('wait · met') });
    const { events } = await run([set, { toolCalls: [{ name: 'click', id: 'c1', input: { target: { role: 'button', name: 'Save' } } }] }, { toolCalls: [{ name: 'wait', id: 'w1', input: { text: 'Saved' } }] }, done], l);
    const states = plans(events).map(p => p.milestones[0]!.status);
    expect(states).toContain('recovering');
    expect(states.at(-1)).toBe('working');
  });
  it('restores the plan from the conversation and rejects an invalid update', async () => {
    const pre: PlanSnapshot = { revision: 2, milestones: [{ id: 'edit', title: 'Edit the product', status: 'verified' }, { id: 'verify', title: 'Check', status: 'working' }] };
    const l = new FakeLayer({ snapshot: snap });
    const { results } = await run([{ toolCalls: [{ name: 'plan', id: 'p2', input: { action: 'update', id: 'nope', status: 'done' } }] }, { toolCalls: [{ name: 'plan', id: 'p3', input: { action: 'update', id: 'verify', status: 'blocked', note: 'needs login' } }] }, done], l, pre);
    const r = results.filter(x => x.toolName === 'plan');
    expect(r[1]!.isError).toBe(true);
    expect(r[2]!.text).toContain('[x] edit');
    expect(r[2]!.text).toContain('[#] verify');
  });
});

describe('plan milestones in a read-only run', () => {
  const failWait = () => ({ ok: false, text: 'timeout', error: { code: 'TIMEOUT', message: 'no' } }) as never;
  const research = { toolCalls: [{ name: 'plan', id: 'p1', input: { action: 'set', milestones: [{ id: 'find', title: 'Find the agencies', check: { text: 'Leeds' } }] } }] };
  const finish = { toolCalls: [{ name: 'plan', id: 'p3', input: { action: 'update', id: 'find', status: 'done' } }] };

  it('is verified by text the run has read, though that page is no longer open', async () => {
    const l = new FakeLayer({ snapshot: () => ({ ok: true, text: 'Top SEO agencies in Leeds: Alpha, Beta', page: { tabId: 1, url: 'https://x.test/list', title: 't', rev: 2 } as never }), wait: failWait });
    const { results } = await run([research, { toolCalls: [{ name: 'snapshot', id: 's1', input: {} }] }, finish, done], l);
    const p = results.filter(x => x.toolName === 'plan');
    expect(p[1]!.text).not.toContain('NOT verified');
  });

  it('is not verified by what was read once the run has changed a page', async () => {
    const l = new FakeLayer({
      snapshot: () => ({ ok: true, text: 'Top SEO agencies in Leeds', page: { tabId: 1, url: 'https://x.test/list', title: 't', rev: 2 } as never }),
      click: () => ok('clicked', { receipt: { effect: { verdict: 'changed', signals: [] } } as never }),
      wait: failWait,
    });
    const { results } = await run([research, { toolCalls: [{ name: 'snapshot', id: 's1', input: {} }] }, { toolCalls: [{ name: 'click', id: 'c1', input: { target: { ref: 'a1' } } }] }, finish, done], l);
    const p = results.filter(x => x.toolName === 'plan');
    expect(p[1]!.text).toContain('NOT verified');
  });
});
