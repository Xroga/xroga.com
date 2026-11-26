import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { ScriptedModel, resolveProfile } from '@src/llm';
import { appendEntry, createConversation, activeBranch } from '@src/store/conversations';
import { closeDb } from '@src/store/db';
import { AgentLoop } from '../loop';
import { toolsForRun } from '../tools';
import { FIND_SKILL_TOOL, READ_SKILL_TOOL } from '../skill-catalog';
import { setPoolBinLoader } from '../aas-skills';
import index from '../data/aas-index.json';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FetchLike } from '../well-known-skills';
import { FakeHost, FakeLayer, ok } from '../testing/fake-layer';

afterEach(async () => {
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
});


async function run(url: string, replies: Array<{ toolCalls: Array<{ name: string; input: unknown; id: string }> }>, layer: FakeLayer, siteFetch?: FetchLike, onlineSkills?: boolean, turnCap = 8) {
  const c = await createConversation({ mode: 'ask' });
  await appendEntry(c.id, { type: 'message', message: { role: 'user', parts: [{ type: 'text', text: 'Do the task' }] } });
  layer.tabsData = { tabs: [{ tabId: 1, url, title: 't', active: true }], activeTabId: 1 } as never;
  const scripted = new ScriptedModel(replies);
  const loop = new AgentLoop({
    conversationId: c.id, runId: 'r',
    model: { ref: { providerId: 'p', model: 'm' }, chat: scripted.chat(), profile: resolveProfile({ kind: 'openai-compatible', modelName: 'm' }), reasoning: 'none' },
    system: 's', tools: [...toolsForRun({ vision: true, pointAt: true }), FIND_SKILL_TOOL, READ_SKILL_TOOL], layer, host: new FakeHost(),
    signal: new AbortController().signal, emit: () => undefined, turnCap, siteFetch, onlineSkills,
  });
  await loop.run();
  const results = (await activeBranch(c.id)).flatMap(e => (e.type === 'message' && e.message.role === 'tool' ? e.message.parts : [])).filter(p => p.type === 'tool-result') as Array<{ toolName: string; text: string; isError?: boolean }>;
  return { results, scripted };
}
const done = { toolCalls: [{ name: 'done', input: { outcome: 'success', summary: 'ok' }, id: 'd' }] };
const snap = () => ({ ok: true, text: 'button "Go"', page: { tabId: 1, url: '', title: 't', rev: 3 } as never });
const bin = readFileSync(resolve(__dirname, '../../../public/pool/skills.bin'));

describe('the pool inside the agent loop', () => {
  it('find_skill offers pool skills for a specific task, read_skill opens one from the bundle with no network, and a request with no fit offers nothing', async () => {
    setPoolBinLoader(async () => new Uint8Array(bin));
    const down: FetchLike = async () => { throw new Error('the network must not be used'); };
    const { results } = await run('https://example.test/', [
      { toolCalls: [{ name: 'find_skill', id: 'f1', input: { query: 'automate a browser test with playwright' } }] },
      { toolCalls: [{ name: 'read_skill', id: 'r1', input: { id: 'online:aas:playwright-skill' } }] },
      { toolCalls: [{ name: 'find_skill', id: 'f2', input: { query: 'wait for a page to load and click login' } }] },
      done,
    ], new FakeLayer({ snapshot: snap }), down);
    const find1 = results.find(r => r.toolName === 'find_skill')!;
    expect(find1.text).toContain('online:aas:playwright-skill');
    expect(find1.text).toContain('Professional skill pool');
    const read = results.find(r => r.toolName === 'read_skill')!;
    expect(read.isError).toBe(false);
    expect(read.text).toMatch(/UNVERIFIED third-party text/);
    expect(read.text.length).toBeGreaterThan(500);
    const find2 = results.filter(r => r.toolName === 'find_skill')[1]!;
    expect(find2.text).not.toContain('Professional skill pool');
  });

  it('forty skills spread across the whole pool each open through the loop', async () => {
    setPoolBinLoader(async () => new Uint8Array(bin));
    const rows = (index as unknown as { rows: Array<[string, ...unknown[]]> }).rows.filter(r => ((r[6] as number | undefined) ?? -1) >= 0);
    const picks = Array.from({ length: 40 }, (_, i) => rows[Math.floor((i * rows.length) / 40)]![0]);
    const replies = [...picks.map((id, i) => ({ toolCalls: [{ name: 'read_skill', id: 'r' + i, input: { id: 'online:aas:' + id } }] })), done];
    const { results } = await run('https://example.test/', replies, new FakeLayer({ snapshot: snap }), undefined, undefined, 60);
    const reads = results.filter(r => r.toolName === 'read_skill');
    expect(reads).toHaveLength(40);
    expect(reads.filter(r => r.isError || r.text.length < 300).map(r => r.text.slice(0, 80))).toEqual([]);
  }, 120_000);
});
