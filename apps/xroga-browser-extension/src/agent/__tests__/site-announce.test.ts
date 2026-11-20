import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { ScriptedModel, resolveProfile } from '@src/llm';
import { appendEntry, createConversation } from '@src/store/conversations';
import { closeDb } from '@src/store/db';
import { AgentLoop } from '../loop';
import { toolsForRun } from '../tools';
import { FakeHost, FakeLayer } from '../testing/fake-layer';

afterEach(async () => {
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
});

async function firstRequest(url: string) {
  const c = await createConversation({ mode: 'ask' });
  await appendEntry(c.id, { type: 'message', message: { role: 'user', parts: [{ type: 'text', text: 'Set up a search campaign' }] } });
  const scripted = new ScriptedModel([{ toolCalls: [{ name: 'done', input: { outcome: 'success', summary: 'ok' }, id: 'd' }] }]);
  const layer = new FakeLayer({ snapshot: () => ({ ok: true, text: 'button "New campaign"', page: { tabId: 1, url, title: 'x', rev: 3 } as never }) });
  layer.tabsData = { tabs: [{ tabId: 1, url, title: 'x', active: true }], activeTabId: 1 } as never;
  const loop = new AgentLoop({
    conversationId: c.id, runId: 'r',
    model: { ref: { providerId: 'p', model: 'm' }, chat: scripted.chat(), profile: resolveProfile({ kind: 'openai-compatible', modelName: 'm' }), reasoning: 'none' },
    system: 's', tools: toolsForRun({ vision: true }), layer, host: new FakeHost(), signal: new AbortController().signal, emit: () => undefined, turnCap: 3,
  });
  await loop.run();
  return JSON.stringify(scripted.calls[0]?.prompt ?? '');
}

describe('site recognition at the start of a run', () => {
  it('tells the model, in one receipt, that a site skill matches the real origin, without loading the skill', async () => {
    const p = await firstRequest('https://ads.google.com/aw/overview');
    expect(p).toContain('Why selected');
    expect(p).toContain('google-ads-search-campaigns');
    expect(p).toContain('does not limit what you may do');
    expect(p).not.toContain('Never promise profit');
  });
  it('says nothing for look-alike hosts, plain http, or an unrelated site', async () => {
    for (const url of ['https://ads.google.com.evil.test/', 'http://ads.google.com/', 'https://example.org/']) {
      expect(await firstRequest(url)).not.toContain('Why selected');
    }
  });
});
