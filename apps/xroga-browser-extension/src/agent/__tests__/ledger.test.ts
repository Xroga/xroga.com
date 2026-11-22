import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { ScriptedModel, resolveProfile } from '@src/llm';
import { appendEntry, createConversation, activeBranch } from '@src/store/conversations';
import { closeDb } from '@src/store/db';
import { AgentLoop } from '../loop';
import { toolsForRun } from '../tools';
import { PLAN_TOOL, TaskPlan, type PlanSnapshot } from '../task-plan';
import { FakeHost, FakeLayer, ok } from '../testing/fake-layer';

afterEach(async () => {
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
});

describe('the batch list of a plan', () => {
  it('refuses an empty list and a duplicate item, and keeps the state of an item that keeps its name', () => {
    const p = new TaskPlan();
    expect(p.setItems([])).toContain('non-empty');
    expect(p.setItems(['a@x.test', 'b@x.test', 'a@x.test'])).toContain('listed twice');
    expect(p.setItems(['a@x.test', 'b@x.test'])).toBeNull();
    expect(p.markItems(['a@x.test'], 'saved', 1)).toBeNull();
    expect(p.setItems(['a@x.test', 'c@x.test'])).toBeNull();
    expect(p.snapshot().ledger!.map(i => `${i.key}:${i.status}`)).toEqual(['a@x.test:saved', 'c@x.test:pending']);
  });

  it('verifies an item only after it was saved and a page has loaded since', () => {
    const p = new TaskPlan();
    p.setItems(['a', 'b']);
    expect(p.markItems(['a'], 'verified', 5)).toContain('mark an item saved first');
    p.markItems(['a'], 'saved', 5);
    expect(p.markItems(['a'], 'verified', 5)).toContain('no page has loaded since');
    expect(p.markItems(['a'], 'verified', 6)).toBeNull();
    expect(p.snapshot().ledger![0]!.status).toBe('verified');
    expect(p.markItems(['zzz'], 'saved', 6)).toContain('not in the list');
  });

  it('counts only what is verified and names what is not', () => {
    const p = new TaskPlan();
    p.setItems(['a', 'b', 'c', 'd']);
    p.markItems(['a', 'b'], 'saved', 1);
    p.markItems(['a'], 'verified', 2);
    p.markItems(['c'], 'failed', 2, 'editor closed');
    const s = p.ledgerSummary();
    expect(s).toContain('1 of 4 verified');
    expect(s).toContain('1 saved but not yet verified');
    expect(s).toContain('1 failed');
    expect(s).toContain('Not done: b, c, d');
    expect(p.ledgerOpen().map(i => i.key)).toEqual(['b', 'c', 'd']);
  });

  it('survives a snapshot and restore', () => {
    const p = new TaskPlan();
    p.setItems(['a', 'b']);
    p.markItems(['a'], 'saved', 3);
    const q = TaskPlan.restore(JSON.parse(JSON.stringify(p.snapshot())) as PlanSnapshot);
    expect(q.hasLedger).toBe(true);
    expect(q.ledgerSummary()).toBe(p.ledgerSummary());
  });
});

const snap = () => ({ ok: true, text: 'Drafts', page: { tabId: 1, url: 'https://mail.example.test/', title: 't', rev: 3 } as never });
type Step = { toolCalls: Array<{ name: string; input: unknown; id: string }> };
const plan = (input: unknown, id: string): Step => ({ toolCalls: [{ name: 'plan', input, id }] });
const doneSuccess: Step = { toolCalls: [{ name: 'done', input: { outcome: 'success', summary: 'All drafts are saved.' }, id: 'd' }] };

async function run(steps: Step[], layer: FakeLayer, preload?: PlanSnapshot) {
  const c = await createConversation({ mode: 'ask' });
  await appendEntry(c.id, { type: 'message', message: { role: 'user', parts: [{ type: 'text', text: 'Draft the emails' }] } });
  if (preload) {
    await appendEntry(c.id, { type: 'message', message: { role: 'assistant', parts: [{ type: 'tool-call', toolCallId: 'p0', toolName: 'plan', input: {} }] } } as never);
    await appendEntry(c.id, { type: 'message', message: { role: 'tool', parts: [{ type: 'tool-result', toolCallId: 'p0', toolName: 'plan', text: 'x', isError: false, result: { ok: true, data: { plan: preload } } }] } } as never);
  }
  layer.tabsData = { tabs: [{ tabId: 1, url: 'https://mail.example.test/', title: 't', active: true }], activeTabId: 1 } as never;
  const scripted = new ScriptedModel(steps);
  const loop = new AgentLoop({
    conversationId: c.id, runId: 'r',
    model: { ref: { providerId: 'p', model: 'm' }, chat: scripted.chat(), profile: resolveProfile({ kind: 'openai-compatible', modelName: 'm' }), reasoning: 'none' },
    system: 's', tools: [...toolsForRun({ vision: true, pointAt: true }), PLAN_TOOL], layer, host: new FakeHost(),
    signal: new AbortController().signal, emit: () => undefined, turnCap: 12,
  });
  const end = await loop.run();
  const results = (await activeBranch(c.id)).flatMap(e => (e.type === 'message' && e.message.role === 'tool' ? e.message.parts : [])).filter(p => p.type === 'tool-result') as Array<{ toolName: string; text: string; isError?: boolean }>;
  return { results, end };
}

describe('the batch list in a run', () => {
  const items = plan({ action: 'items', keys: ['a@x.test', 'b@x.test'] }, 'i1');

  it('verified is refused before a reload, and accepted after one when the page shows the item', async () => {
    const l = new FakeLayer({ snapshot: snap, wait: () => ok('wait · met'), navigate: () => ok('navigate · reloaded') });
    const { results } = await run([
      items,
      plan({ action: 'mark', keys: ['a@x.test'], status: 'saved' }, 'm1'),
      plan({ action: 'mark', keys: ['a@x.test'], status: 'verified', check: { text: 'a@x.test' } }, 'm2'),
      { toolCalls: [{ name: 'navigate', input: { action: 'reload' }, id: 'n1' }] },
      plan({ action: 'mark', keys: ['a@x.test'], status: 'verified', check: { text: 'a@x.test' } }, 'm3'),
      { toolCalls: [{ name: 'done', input: { outcome: 'partial', summary: 'one done' }, id: 'd' }] },
    ], l);
    const p = results.filter(r => r.toolName === 'plan');
    expect(p[2]!.isError).toBe(true);
    expect(p[2]!.text).toContain('no page has loaded since');
    expect(p[3]!.isError).toBeFalsy();
    expect(p[3]!.text).toContain('1 of 2 verified');
  });

  it('verified needs a check that the page shows now', async () => {
    const l = new FakeLayer({ snapshot: snap, wait: () => ({ ok: false, text: 'timeout', error: { code: 'TIMEOUT', message: 'no' } } as never), navigate: () => ok('navigate · reloaded') });
    const { results } = await run([
      items,
      plan({ action: 'mark', keys: ['a@x.test'], status: 'saved' }, 'm1'),
      { toolCalls: [{ name: 'navigate', input: { action: 'reload' }, id: 'n1' }] },
      plan({ action: 'mark', keys: ['a@x.test'], status: 'verified' }, 'm2'),
      plan({ action: 'mark', keys: ['a@x.test'], status: 'verified', check: { text: 'a@x.test' } }, 'm3'),
      { toolCalls: [{ name: 'done', input: { outcome: 'partial', summary: 'x' }, id: 'd' }] },
    ], l);
    const p = results.filter(r => r.toolName === 'plan');
    expect(p[2]!.text).toContain('needs check');
    expect(p[3]!.text).toContain('not verified');
  });

  it('success is refused while an item is not verified, and the second try ends the run as partial with the counts', async () => {
    const l = new FakeLayer({ snapshot: snap });
    const { end, results } = await run([items, plan({ action: 'mark', keys: ['a@x.test'], status: 'saved' }, 'm1'), doneSuccess, doneSuccess], l);
    expect(results.filter(r => r.toolName === 'done')[0]!.text).toContain('Not accepted as success');
    expect(end.outcome).toBe('partial');
    expect(JSON.stringify(end)).toContain('0 of 2 verified');
  });

  it('a restored run still knows which items are done, so keep going does not repeat them', async () => {
    const pre: PlanSnapshot = { revision: 3, milestones: [], ledger: [{ key: 'a@x.test', status: 'verified' }, { key: 'b@x.test', status: 'pending' }] };
    const l = new FakeLayer({ snapshot: snap });
    const { results } = await run([plan({ action: 'items', keys: ['a@x.test', 'b@x.test', 'c@x.test'] }, 'i2'), { toolCalls: [{ name: 'done', input: { outcome: 'partial', summary: 'x' }, id: 'd' }] }], l, pre);
    expect(results.filter(r => r.toolName === 'plan')[1]!.text).toContain('1 of 3 verified');
  });
});
