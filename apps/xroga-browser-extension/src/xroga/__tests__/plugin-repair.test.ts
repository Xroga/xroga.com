import { describe, expect, it } from 'vitest';
import { repairingPluginCaller, type PluginToolName } from '../plugin-repair';
import type { PluginFailureKind } from '../plugin-failures';

type R = { isError: boolean; failureKind?: PluginFailureKind; text: string };
const ok = (text: string): R => ({ isError: false, text });
const notFound: R = { isError: true, failureKind: 'search_again', text: 'not found' };

function scripted(replies: R[]) {
  const calls: Array<{ name: PluginToolName; body: unknown }> = [];
  return { calls, run: async (name: PluginToolName, body: unknown) => { calls.push({ name, body }); return replies.shift() ?? ok('extra'); } };
}

describe('repairing a call the provider search did not list', () => {
  it('searches again with the same words, then repeats the same call, once', async () => {
    const s = scripted([ok('found'), notFound, ok('found again'), ok('the balance')]);
    const call = repairingPluginCaller(s.run);
    await call('plugin_search', { query: 'check my Monid balance' });
    const result = await call('plugin_read', { slug: 'MONID_BALANCE', arguments: {} });
    expect(result.text).toBe('the balance');
    expect(s.calls.map(c => c.name)).toEqual(['plugin_search', 'plugin_read', 'plugin_search', 'plugin_read']);
    expect((s.calls[2]!.body as { query: string }).query).toBe('check my Monid balance (retry)');
    expect(s.calls[3]!.body).toEqual(s.calls[1]!.body);
  });

  it('uses the change search for a change', async () => {
    const s = scripted([ok('found'), notFound, ok('found again'), ok('done')]);
    const call = repairingPluginCaller(s.run);
    await call('plugin_action_search', { query: 'draft an email' });
    await call('plugin_act', { slug: 'GMAIL_CREATE_EMAIL_DRAFT', arguments: {}, request: 'x' });
    expect(s.calls.map(c => c.name)).toEqual(['plugin_action_search', 'plugin_act', 'plugin_action_search', 'plugin_act']);
  });

  it('repairs only once: a second refusal is reported as the first one was', async () => {
    const s = scripted([ok('found'), notFound, ok('found again'), { ...notFound, text: 'still not found' }]);
    const call = repairingPluginCaller(s.run);
    await call('plugin_search', { query: 'q' });
    const result = await call('plugin_read', { slug: 'S', arguments: {} });
    expect(result.text).toBe('not found');
    expect(s.calls).toHaveLength(4);
  });

  it('does nothing when there was no earlier search to repeat', async () => {
    const s = scripted([notFound]);
    const result = await repairingPluginCaller(s.run)('plugin_read', { slug: 'S', arguments: {} });
    expect(result.text).toBe('not found');
    expect(s.calls).toHaveLength(1);
  });

  it('never repairs other failures: policy refusals, reconnects, uncertain outcomes', async () => {
    for (const kind of ['policy', 'reconnect', 'uncertain', 'retry', 'auth', 'use_action_tool'] as PluginFailureKind[]) {
      const s = scripted([ok('found'), { isError: true, failureKind: kind, text: kind }]);
      const call = repairingPluginCaller(s.run);
      await call('plugin_search', { query: 'q' });
      const result = await call('plugin_read', { slug: 'S', arguments: {} });
      expect(result.text).toBe(kind);
      expect(s.calls).toHaveLength(2);
    }
  });

  it('a failed re-search returns the original failure and makes no second call', async () => {
    const s = scripted([ok('found'), notFound, { isError: true, text: 'limit' }]);
    const call = repairingPluginCaller(s.run);
    await call('plugin_search', { query: 'q' });
    const result = await call('plugin_read', { slug: 'S', arguments: {} });
    expect(result.text).toBe('not found');
    expect(s.calls.map(c => c.name)).toEqual(['plugin_search', 'plugin_read', 'plugin_search']);
  });

  it('a successful call passes straight through', async () => {
    const s = scripted([ok('data')]);
    const result = await repairingPluginCaller(s.run)('plugin_read', { slug: 'S', arguments: {} });
    expect(result.text).toBe('data');
    expect(s.calls).toHaveLength(1);
  });
});
