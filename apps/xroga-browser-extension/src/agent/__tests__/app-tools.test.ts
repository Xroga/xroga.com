import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { ScriptedModel, resolveProfile } from '@src/llm';
import { activeBranch, appendEntry, createConversation } from '@src/store/conversations';
import { closeDb } from '@src/store/db';
import { AgentLoop } from '../loop';
import { toolsForRun, type AgentTool } from '../tools';
import { FakeHost, FakeLayer } from '../testing/fake-layer';
import { appToolAlias, appToolsFrom, nativeAppCall, nativeAppTool } from '../../xroga/plugins';

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
    expect(tool).toMatchObject({ name: 'googlesheets_search_spreadsheets', source: 'agent', parameters: found[0].parameters });
    expect(tool.description).toContain('Reads data; the user approves what is sent.');
    // A name already taken gets a suffix instead of hiding the tool.
    expect(nativeAppTool(found[0], new Set(['googlesheets_search_spreadsheets']))!.name).toBe('googlesheets_search_spreadsheets_a');
  });

  it('are offered under a name the Xroga server accepts for a tool in a model request', () => {
    // The server's turn schema: /^[a-z_]{1,50}$/. Composio slugs are upper case, can hold digits and exceed 50 characters.
    const serverRule = /^[a-z_]{1,50}$/;
    const slugs = ['GMAIL_FETCH_EMAILS', 'GOOGLESHEETS_BATCH_GET_SPREADSHEET_VALUES_BY_DATA_FILTER', 'GITHUB_V3_LIST_REPOS_2', 'a-b-c', '12345'];
    const taken = new Set<string>();
    for (const slug of slugs) {
      const alias = appToolAlias(slug, taken);
      expect(alias, slug).toMatch(serverRule);
      taken.add(alias!);
    }
    expect(taken.size).toBe(slugs.length);
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
    await appendEntry(c.id, { type: 'message', message: { role: 'user', parts: [{ type: 'text', text: 'Look up the spreadsheet called Xroga Test' }] } });
    const [info] = appToolsFrom([sheetsTool], 'read');
    const nativeTool = nativeAppTool(info, new Set())!;
    const searchTool: AgentTool = { name: 'plugin_search', source: 'agent', group: 'working', description: 'find',
      parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } };
    const dispatched: Array<{ name: string; input: unknown }> = [];
    const scripted = new ScriptedModel([
      { toolCalls: [{ name: 'plugin_search', input: { query: 'find a Google Sheets spreadsheet by name' }, id: 'a' }] },
      { toolCalls: [{ name: 'googlesheets_search_spreadsheets', input: { query: 'Xroga Test' }, id: 'b' }] },
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
    expect(scripted.calls[0].tools.map(t => t.name)).not.toContain('googlesheets_search_spreadsheets');
    expect(scripted.calls[1].tools.map(t => t.name)).toContain('googlesheets_search_spreadsheets');
    expect(dispatched).toEqual([
      { name: 'plugin_search', input: { query: 'find a Google Sheets spreadsheet by name' } },
      { name: 'googlesheets_search_spreadsheets', input: { query: 'Xroga Test' } },
    ]);
    const branch = await activeBranch(c.id);
    const toolText = branch.flatMap(e => (e.type === 'message' && e.message.role === 'tool' ? e.message.parts : [])).map(p => ('text' in p ? p.text : '')).join('\n');
    expect(toolText).toContain('Spreadsheet "Xroga Test" exists.');
  });
});

async function appRun(text: string, search: { text: string; registerTools?: AgentTool[] }, replies: Array<{ toolCalls: Array<{ name: string; input: unknown; id: string }> }>) {
  const c = await createConversation({ mode: 'ask' });
  await appendEntry(c.id, { type: 'message', message: { role: 'user', parts: [{ type: 'text', text }] } });
  const searchTool: AgentTool = { name: 'plugin_search', source: 'agent', group: 'working', description: 'find',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } };
  const dispatched: Array<{ name: string; input: unknown }> = [];
  const scripted = new ScriptedModel(replies);
  const loop = new AgentLoop({
    conversationId: c.id, runId: 'r1',
    model: { ref: { providerId: 'p', model: 'm' }, chat: scripted.chat(), profile: resolveProfile({ kind: 'openai-compatible', modelName: 'm' }), reasoning: 'none' },
    system: 'sys', tools: [...toolsForRun({ disabled: ['hover'], vision: false }), searchTool],
    layer: new FakeLayer(), host: new FakeHost(), signal: new AbortController().signal, emit: () => undefined, turnCap: 10,
    agentTool: async call => {
      dispatched.push({ name: call.toolName, input: call.input });
      if (call.toolName === 'plugin_search') return { isError: false, ...search };
      return { text: 'Spreadsheet "Xroga Test" exists.', isError: false, result: { pluginReceiptId: 'receipt_1' } };
    },
  });
  const end = await loop.run();
  return { end, scripted, dispatched };
}

describe('the tool list a model request carries', () => {
  it('never lists more than the 32 tools the Xroga server accepts, however many a search finds', async () => {
    const many: AgentTool[] = Array.from({ length: 40 }, (_, i) => nativeAppTool(
      { slug: `GMAIL_TOOL_${String.fromCharCode(65 + (i % 26))}${i >= 26 ? 'X' : ''}`, toolkit: 'gmail', description: 'a tool', kind: 'write', parameters: { type: 'object', properties: {} } },
      new Set(Array.from({ length: i }, (_, j) => `gmail_tool_${String.fromCharCode(97 + (j % 26))}${j >= 26 ? 'x' : ''}`)),
    )!);
    const { scripted } = await appRun('Use my connected Gmail app to draft a note', { text: 'found many', registerTools: many }, [
      { toolCalls: [{ name: 'done', input: { outcome: 'success', summary: 'ok' }, id: 'd' }] },
    ]);
    for (const call of scripted.calls) expect(call.tools.length).toBeLessThanOrEqual(32);
    // The server also requires lowercase letters and underscores only.
    for (const call of scripted.calls) for (const t of call.tools) expect(t.name).toMatch(/^[a-z_]{1,50}$/);
  });
});

describe('a request about connected apps', () => {
  const request = 'Use my connected Google Sheets app, not the browser. Find the spreadsheet named "Xroga Test" and tell me whether it exists.';
  const [info] = appToolsFrom([sheetsTool], 'read');

  it('has its search run before the first model turn, so the first turn already calls the tool it found', async () => {
    const native = nativeAppTool(info, new Set())!;
    const { end, scripted, dispatched } = await appRun(request, { text: 'found: GOOGLESHEETS_SEARCH_SPREADSHEETS', registerTools: [native] }, [
      { toolCalls: [{ name: 'googlesheets_search_spreadsheets', input: { query: 'Xroga Test' }, id: 'b' }] },
      { toolCalls: [{ name: 'done', input: { outcome: 'success', summary: 'It exists.' }, id: 'd' }] },
    ]);
    expect(end.outcome).toBe('success');
    // Two model turns in all: no turn was spent asking for the search.
    expect(scripted.calls).toHaveLength(2);
    expect(scripted.calls[0].tools.map(t => t.name)).toContain('googlesheets_search_spreadsheets');
    expect(JSON.stringify(scripted.calls[0].prompt)).toContain('do not search again for the same task');
    expect(dispatched[0].name).toBe('plugin_search');
    const query = (dispatched[0].input as { query: string }).query;
    expect(query.startsWith('Google Sheets app.')).toBe(true);
    expect(query).not.toContain('browser');
    expect(query.length).toBeLessThanOrEqual(120);
    expect(dispatched[1].name).toBe('googlesheets_search_spreadsheets');
  });

  it('leaves the search to the model when the up-front search finds nothing', async () => {
    const { end, scripted, dispatched } = await appRun(request, { text: 'No matching connected app read tools.' }, [
      { toolCalls: [{ name: 'plugin_search', input: { query: 'find a Google Sheets spreadsheet by name' }, id: 'a' }] },
      { toolCalls: [{ name: 'done', input: { outcome: 'partial', summary: 'Nothing found.' }, id: 'd' }] },
    ]);
    expect(end.status).toBe('done');
    expect(JSON.stringify(scripted.calls[0].prompt)).not.toContain('do not search again');
    expect(dispatched.map(d => d.name)).toEqual(['plugin_search', 'plugin_search']);
  });
});
