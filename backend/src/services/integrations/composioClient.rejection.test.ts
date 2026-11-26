import assert from 'node:assert/strict';
import test from 'node:test';
import { ComposioClientError, getComposioCatalogToolkit } from './composioClient.js';

// A rejected provider call carries the provider's short reason to the caller, intact and bounded, and the logging that
// explains a rejection never changes the text (an earlier pattern replaced every letter "s" with a space).
test('a request the provider rejects returns its reason with whitespace collapsed and every letter kept', async t => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.COMPOSIO_API_KEY;
  const previousDetail = process.env.XROGA_COMPOSIO_ERROR_DETAIL;
  const previousError = console.error;
  const logged: string[] = [];
  process.env.COMPOSIO_API_KEY = 'fixture-only';
  process.env.XROGA_COMPOSIO_ERROR_DETAIL = '1';
  console.error = (...args: unknown[]) => { logged.push(args.map(String).join(' ')); };
  const reason = "The 'account' parameter is not supported for this project.\n   Multi-account selection is not enabled. " + 'x'.repeat(500);
  globalThis.fetch = (async () => Response.json(
    { error: { message: reason, slug: 'ToolRouterV2_BadRequest', code: 4300, suggested_fix: 'Remove the account field.' } },
    { status: 400 },
  )) as typeof fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
    console.error = previousError;
    if (previousKey === undefined) delete process.env.COMPOSIO_API_KEY; else process.env.COMPOSIO_API_KEY = previousKey;
    if (previousDetail === undefined) delete process.env.XROGA_COMPOSIO_ERROR_DETAIL; else process.env.XROGA_COMPOSIO_ERROR_DETAIL = previousDetail;
  });

  await assert.rejects(() => getComposioCatalogToolkit('gmail'), (error: unknown) => {
    assert.ok(error instanceof ComposioClientError);
    assert.equal(error.code, 'COMPOSIO_UPSTREAM_ERROR');
    const message = (error as unknown as { providerMessage?: string }).providerMessage ?? '';
    assert.ok(message.startsWith("The 'account' parameter is not supported for this project. Multi-account selection is not enabled."), message);
    assert.ok(message.length <= 300);
    return true;
  });
  const detail = logged.find(line => line.includes('upstream detail')) ?? '';
  assert.ok(detail.includes('is not supported for this project') && detail.includes('Multi-account selection is not enabled'), detail);
  assert.ok(logged.some(line => line.includes('upstream error') && line.includes('400') && line.includes('ToolRouterV2_BadRequest')));
});
