import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { ScriptedModel, resolveProfile } from '@src/llm';
import type { ScriptedReply } from '@src/llm';
import { appendEntry, createConversation } from '@src/store/conversations';
import { closeDb } from '@src/store/db';
import { AgentLoop } from '../loop';
import { toolsForRun } from '../tools';
import { FakeHost, FakeLayer } from '../testing/fake-layer';

afterEach(async () => {
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
});

const TASK = 'Find 5 SEO agencies in Leeds, UK. For each one give the website, a contact email or phone number from its own site, and the two most serious SEO problems of its website. Put the result in a table.';

async function run(taskText: string, script: ScriptedReply[]) {
  const c = await createConversation({ mode: 'ask' });
  await appendEntry(c.id, { type: 'message', message: { role: 'user', parts: [{ type: 'text', text: taskText }] } });
  const scripted = new ScriptedModel(script);
  const layer = new FakeLayer();
  const fetched: string[] = [];
  const loop = new AgentLoop({
    conversationId: c.id, runId: 'r1',
    model: { ref: { providerId: 'p', model: 'm' }, chat: scripted.chat(), profile: resolveProfile({ kind: 'openai-compatible', modelName: 'm' }), reasoning: 'none' },
    system: 'sys', tools: [...toolsForRun({ disabled: [], vision: false }), { name: 'http_get', source: 'agent', group: 'working', description: 'fetch', parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'], additionalProperties: true } } as never],
    layer, host: new FakeHost(), signal: new AbortController().signal, emit: () => undefined, turnCap: 20,
    agentTool: async call => { fetched.push(String((call.input as { url?: string }).url)); return { text: 'server fetch', isError: false }; },
  });
  await loop.run();
  return { layer, fetched };
}

describe('an audit task sends company pages to the browser', () => {
  it('answers http_get of a company page with audit_page, not a server fetch', async () => {
    const { layer, fetched } = await run(TASK, [
      { toolCalls: [{ name: 'http_get', input: { url: 'https://salt.agency/', filter: 'title' }, id: 'a' }] },
      { toolCalls: [{ name: 'done', input: { outcome: 'success', summary: 'ok' }, id: 'd' }] },
    ]);
    expect(fetched).toEqual([]);
    expect(JSON.stringify(layer.calls)).toContain('audit_page');
  });

  it('still fetches an API or data file on the server', async () => {
    const { layer, fetched } = await run(TASK, [
      { toolCalls: [{ name: 'http_get', input: { url: 'https://salt.agency/robots.txt' }, id: 'a' }] },
      { toolCalls: [{ name: 'done', input: { outcome: 'success', summary: 'ok' }, id: 'd' }] },
    ]);
    expect(fetched).toEqual(['https://salt.agency/robots.txt']);
    expect(JSON.stringify(layer.calls)).not.toContain('audit_page');
  });

  it('does nothing special on a task that is not an audit', async () => {
    const { fetched } = await run('What is the weather today?', [
      { toolCalls: [{ name: 'http_get', input: { url: 'https://salt.agency/' }, id: 'a' }] },
      { toolCalls: [{ name: 'done', input: { outcome: 'success', summary: 'ok' }, id: 'd' }] },
    ]);
    expect(fetched).toEqual(['https://salt.agency/']);
  });
});
