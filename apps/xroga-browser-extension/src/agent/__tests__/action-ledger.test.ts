import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { ScriptedModel, resolveProfile } from '@src/llm';
import { appendEntry, createConversation, activeBranch } from '@src/store/conversations';
import { closeDb } from '@src/store/db';
import { AgentLoop } from '../loop';
import { toolsForRun } from '../tools';
import { FakeHost, FakeLayer, ok, receipt } from '../testing/fake-layer';
import { mayApplyRow, reduce } from '@src/side-panel/state';
import type { PanelState } from '@src/side-panel/state';
import type { DisplayEntry, ToolRow } from '@src/ui/protocol';

afterEach(async () => {
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
});

type Step = { toolCalls: Array<{ name: string; input: unknown; id: string }> };
const page = (rev: number) => ({ tabId: 7, url: 'https://x/', title: 'X', rev, changed: 'diff' as const });

async function run(steps: Step[], layer: FakeLayer) {
  const c = await createConversation({ mode: 'ask' });
  await appendEntry(c.id, { type: 'message', message: { role: 'user', parts: [{ type: 'text', text: 'Task' }] } });
  const events: Array<{ type: string; row?: ToolRow }> = [];
  const loop = new AgentLoop({
    conversationId: c.id, runId: 'run-9',
    model: { ref: { providerId: 'p', model: 'm' }, chat: new ScriptedModel(steps).chat(), profile: resolveProfile({ kind: 'openai-compatible', modelName: 'm' }), reasoning: 'none' },
    system: 's', tools: toolsForRun({ vision: false }), layer, host: new FakeHost(),
    signal: new AbortController().signal, emit: e => { events.push(e as never); }, turnCap: 6,
  });
  await loop.run();
  const stored = (await activeBranch(c.id)).filter(e => e.type === 'message' && e.message.role === 'tool') as unknown as Array<{ message: { parts: Array<{ toolCallId?: string }> }; result?: { receipt?: { actionId?: string } } }>;
  return { events, stored };
}

describe('one identity for an action', () => {
  it('rows carry the action id, a rising sequence, the tab and the page revision; the stored receipt carries the same id', async () => {
    const layer = new FakeLayer({
      click: () => ok('click · [a1] button «Save»', { receipt: receipt(), page: page(4) }),
      snapshot: () => ok('Controls: [a1] button "Save"', { page: page(3) }),
    });
    const { events, stored } = await run([
      { toolCalls: [{ name: 'snapshot', input: {}, id: 's1' }] },
      { toolCalls: [{ name: 'click', input: { target: { ref: 'a1' } }, id: 'c1' }] },
      { toolCalls: [{ name: 'done', input: { outcome: 'success', summary: 'ok' }, id: 'd' }] },
    ], layer);
    const rows = events.filter(e => e.row && e.row.tool === 'click').map(e => e.row!);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.every(r => r.actionId === 'run-9:c1')).toBe(true);
    const seqs = rows.map(r => r.seq!);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(seqs.length);
    const end = rows.at(-1)!;
    expect(end.status).toBe('done');
    expect(end.tabId).toBe(7);
    expect(end.epoch).toBe(4);
    const all = events.filter(e => e.row).map(e => e.row!.seq!);
    expect(new Set(all).size).toBe(all.length);
    const entry = stored.find(e => e.message.parts.some(p => p.toolCallId === 'c1'))!;
    expect(entry.result?.receipt?.actionId).toBe('run-9:c1');
  });
});

const row = (over: Partial<ToolRow>): ToolRow => ({ toolCallId: 'c1', tool: 'click', args: {}, status: 'running', ...over });
const stateWith = (r: ToolRow): PanelState => ({
  loaded: true, conversationId: 'k', conversation: null, live: null, status: 'running', startedAt: undefined, queue: [], prompts: [], streaming: null, error: null, history: [], tabs: [], selections: [], attached: [],
  entries: [{ kind: 'assistant', id: 'm1', tools: [r] } as unknown as DisplayEntry],
} as unknown as PanelState);
const shown = (s: PanelState): ToolRow => (s.entries[0] as unknown as { tools: ToolRow[] }).tools[0]!;

describe('the panel does not let a late or replayed event undo a result', () => {
  it('applies only an event with a higher sequence', () => {
    expect(mayApplyRow(row({ seq: 5 }), row({ seq: 6 }))).toBe(true);
    expect(mayApplyRow(row({ seq: 5 }), row({ seq: 5 }))).toBe(false);
    expect(mayApplyRow(row({ seq: 5 }), row({ seq: 4 }))).toBe(false);
  });

  it('a late "running" after "done" changes nothing, with or without a sequence', () => {
    const doneRow = row({ status: 'done', seq: 8, text: 'clicked' });
    const afterLate = reduce(stateWith(doneRow), { type: 'tool_execution_update', messageId: 'm1', row: row({ status: 'running', seq: 7 }) } as never);
    expect(shown(afterLate).status).toBe('done');
    const old = row({ status: 'failed', text: 'stored' });
    const afterOld = reduce(stateWith(old), { type: 'tool_execution_update', messageId: 'm1', row: row({ status: 'running' }) } as never);
    expect(shown(afterOld).status).toBe('failed');
  });

  it('replaying the same end event twice leaves one row with the same content, and the real end still lands after a stale start', () => {
    let s = stateWith(row({ status: 'running', seq: 1 }));
    const end = { type: 'tool_execution_end', messageId: 'm1', row: row({ status: 'done', seq: 3, text: 'ok' }) } as never;
    s = reduce(reduce(s, end), end);
    expect((s.entries[0] as unknown as { tools: ToolRow[] }).tools).toHaveLength(1);
    expect(shown(s)).toMatchObject({ status: 'done', text: 'ok', seq: 3 });
    s = reduce(s, { type: 'tool_execution_start', messageId: 'm1', row: row({ status: 'running', seq: 2 }) } as never);
    expect(shown(s).status).toBe('done');
  });
});
