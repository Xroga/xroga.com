import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {userSupabaseMemoryReady} from './supabaseProvision.js';
import {createTenantContext,type TenantContext} from '../../security/tenantContext.js';

test('dormant memory readiness export requires the original issued context before credential or network access',async t=>{
  let requests=0;t.mock.method(globalThis,'fetch',async()=>{requests++;assert.fail('Unissued scope must be rejected before any request');});
  const context=createTenantContext({userId:randomUUID(),via:'persisted_owner'});
  for(const forged of [null,undefined,context.userId,{userId:context.userId},{...context},{...context,userId:randomUUID()}])await assert.rejects(userSupabaseMemoryReady(forged as TenantContext),{status:401,code:'TENANT_AUTH_REQUIRED'});
  assert.equal(requests,0);
});
