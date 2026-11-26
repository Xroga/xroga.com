import { describe, expect, it, vi } from 'vitest';

let reply: unknown;
let failure: unknown;
vi.mock('../bridge', () => ({
  workspaceRequest: vi.fn(async () => {
    if (failure) throw failure;
    return reply;
  }),
}));

import { PLUGIN_CONNECT_TOOL, runPluginConnect } from '../plugins';

describe('connecting an app by an authorization link', () => {
  it('gives the link and tells the agent to hand the sign-in to the user', async () => {
    failure = undefined;
    reply = { toolkit: 'notion', url: 'https://backend.composio.dev/api/v3/s/abc' };
    const result = await runPluginConnect('run-1', { toolkit: 'notion' }, new AbortController().signal);
    expect(result.isError).toBe(false);
    expect(result.text).toContain('https://backend.composio.dev/api/v3/s/abc');
    expect(result.text).toContain('takeover');
  });

  it('refuses a link that is not https and says what to do when none can be made', async () => {
    failure = undefined;
    reply = { toolkit: 'notion', url: 'javascript:alert(1)' };
    expect((await runPluginConnect('run-1', { toolkit: 'notion' }, new AbortController().signal)).isError).toBe(true);
    failure = Object.assign(new Error('x'), { code: 'BROWSER_PLUGIN_SEARCH_FIRST' });
    const first = await runPluginConnect('run-1', { toolkit: 'notion' }, new AbortController().signal);
    expect(first.text).toContain('plugin_search');
  });

  it('takes only the app name', () => {
    expect(PLUGIN_CONNECT_TOOL.parameters).toMatchObject({ required: ['toolkit'], additionalProperties: false });
  });
});
