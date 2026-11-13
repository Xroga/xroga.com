import { beforeEach, describe, expect, it, vi } from 'vitest';

let rejection: unknown;
const requests: string[] = [];
vi.mock('../bridge', () => ({
  workspaceRequest: async (op: string) => {
    requests.push(op);
    throw rejection;
  },
}));

const { runPluginTool } = await import('../plugins');
const { pluginFailureMessage } = await import('../plugin-failures');
const wrap = (text: string, source: string) => `<<${source}>>${text}<<end>>`;
const fail = (status: number, code: string, reason?: string) =>
  Object.assign(new Error(code), { status, code, detail: reason ? { reason: [reason] } : undefined });

beforeEach(() => {
  rejection = undefined;
  requests.length = 0;
});

describe('what a failed connected-app call tells the agent', () => {
  const cases: Array<[string, string | undefined, string, RegExp]> = [
    ['BROWSER_GATEWAY_UNAVAILABLE', 'COMPOSIO_TOOL_NOT_ALLOWED', 'search_again', /search/i],
    ['BROWSER_GATEWAY_UNAVAILABLE', 'COMPOSIO_MUTATION_BLOCKED', 'use_action_tool', /plugin_act/],
    ['BROWSER_GATEWAY_UNAVAILABLE', 'BUSINESS_ACTION_RISK_CHANGED', 'search_again', /search/i],
    ['BROWSER_GATEWAY_UNAVAILABLE', 'COMPOSIO_READ_ACCOUNT_UNAVAILABLE', 'reconnect', /takeover/],
    ['BROWSER_POLICY_DENIED', 'SECRET_EGRESS_DENIED', 'policy', /secret/i],
    ['BROWSER_POLICY_DENIED', 'UNSAFE_DESTINATION', 'policy', /not allowed/i],
    ['BROWSER_GATEWAY_UNAVAILABLE', 'COMPOSIO_CUSTOM_MCP_NOT_PINNED', 'policy', /pin/i],
    ['BROWSER_GATEWAY_UNAVAILABLE', 'COMPOSIO_CUSTOM_MCP_DEFINITION_CHANGED', 'policy', /changed/i],
    ['BROWSER_GATEWAY_UNAVAILABLE', 'COMPOSIO_CUSTOM_MCP_EXECUTION_OFF', 'policy', /not switched on/i],
    ['BROWSER_PLUGIN_DISCOVERY_LIMIT', undefined, 'already_done', /earlier/i],
    ['BROWSER_PLUGIN_READ_ALREADY_REQUESTED', undefined, 'already_done', /earlier result/i],
    ['BROWSER_DEVICE_REVOKED', undefined, 'auth', /sign in/i],
    ['BROWSER_RUN_LIMIT', undefined, 'limit', /paused task|stop/i],
  ];
  for (const [code, reason, kind, words] of cases) {
    it(`${reason ?? code} -> ${kind}, with the next step in plain words`, async () => {
      rejection = fail(code.endsWith('LIMIT') ? 429 : 503, code, reason);
      const result = await runPluginTool('plugin_read', 'run-1', { slug: 'S', arguments: {} }, new AbortController().signal, async () => 'approve', wrap);
      expect(result.isError).toBe(true);
      expect(result.text).toMatch(words);
      expect(result.text).not.toBe('Connected app operation unavailable or interrupted. Continue with authorized browser tools if appropriate.');
      expect(pluginFailureMessage({ status: 503, code, reason, approved: false, change: false })?.kind).toBe(kind);
    });
  }

  it('a provider error after Allow on a read may be retried once, with a fresh approval', () => {
    const m = pluginFailureMessage({ status: 503, code: 'BROWSER_GATEWAY_UNAVAILABLE', reason: 'COMPOSIO_UPSTREAM_ERROR', approved: true, change: false });
    expect(m?.kind).toBe('retry');
    expect(m?.text).toMatch(/once more/);
  });

  it('a provider error after Allow on a CHANGE is never retried: the outcome is uncertain', () => {
    const m = pluginFailureMessage({ status: 503, code: 'BROWSER_GATEWAY_UNAVAILABLE', reason: 'COMPOSIO_UPSTREAM_ERROR', approved: true, change: true });
    expect(m?.kind).toBe('uncertain');
    expect(m?.text).toMatch(/Do not repeat/);
    expect(m?.text).not.toMatch(/once more|retry/i);
  });

  it('an unknown failure keeps the careful generic wording', async () => {
    rejection = fail(503, 'BROWSER_GATEWAY_UNAVAILABLE');
    const result = await runPluginTool('plugin_read', 'run-1', { slug: 'S', arguments: {} }, new AbortController().signal, async () => 'approve', wrap);
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/unavailable or interrupted/);
  });

  it('no failure text carries a secret-shaped value or the provider\'s raw words', () => {
    for (const reason of ['COMPOSIO_UPSTREAM_ERROR', 'COMPOSIO_TOOL_NOT_ALLOWED', 'SECRET_EGRESS_DENIED']) {
      const m = pluginFailureMessage({ code: 'BROWSER_GATEWAY_UNAVAILABLE', reason, approved: false, change: false });
      expect(m?.text).not.toMatch(/sk-|Bearer|password=/i);
    }
  });
});
