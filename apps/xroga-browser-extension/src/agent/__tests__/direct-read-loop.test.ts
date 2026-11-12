import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { ScriptedModel, resolveProfile } from '@src/llm';
import { activeBranch, appendEntry, createConversation } from '@src/store/conversations';
import { closeDb } from '@src/store/db';
import { AgentLoop } from '../loop';
import { toolsForRun } from '../tools';
import { FakeHost, FakeLayer, failed, ok } from '../testing/fake-layer';

afterEach(async () => {
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
});

/** A layer whose navigate moves the one tab to `url`, and whose snapshot shows `outline` under `title`. */
function site(url: string, title: string, outline: string, navigateResult?: () => ReturnType<FakeLayer['call']>) {
  const layer = new FakeLayer({
    navigate: () => {
      layer.tabsData = { tabs: [{ tabId: 1, url, title, active: true }], activeTabId: 1 };
      return navigateResult ? navigateResult() : Promise.resolve(ok('navigate · ok'));
    },
    read: () => Promise.resolve(ok(outline, { page: { tabId: 1, url, title, rev: 4 } as never })),
  });
  return layer;
}

type Reply = { toolCalls: Array<{ name: string; input: unknown; id: string }> };
const finish = (outcome: string, summary: string): Reply => ({ toolCalls: [{ name: 'done', input: { outcome, summary }, id: 'd' }] });

async function run(request: string, layer: FakeLayer, replies: Reply[] = []) {
  const c = await createConversation({ mode: 'ask' });
  await appendEntry(c.id, { type: 'message', message: { role: 'user', parts: [{ type: 'text', text: request }] } });
  const scripted = new ScriptedModel(replies);
  const loop = new AgentLoop({
    conversationId: c.id,
    runId: 'r1',
    model: { ref: { providerId: 'p', model: 'm' }, chat: scripted.chat(), profile: resolveProfile({ kind: 'openai-compatible', modelName: 'm' }), reasoning: 'none' },
    system: 'sys',
    tools: toolsForRun({ vision: false }),
    layer,
    host: new FakeHost(),
    signal: new AbortController().signal,
    emit: () => undefined,
    turnCap: 100,
  });
  const end = await loop.run();
  const branch = await activeBranch(c.id);
  const assistant = branch
    .filter(e => e.type === 'message' && e.message.role === 'assistant')
    .map(e => (e.type === 'message' ? e.message.parts.map(p => (p.type === 'text' ? p.text : '')).join('') : ''));
  return { end, layer, assistant };
}

describe('Route A: open and read, with no model call', () => {
  it('answers from the page, makes no model call, and counts the pre-steps as work', async () => {
    const layer = site('https://example.com/', 'Example Domain', 'main\n  heading "Example Domain" (level 1)');
    const r = await run('Open example.com and read the first visible heading.', layer);
    expect(r.end).toMatchObject({ status: 'done', outcome: 'success', turns: 0 });
    expect(r.end.summary).toContain('Example Domain');
    expect(r.assistant.join(' ')).toContain('Example Domain');
    expect(layer.calls.map(c => c.tool)).toEqual(['navigate', 'read']);
  });

  it('hands over to the model when a login or challenge stands in the way', async () => {
    const layer = site('https://example.com/', 'Just a moment...', 'main\n  heading "Checking your browser" (level 1)');
    const r = await run('Open example.com and read the heading', layer, [finish('partial', 'A challenge blocked the page.')]);
    expect(r.end.turns).toBe(1);
    expect(r.end.summary).toContain('challenge');
  });

  it('hands over when the site redirected to another site', async () => {
    const layer = site('https://other.test/', 'Other', 'main\n  heading "Other" (level 1)');
    const r = await run('Open example.com and read the heading', layer, [finish('success', 'It went to other.test.')]);
    expect(r.end.turns).toBe(1);
  });

  it('hands over when navigation fails', async () => {
    const layer = site('https://example.com/', 'x', 'main', () => Promise.resolve(failed('NAVIGATION_FAILED', 'net::ERR_NAME_NOT_RESOLVED')));
    const r = await run('Open example.com and read the heading', layer, [finish('failed', 'The site could not be opened.')]);
    expect(r.end.turns).toBe(1);
    expect(r.end.status).toBe('failed');
  });

  it('leaves any request with more in it to the model', async () => {
    const layer = site('https://example.com/', 'Example Domain', 'main\n  heading "Example Domain" (level 1)');
    const r = await run('Open example.com, read the heading and then click the first link', layer, [finish('success', 'ok')]);
    expect(r.end.turns).toBe(1);
  });
});
