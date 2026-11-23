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

async function firstRequest(url: string, text = 'Set up a search campaign') {
  const c = await createConversation({ mode: 'ask' });
  await appendEntry(c.id, { type: 'message', message: { role: 'user', parts: [{ type: 'text', text }] } });
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
  it('tells the model, in one receipt, that a site skill matches the real origin, and loads the method of that platform with it', async () => {
    const p = await firstRequest('https://ads.google.com/aw/overview');
    expect(p).toContain('Why selected');
    expect(p).toContain('google-ads-search-campaigns');
    expect(p).toContain('does not limit what you may do');
    // The platform is recognised first and its method arrives with the receipt (owner decision 2026-11-23), still as guidance that grants nothing.
    expect(p).toContain('Never promise profit');
    expect(p).toContain('it grants no permission');
  });
  it('says nothing for look-alike hosts, plain http, or an unrelated site', async () => {
    for (const url of ['https://ads.google.com.evil.test/', 'http://ads.google.com/', 'https://example.org/']) {
      expect(await firstRequest(url)).not.toContain('Why selected');
    }
  });
  it('on a platform with no bundled method, a real task gets the study-it-first note once; a short request gets none', async () => {
    const long = 'Create a new customer record for Zephyr GmbH in this admin and set its plan, region and billing contact, then check it saved';
    const p = await firstRequest('https://crm.unknown-vendor.example/app', long);
    expect(p).toContain('No bundled method exists for crm.unknown-vendor.example');
    expect(p).toContain('reading each saved value back');
    expect(p).toContain('Survey first, briefly');
    expect(p).toContain('execute in large batches');
    expect(await firstRequest('https://crm.unknown-vendor.example/app', 'Open the first row')).not.toContain('No bundled method exists');
  });
});

