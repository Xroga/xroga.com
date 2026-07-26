import assert from 'node:assert/strict';
import test from 'node:test';
import { createInternalAdapter, httpVerificationAdapter, ProviderAdapterRegistry } from './providerAdapters.js';

test('HTTP adapter rejects local and credential-bearing targets', async () => {
  assert.equal((await httpVerificationAdapter.execute('refresh_health', { url: 'http://localhost:3000' })).status, 'blocked');
  assert.equal((await httpVerificationAdapter.execute('refresh_health', { url: 'https://user:pass@example.com' })).status, 'blocked');
  assert.equal((await httpVerificationAdapter.execute('refresh_health', { url: 'https://127.0.0.1' })).status, 'blocked');
});

test('HTTP adapter verifies response and application marker without persisting body', async (t) => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response('xroga-runtime-marker', { status: 200 })) as typeof fetch;
  t.after(() => { globalThis.fetch = original; });
  const result = await httpVerificationAdapter.execute('refresh_health', { url: 'https://example.com/ready', expectedMarker: 'xroga-runtime-marker' });
  assert.equal(result.status, 'verified'); assert.equal(JSON.stringify(result).includes('xroga-runtime-marker'), false);
});

test('HTTP adapter detects provider-ready but wrong application', async (t) => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response('another application', { status: 200 })) as typeof fetch;
  t.after(() => { globalThis.fetch = original; });
  const result = await httpVerificationAdapter.execute('verify_domain', { url: 'https://example.com', expectedMarker: 'xroga' });
  assert.equal(result.status, 'failed'); assert.equal(result.errorCategory, 'serving_wrong_application');
});

test('HTTP adapter maps provider timeout safely', async (t) => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => { throw new DOMException('The operation was aborted', 'AbortError'); }) as typeof fetch;
  t.after(() => { globalThis.fetch = original; });
  const result = await httpVerificationAdapter.execute('refresh_health', { url: 'https://example.com' });
  assert.equal(result.status, 'provider_unavailable'); assert.equal(result.errorCategory, 'timeout');
});

test('HTTP adapter retries a rate limit once without duplicating mutations', async (t) => {
  const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = (async () => { calls += 1; return calls === 1 ? new Response('limited', { status: 429 }) : new Response('ok', { status: 200 }); }) as typeof fetch;
  t.after(() => { globalThis.fetch = original; });
  const result = await httpVerificationAdapter.execute('refresh_health', { url: 'https://example.com/ready' });
  assert.equal(result.status, 'verified'); assert.equal(calls, 2);
});

test('unsupported provider capability is truthful', async () => assert.equal((await httpVerificationAdapter.execute('deploy', { url: 'https://example.com' })).status, 'unsupported'));

test('adapter registry exposes contract but not executable implementation', () => {
  const registry = new ProviderAdapterRegistry(); registry.register(httpVerificationAdapter);
  const contract = registry.describe()[0] as Record<string, unknown>;
  assert.equal(contract.id, 'http_verification'); assert.equal('execute' in contract, false); assert.equal(contract.idempotencySupport, true);
});

test('internal adapter delegates supported operations and blocks unsupported ones', async () => {
  const adapter = createInternalAdapter(async () => ({ status: 'verified', safeSummary: 'done' }));
  assert.equal((await adapter.execute('retry_job', {})).status, 'verified');
  assert.equal((await adapter.execute('restore_backup', {})).status, 'unsupported');
});
