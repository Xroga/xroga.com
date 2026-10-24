import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TenantAccessError, runtimeAccessFailure } from './tenantErrors.js';
test('runtime access errors preserve non-enumerating authorized status categories',()=>{
  for(const [status,code] of [[401,'TENANT_AUTH_REQUIRED'],[404,'RESOURCE_NOT_FOUND'],[503,'RESOURCE_ACCESS_UNAVAILABLE']] as const) {
    const error=new TenantAccessError(status,code);assert.deepEqual(runtimeAccessFailure(error),{status,error:error.message,code});
  }
});
test('arbitrary runtime/provider/database failures cannot leak internal strings or custom stringification',()=>{
  for(const error of [new Error('PRIVATE_CANARY bearer secret db/table/internal/path'),{message:'PRIVATE_CANARY',toString(){throw new Error('must not stringify');}},null,undefined]) {
    const safe=runtimeAccessFailure(error);assert.equal(safe.status,503);assert.match(safe.error,/Retry shortly/);assert.ok(!JSON.stringify(safe).includes('PRIVATE_CANARY'));assert.ok(!JSON.stringify(safe).includes('Coming soon'));
  }
});
