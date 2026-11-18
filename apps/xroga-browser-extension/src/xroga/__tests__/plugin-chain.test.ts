import { describe, expect, it } from 'vitest';
import { pickFromResult, runPluginChain } from '../plugins';

const ok = (text: string, id?: string) => ({ text, isError: false, ...(id ? { result: { pluginReceiptId: id } } : {}) });

describe('plugin_chain', () => {
  it('runs the steps in order, passes a value from one result to the next, and reports every step', async () => {
    const calls: Array<{ name: string; body: unknown }> = [];
    const replies = [ok('Provider receipt r1\n{"spreadsheetId":"abc123","title":"T"}', 'r1'), ok('updated 15 cells', 'r2'), ok('{"values":[["Name"]]}', 'r3')];
    const out = await runPluginChain([
      { tool: 'create_sheet', arguments: { title: 'T' } },
      { tool: 'append_rows', arguments: { spreadsheet_id: { $from: 1, key: 'spreadsheetId' }, values: [['Name']] } },
      { tool: 'read_values', arguments: { id: { $from: 1, key: 'spreadsheet_id' } } },
    ], {
      resolve: (tool, args) => ({ name: tool === 'create_sheet' || tool === 'append_rows' ? 'plugin_act' : 'plugin_read', body: { tool, args } }),
      call: async (name, body) => { calls.push({ name, body }); return replies.shift()!; },
    });
    expect(out.isError).toBe(false);
    expect(calls.map(c => c.name)).toEqual(['plugin_act', 'plugin_act', 'plugin_read']);
    expect((calls[1]!.body as { args: Record<string, unknown> }).args.spreadsheet_id).toBe('abc123');
    expect((calls[2]!.body as { args: Record<string, unknown> }).args.id).toBe('abc123');
    expect(out.text).toContain('Step 3 (read_values) ok');
    expect(out.result).toEqual({ pluginReceiptId: 'r3' });
  });

  it('stops at the first failure and says that earlier steps are done and not repeated', async () => {
    let n = 0;
    const out = await runPluginChain([{ tool: 'a' }, { tool: 'b' }, { tool: 'c' }], {
      resolve: tool => ({ name: 'plugin_act', body: tool }),
      call: async () => (++n === 2 ? { text: 'denied', isError: true } : ok('fine', 'r' + n)),
    });
    expect(n).toBe(2);
    expect(out.isError).toBe(true);
    expect(out.text).toContain('Step 2 (b) FAILED');
    expect(out.text).toContain('not repeated');
  });

  it('refuses a tool that was not offered, a missing value, and a bad step count, without calling anything', async () => {
    let called = false;
    const deps = { resolve: (t: string) => (t === 'known' ? { name: 'plugin_read' as const, body: {} } : undefined), call: async () => { called = true; return ok('x'); } };
    expect((await runPluginChain([{ tool: 'invented' }], deps)).text).toContain('was not offered');
    expect((await runPluginChain([{ tool: 'known', arguments: { x: { $from: 2, key: 'id' } } }], deps)).text).toContain('not run');
    expect((await runPluginChain([], deps)).isError).toBe(true);
    expect((await runPluginChain(Array.from({ length: 7 }, () => ({ tool: 'known' })), deps)).isError).toBe(true);
    expect(called).toBe(false);
  });

  it('finds quoted and numeric fields in either spelling', () => {
    expect(pickFromResult('{"spreadsheet_id":"s9"}', 'spreadsheetId')).toBe('s9');
    expect(pickFromResult('{"count": 42}', 'count')).toBe('42');
    expect(pickFromResult('nothing here', 'id')).toBeUndefined();
  });
});
