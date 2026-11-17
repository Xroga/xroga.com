import { describe, expect, it, vi } from 'vitest';

let reply: unknown;
let failure: unknown;
vi.mock('../bridge', () => ({
  workspaceRequest: vi.fn(async () => {
    if (failure) throw failure;
    return reply;
  }),
}));

import { HTTP_GET_TOOL, runPublicGet } from '../plugins';

const wrap = (text: string, source: string) => `<${source}>${text}</${source}>`;

describe('reading a public address directly', () => {
  it('returns the status, address and the text as untrusted content', async () => {
    failure = undefined;
    reply = { status: 200, contentType: 'application/json', finalUrl: 'https://api.llama.fi/tvl/aave', body: '14996732911.78' };
    const result = await runPublicGet('run-1', { url: 'https://api.llama.fi/tvl/aave' }, new AbortController().signal, wrap);
    expect(result.isError).toBe(false);
    expect(result.text).toContain('HTTP 200');
    expect(result.text).toContain('<public web address>14996732911.78</public web address>');
  });

  it('marks an error status and says what a refused address means', async () => {
    failure = undefined;
    reply = { status: 404, contentType: 'text/plain', finalUrl: 'https://x.example/a', body: 'not found' };
    expect((await runPublicGet('run-1', { url: 'https://x.example/a' }, new AbortController().signal, wrap)).isError).toBe(true);
    failure = Object.assign(new Error('x'), { code: 'BROWSER_POLICY_DENIED' });
    const refused = await runPublicGet('run-1', { url: 'https://10.0.0.1/a' }, new AbortController().signal, wrap);
    expect(refused.isError).toBe(true);
    expect(refused.text).toContain('public https addresses');
  });

  it('is a read tool that takes only an address', () => {
    expect(HTTP_GET_TOOL.parameters).toMatchObject({ required: ['url'], additionalProperties: false });
  });
});
