import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getGlobalSupabaseAdmin,globalServiceExceptions } from './serviceRoleGuard.js';
test('unregistered or prototype-derived global operations fail before constructing a privileged client',()=>{
  for(const name of ['unknown','__proto__','constructor','toString',null,undefined]) assert.throws(()=>getGlobalSupabaseAdmin(name as never),/Unregistered/);
  assert.equal(Object.isFrozen(globalServiceExceptions),true);
  assert.ok(Object.values(globalServiceExceptions).every(value=>Object.isFrozen(value) && value.source && value.table && value.reason));
  assert.equal(globalServiceExceptions.signed_whop_delivery_receipts.source,'backend/src/routes/billingWebhook.ts');
  assert.equal(globalServiceExceptions.signed_whop_delivery_receipts.table,'webhook_deliveries');
  assert.equal(globalServiceExceptions.signed_whop_delivery_receipts.action,'insert/select/update');
  assert.equal(globalServiceExceptions.readiness_profile_probe.source,'backend/src/security/serviceRoleGuard.ts');
  assert.equal(globalServiceExceptions.readiness_profile_probe.action,'select');
  assert.equal(globalServiceExceptions.readiness_profile_probe.columns,'id');
  assert.equal(globalServiceExceptions.readiness_profile_probe.limit,1);
});
