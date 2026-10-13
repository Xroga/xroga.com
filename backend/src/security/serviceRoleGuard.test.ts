import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getGlobalSupabaseAdmin,globalServiceExceptions } from './serviceRoleGuard.js';
test('unregistered or prototype-derived global operations fail before constructing a privileged client',()=>{
  for(const name of ['unknown','__proto__','constructor','toString',null,undefined]) assert.throws(()=>getGlobalSupabaseAdmin(name as never),/Unregistered/);
  assert.equal(Object.isFrozen(globalServiceExceptions),true);
  assert.ok(Object.values(globalServiceExceptions).every(value=>Object.isFrozen(value) && value.source && value.table && value.reason));
});
