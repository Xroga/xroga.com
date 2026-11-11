import { beforeEach, describe, expect, it, vi } from 'vitest';

const requests: Array<{ op: string; value: unknown }> = [];
let responses: Array<unknown | Error> = [];
vi.mock('../bridge', () => ({
  workspaceRequest: async (op: string, value: unknown) => {
    requests.push({ op, value });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  },
}));

const { PLUGIN_TOOLS, runPluginTool } = await import('../plugins');
const wrap = (text: string, source: string) => `<<${source}>>${text}<<end>>`;
const approval = { id: '00000000-0000-4000-8000-000000000013', summary: 'Create a draft post (wordpress)', account: 'wp-connection', argumentsPreview: '{"title":"Hello"}' };

beforeEach(() => {
  requests.length = 0;
  responses = [];
});

describe('plugin_action_search and plugin_act', () => {
  it('are offered with exact schemas, and plugin_act takes a one-line request', () => {
    const names = PLUGIN_TOOLS.map(tool => tool.name);
    expect(names).toEqual(['plugin_search', 'plugin_read', 'plugin_action_search', 'plugin_act']);
    const act = PLUGIN_TOOLS.find(tool => tool.name === 'plugin_act')!;
    expect((act.parameters as { required: string[] }).required).toEqual(['slug', 'arguments', 'request']);
    expect(act.description).toContain('only if they approve');
  });

  it('searches for change tools through their own operation and keeps the result inside its boundary', async () => {
    responses = [{ tools: [{ slug: 'WORDPRESS_CREATE_DRAFT_POST' }] }];
    const result = await runPluginTool('plugin_action_search', 'run-1', { query: 'create a draft post' }, new AbortController().signal, async () => 'approve', wrap);
    expect(requests[0].op).toBe('plugin-action-search');
    expect(result.isError).toBe(false);
    expect(result.text).toContain('<<connected app tool metadata>>');
    expect(result.text).toContain('WORDPRESS_CREATE_DRAFT_POST');
  });

  it('asks for approval of the exact change, then runs it once and returns its receipt', async () => {
    responses = [{ approval }, { receiptId: 'receipt_1', result: 'Created draft 42' }];
    const approvals: unknown[] = [];
    const result = await runPluginTool('plugin_act', 'run-1', { slug: 'S', arguments: { title: 'Hello' }, request: 'Create the draft' }, new AbortController().signal,
      async a => { approvals.push(a); return 'approve'; }, wrap);
    expect(requests.map(r => r.op)).toEqual(['plugin-act', 'plugin-act-review']);
    expect((requests[1].value as { body: unknown }).body).toEqual({ approvalId: approval.id, decision: 'approve' });
    expect(approvals).toEqual([approval]);
    expect(result).toMatchObject({ isError: false, result: { pluginReceiptId: 'receipt_1' } });
    expect(result.text).toContain('Created draft 42');
  });

  it('changes nothing when the user denies, and says so', async () => {
    responses = [{ approval }, { denied: true }];
    const result = await runPluginTool('plugin_act', 'run-1', { slug: 'S', arguments: {}, request: 'x' }, new AbortController().signal, async () => 'deny', wrap);
    expect((requests[1].value as { body: { decision: string } }).body.decision).toBe('deny');
    expect(result.isError).toBe(true);
    expect(result.text).toContain('Nothing was changed in the app');
  });

  it('tells the agent not to repeat a change that was approved but could not be verified', async () => {
    responses = [{ approval }, new Error('network')];
    const result = await runPluginTool('plugin_act', 'run-1', { slug: 'S', arguments: {}, request: 'x' }, new AbortController().signal, async () => 'approve', wrap);
    expect(result.isError).toBe(true);
    expect(result.text).toContain('Do not repeat it');
    expect(result.text).toContain('may or may not have been made');
  });

  it('does not offer a change when approval could not be set up', async () => {
    responses = [new Error('403')];
    const result = await runPluginTool('plugin_act', 'run-1', { slug: 'S', arguments: {}, request: 'x' }, new AbortController().signal, async () => 'approve', wrap);
    expect(requests.map(r => r.op)).toEqual(['plugin-act']);
    expect(result.text).toContain('unavailable or interrupted');
  });

  it('tells the model which arguments to fix when the tool does not define them, and sends nothing', async () => {
    responses = [Object.assign(new Error('x'), { code: 'BROWSER_PLUGIN_ARGUMENTS_INVALID', status: 422,
      detail: { unknown: ['search_type'], missing: ['query'], allowed: ['query', 'max_results'] } })];
    const result = await runPluginTool('plugin_read', 'run-1', { slug: 'S', arguments: { search_type: 'content' } }, new AbortController().signal,
      async () => { throw new Error('no approval card must be shown'); }, wrap);
    expect(requests.map(r => r.op)).toEqual(['plugin-read']);
    expect(result.isError).toBe(true);
    expect(result.text).toContain('Nothing was sent');
    expect(result.text).toContain('Not defined by the tool: search_type');
    expect(result.text).toContain('Required but missing: query');
    expect(result.text).toContain('query, max_results');
  });

  it("gives the model the provider's plan, pitfalls and connection status ahead of the tools", async () => {
    responses = [{ tools: [{ slug: 'GOOGLESHEETS_SEARCH_SPREADSHEETS', parameters: { properties: { query: { type: 'string' } } } }],
      plan: ['Search by file name first.'], pitfalls: ['Pass an ID, not a name.'], guidance: 'Read the sheet after finding it.',
      apps: [{ app: 'googlesheets', connected: true }] }];
    const result = await runPluginTool('plugin_search', 'run-1', { query: 'find a spreadsheet in Google Sheets' }, new AbortController().signal, async () => 'approve', wrap);
    expect(result.isError).toBe(false);
    const text = result.text;
    expect(text.indexOf('Search by file name first.')).toBeLessThan(text.indexOf('GOOGLESHEETS_SEARCH_SPREADSHEETS'));
    expect(text).toContain('Pass an ID, not a name.');
    expect(text).toContain('Read the sheet after finding it.');
    expect(text).toContain('"connected":true');
  });

  it("relays the app's reason when it rejects an approved request, and says it most likely changed nothing", async () => {
    responses = [{ approval }, Object.assign(new Error('x'), { code: 'BROWSER_GATEWAY_UNAVAILABLE', status: 503,
      detail: { providerMessage: ['Unknown field search_type'] } })];
    const result = await runPluginTool('plugin_read', 'run-1', { slug: 'S', arguments: { query: 'a' } }, new AbortController().signal, async () => 'approve', wrap);
    expect(result.isError).toBe(true);
    expect(result.text).toContain('most likely changed nothing');
    expect(result.text).toContain('<<connected app error>>Unknown field search_type<<end>>');
    expect(result.text).toContain('request the corrected call once');
  });
});
