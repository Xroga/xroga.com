import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { ScriptedModel, resolveProfile } from '@src/llm';
import { activeBranch, appendEntry, createConversation } from '@src/store/conversations';
import { closeDb } from '@src/store/db';
import { AgentLoop } from '../loop';
import { toolsForRun, type AgentTool } from '../tools';
import { FakeHost, FakeLayer } from '../testing/fake-layer';
import { appToolsFrom, nativeAppCall, nativeAppTool } from '../../xroga/plugins';

afterEach(async () => {
  await closeDb();
  globalThis.indexedDB = new IDBFactory();
});

const sheetsTool = {
  slug: 'GOOGLESHEETS_SEARCH_SPREADSHEETS', toolkit: 'googlesheets', description: 'Search for spreadsheets by name. Returns ids.',
  parameters: { type: 'object', properties: { query: { type: 'string', description: 'Name to search for' }, max_results: { type: 'integer' } }, required: ['query', 'nope'] },
};

describe('connected-app tools found by a search', () => {
  it('become native tools with their own name and real parameters, and only well-formed ones', () => {
    const found = appToolsFrom([sheetsTool, { slug: 'has spaces', toolkit: 'x' }, { slug: 'A'.repeat(70), toolkit: 'x' }, null, { slug: 'NO_TOOLKIT' }], 'read');
    expect(found.map(f => f.slug)).toEqual(['GOOGLESHEETS_SEARCH_SPREADSHEETS']);
    expect(found[0].parameters).toEqual({ type: 'object', properties: sheetsTool.parameters.properties, required: ['query'] });
    const tool = nativeAppTool(found[0], new Set())!;
    expect(tool).toMatchObject({ name: 'GOOGLESHEETS_SEARCH_SPREADSHEETS', source: 'agent', parameters: found[0].parameters });
    expect(tool.description).toContain('Reads data; the user approves what is sent.');
    expect(nativeAppTool(found[0], new Set(['GOOGLESHEETS_SEARCH_SPREADSHEETS']))).toBeUndefined();
  });

  it('are called through the same guarded read or change route, never around it', () => {
    const [read] = appToolsFrom([sheetsTool], 'read');
    expect(nativeAppCall(read, { query: 'Xroga Test' })).toEqual({ name: 'plugin_read', body: { slug: read.slug, arguments: { query: 'Xroga Test' } } });
    const [write] = appToolsFrom([{ ...sheetsTool, slug: 'GOOGLESHEETS_UPDATE_VALUES', description: 'Update cell values. More text.' }], 'write');
    expect(nativeAppCall(write, { range: 'A1' })).toEqual({
      name: 'plugin_act', body: { slug: 'GOOGLESHEETS_UPDATE_VALUES', arguments: { range: 'A1' }, request: 'googlesheets: Update cell values' },
    });
    expect(nativeAppCall(read, 'not an object')).toEqual({ name: 'plugin_read', body: { slug: read.slug, arguments: {} } });
  });
});

describe('the loop with app tools', () => {
  it('offers a found tool to the model on the next turn, runs a call to it, and records its receipt', async () => {
    const c = await createConversation({ mode: 'ask' });
    await appendEntry(c.id, { type: 'message', message: { role: 'user', parts: [{ type: 'text', text: 'Check my sheet' }] } });
    const [info] = appToolsFrom([sheetsTool], 'read');
    const nativeTool = nativeAppTool(info, new Set())!;
    const searchTool: AgentTool = { name: 'plugin_search', source: 'agent', group: 'working', description: 'find',
      parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } };
    const dispatched: Array<{ name: string; input: unknown }> = [];
    const scripted = new ScriptedModel([
      { toolCalls: [{ name: 'plugin_search', input: { query: 'find a Google Sheets spreadsheet by name' }, id: 'a' }] },
      { toolCalls: [{ name: 'GOOGLESHEETS_SEARCH_SPREADSHEETS', input: { query: 'Xroga Test' }, id: 'b' }] },
      { toolCalls: [{ name: 'done', input: { outcome: 'success', summary: 'Found it.' }, id: 'd' }] },
    ]);
    const loop = new AgentLoop({
      conversationId: c.id, runId: 'r1',
      model: { ref: { providerId: 'p', model: 'm' }, chat: scripted.chat(), profile: resolveProfile({ kind: 'openai-compatible', modelName: 'm' }), reasoning: 'none' },
      system: 'sys', tools: [...toolsForRun({ disabled: ['hover'], vision: false }), searchTool],
      layer: new FakeLayer(), host: new FakeHost(), signal: new AbortController().signal, emit: () => undefined, turnCap: 10,
      agentTool: async call => {
        dispatched.push({ name: call.toolName, input: call.input });
        if (call.toolName === 'plugin_search') return { text: 'found', isError: false, registerTools: [nativeTool] };
        return { text: 'Spreadsheet "Xroga Test" exists.', isError: false, result: { pluginReceiptId: 'receipt_1' } };
      },
    });
    const end = await loop.run();
    expect(end.status).toBe('done');
    expect(end.outcome).toBe('success');
    expect(scripted.calls[0].tools.map(t => t.name)).not.toContain('GOOGLESHEETS_SEARCH_SPREADSHEETS');
    expect(scripted.calls[1].tools.map(t => t.name)).toContain('GOOGLESHEETS_SEARCH_SPREADSHEETS');
    expect(dispatched).toEqual([
      { name: 'plugin_search', input: { query: 'find a Google Sheets spreadsheet by name' } },
      { name: 'GOOGLESHEETS_SEARCH_SPREADSHEETS', input: { query: 'Xroga Test' } },
    ]);
    const branch = await activeBranch(c.id);
    const toolText = branch.flatMap(e => (e.type === 'message' && e.message.role === 'tool' ? e.message.parts : [])).map(p => ('text' in p ? p.text : '')).join('\n');
    expect(toolText).toContain('Spreadsheet "Xroga Test" exists.');
  });
});
