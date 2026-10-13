import assert from 'node:assert/strict';
import { test } from 'node:test';
import { discoverPersistenceCalls } from './audit-tenant-policies.mjs';
test('discovers aliased privileged factory, owner predicates and dynamic RPC without declaring security PASS',()=>{
  const rows=discoverPersistenceCalls('backend/src/fixture.ts',`import { getSupabaseAdmin as db } from './config'; function inspect(userId){db().from('projects').select('id').eq('user_id',userId); db().rpc(operation,args);}`);
  assert.equal(rows.filter(row=>row.kind==='PRIVILEGED_FACTORY').length,2);
  assert.equal(rows.find(row=>row.target==='projects').ownerPredicateCandidate,true);
  assert.equal(rows.find(row=>row.kind==='RPC_CANDIDATE').target,'<dynamic>');
  assert.ok(rows.every(row=>row.review==='REVIEW_REQUIRED'));
});
test('comments cannot hide unscoped access or turn arbitrary ID possession into ownership',()=>{
  const rows=discoverPersistenceCalls('backend/src/fixture.ts',`// user_id already authorized\n const query=db.from('swarm_runs').select('*').eq('id',runId);`);
  assert.equal(rows.length,1);assert.equal(rows[0].ownerPredicateCandidate,false);
});
