import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { ScriptedModel, resolveProfile } from '@src/llm';
import { appendEntry, createConversation, activeBranch } from '@src/store/conversations';
import { closeDb } from '@src/store/db';
import { AgentLoop } from '../loop';
import { toolsForRun } from '../tools';
import { FakeHost, FakeLayer } from '../testing/fake-layer';

afterEach(async () => { await closeDb(); globalThis.indexedDB = new IDBFactory(); });

type Step = { toolCalls: Array<{ name: string; input: unknown; id: string }> };
async function run(steps: Step[]) {
  const c = await createConversation({ mode: 'ask' });
  await appendEntry(c.id, { type: 'message', message: { role: 'user', parts: [{ type: 'text', text: 'Draw a shape' }] } });
  const layer = new FakeLayer({ snapshot: () => ({ ok: true, text: 'canvas', page: { tabId: 1, url: 'https://x.example.test/', title: 't', rev: 1 } as never }) });
  layer.tabsData = { tabs: [{ tabId: 1, url: 'https://x.example.test/', title: 't', active: true }], activeTabId: 1 } as never;
  const scripted = new ScriptedModel(steps);
  const loop = new AgentLoop({
    conversationId: c.id, runId: 'r',
    model: { ref: { providerId: 'p', model: 'm' }, chat: scripted.chat(), profile: resolveProfile({ kind: 'openai-compatible', modelName: 'm' }), reasoning: 'none' },
    system: 's', tools: toolsForRun({ vision: true, pointAt: true }), layer, host: new FakeHost(),
    signal: new AbortController().signal, emit: () => undefined, turnCap: 8,
  });
  const end = await loop.run();
  const results = (await activeBranch(c.id)).flatMap(e => (e.type === 'message' && e.message.role === 'tool' ? e.message.parts : [])).filter(p => p.type === 'tool-result') as Array<{ toolName: string; text: string; isError?: boolean }>;
  return { end, results };
}
const snap = { toolCalls: [{ name: 'snapshot', input: {}, id: 's' }] };
const giveUp = (id: string, summary = 'The menu could not be clicked.') => ({ toolCalls: [{ name: 'done', input: { outcome: 'failed', summary }, id }] });

describe('giving up', () => {
  it('is questioned once when other methods are untried, and the second done is accepted', async () => {
    const { end, results } = await run([snap, giveUp('d1'), giveUp('d2')]);
    const dones = results.filter(r => r.toolName === 'done');
    expect(dones[0]!.isError).toBe(true);
    expect(dones[0]!.text).toContain('materially different');
    expect(dones[0]!.text).toContain('canvas');
    expect(end.outcome).toBe('failed');
  });
  it('lets a genuine blocker stop at once', async () => {
    const { results } = await run([snap, giveUp('d1', 'The page needs a login and password that only the user has.')]);
    expect(results.filter(r => r.toolName === 'done')[0]!.isError).toBeFalsy();
  });
  it('does not challenge success', async () => {
    const { results } = await run([snap, { toolCalls: [{ name: 'done', input: { outcome: 'success', summary: 'ok' }, id: 'd' }] }]);
    expect(results.filter(r => r.toolName === 'done')[0]!.isError).toBeFalsy();
  });
});
