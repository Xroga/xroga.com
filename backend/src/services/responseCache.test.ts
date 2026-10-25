import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTenantContext } from '../security/tenantContext.js';
import { getCachedResponse,setCachedResponse,tenantResponseCacheKey } from './responseCache.js';
test('response cache namespaces the same prompt by issued tenant and preserves case-sensitive content',()=>{
  const a=createTenantContext({userId:'11111111-2222-4333-8444-555555555555',via:'remote_getuser'}),b=createTenantContext({userId:'66666666-7777-4888-8999-aaaaaaaaaaaa',via:'remote_getuser'});
  assert.notEqual(tenantResponseCacheKey('Same prompt',a),tenantResponseCacheKey('Same prompt',b));
  assert.notEqual(tenantResponseCacheKey('Same prompt',a),tenantResponseCacheKey('same prompt',a));
  assert.equal(tenantResponseCacheKey('Same prompt',a),tenantResponseCacheKey('Same prompt ',a));
  assert.throws(()=>tenantResponseCacheKey('Same prompt',JSON.parse(JSON.stringify(a))));
});
test('legacy unscoped cache calls cannot read or write privileged records',async()=>{
  assert.equal(await getCachedResponse('No scope'),null);
  await setCachedResponse('No scope','must not persist');
  assert.equal(await getCachedResponse('No scope',{userId:'forged'} as never),null);
});
