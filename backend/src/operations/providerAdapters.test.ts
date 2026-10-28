import assert from 'node:assert/strict';
import test from 'node:test';
import { createInternalAdapter, createHttpVerificationAdapter, httpVerificationAdapter, ProviderAdapterRegistry } from './providerAdapters.js';
import { Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';
function network(body:()=>{text:string;status:number}|never) {
  return createHttpVerificationAdapter({resolve:async()=>[{address:'8.8.8.8',family:4}],open:async()=>{
    const item=body();return Object.assign(Readable.from([Buffer.from(item.text)]),{statusCode:item.status,headers:{}}) as IncomingMessage;
  }});
}

test('HTTP adapter rejects local and credential-bearing targets', async () => {
  assert.equal((await httpVerificationAdapter.execute('refresh_health', { url: 'http://localhost:3000' })).status, 'blocked');
  assert.equal((await httpVerificationAdapter.execute('refresh_health', { url: 'https://user:pass@example.com' })).status, 'blocked');
  assert.equal((await httpVerificationAdapter.execute('refresh_health', { url: 'https://127.0.0.1' })).status, 'blocked');
});

test('HTTP adapter verifies response and application marker without persisting body', async (t) => {
  const result = await network(()=>({text:'xroga-runtime-marker',status:200})).execute('refresh_health', { url: 'https://example.com/ready', expectedMarker: 'xroga-runtime-marker' });
  assert.equal(result.status, 'verified'); assert.equal(JSON.stringify(result).includes('xroga-runtime-marker'), false);
});

test('HTTP adapter detects provider-ready but wrong application', async (t) => {
  const result = await network(()=>({text:'another application',status:200})).execute('verify_domain', { url: 'https://example.com', expectedMarker: 'xroga' });
  assert.equal(result.status, 'failed'); assert.equal(result.errorCategory, 'serving_wrong_application');
});

test('HTTP adapter maps provider timeout safely', async (t) => {
  const result = await network(()=>{throw new DOMException('The operation was aborted','AbortError');}).execute('refresh_health', { url: 'https://example.com' });
  assert.equal(result.status, 'provider_unavailable'); assert.equal(result.errorCategory, 'timeout');
});

test('HTTP adapter retries a rate limit once without duplicating mutations', async (t) => {
  let calls=0;
  const result = await network(()=>({text:'ok',status:++calls===1?429:200})).execute('refresh_health', { url: 'https://example.com/ready' });
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

test('internal adapter routes the implemented campaign capability without changing its outcome', async () => {
  const input = { userId: 'owner', projectId: 'project', targetId: 'campaign', targetVersion: 1, actionId: 'approved-action' };
  let calls = 0;
  const result = { status: 'verified' as const, safeSummary: 'Canonical campaign transition persisted' };
  const adapter = createInternalAdapter(async (capability, received) => {
    calls++;
    assert.equal(capability, 'execute_growth_campaign');
    assert.deepEqual(received, input);
    return result;
  });
  assert.ok(adapter.supportedCapabilities.includes('execute_growth_campaign'));
  assert.equal(await adapter.execute('execute_growth_campaign', input), result);
  assert.equal(calls, 1);
  assert.equal((await adapter.execute('unimplemented_campaign_send', input)).status, 'unsupported');
  assert.equal(calls, 1);
});
