import assert from 'node:assert/strict';
import { test } from 'node:test';
import { discoverPersistenceCalls,main,authenticateObservedReceipts } from './audit-tenant-policies.mjs';
import { createHash } from 'node:crypto';
import { applyCallerReviews } from './caller-reviews.mjs';
test('discovers aliased privileged factory, owner predicates and dynamic RPC without declaring security PASS',()=>{
  const rows=discoverPersistenceCalls('backend/src/fixture.ts',`import { getSupabaseAdmin as db } from './config'; function inspect(userId){db().from('projects').select('id').eq('user_id',userId); db().rpc(operation,args);}`);
  assert.equal(rows.filter(row=>row.kind==='PRIVILEGED_FACTORY').length,2);
  assert.equal(rows.find(row=>row.target==='projects').ownerPredicateCandidate,true);
  assert.equal(rows.find(row=>row.kind==='RPC_CANDIDATE').target,'<dynamic>');
  assert.ok(rows.every(row=>row.review==='REVIEW_REQUIRED'));
});

test('nested factory and table calls have distinct reproducible identities',()=>{
  const text=`getSupabaseAdmin().from('projects').select('id');`;
  const rows=discoverPersistenceCalls('backend/src/fixture.ts',text);
  assert.equal(rows.length,2);assert.notEqual(rows[0].id,rows[1].id);
  assert.deepEqual(rows,discoverPersistenceCalls('backend/src/fixture.ts',text));
});

test('manual review is source-bound and never inferred from owner-filter syntax',()=>{
  const rows=discoverPersistenceCalls('backend/src/fixture.ts',`db.from('projects').eq('user_id',userId);`);
  const record={path:rows[0].path,sourceSha256:rows[0].sourceSha256,callIds:[rows[0].id],disposition:'REVIEWED_GAP',
    authority:'The actor selecting userId is not verified by this isolated fixture.',
    reason:'An owner predicate alone cannot verify the provenance of an injected client.',
    evidence:[{path:'backend/src/fixture.test.ts',marker:'explicit denial test'}]};
  const evidence=()=>`test('explicit denial test',()=>{});`;
  assert.equal(applyCallerReviews(rows,{version:'1.0',reviews:[]},evidence)[0].review,'REVIEW_REQUIRED');
  assert.equal(applyCallerReviews(rows,{version:'1.0',reviews:[record]},evidence)[0].review,'REVIEWED_GAP');
  for(const invalid of [ {...record,sourceSha256:'0'.repeat(64)}, {...record,callIds:['unknown']}, {...record,disposition:'PASS'}, {...record,authority:'owner filter'}, {...record,evidence:[]} ]) {
    assert.throws(()=>applyCallerReviews(rows,{version:'1.0',reviews:[invalid]},evidence));
  }
  assert.throws(()=>applyCallerReviews(rows,{version:'1.0',reviews:[record,record]},evidence));
  assert.throws(()=>applyCallerReviews([...rows,...rows],{version:'1.0',reviews:[]},evidence));
  assert.throws(()=>applyCallerReviews(rows,{version:'1.0',reviews:[record]},()=>null));
});
test('comments cannot hide unscoped access or turn arbitrary ID possession into ownership',()=>{
  const rows=discoverPersistenceCalls('backend/src/fixture.ts',`// user_id already authorized\n const query=db.from('swarm_runs').select('*').eq('id',runId);`);
  assert.equal(rows.length,1);assert.equal(rows[0].ownerPredicateCandidate,false);
});
test('external exact-source acceptance cannot overwrite the canonical inventory or use unpaired observation claims',()=>{
  assert.throws(()=>main(['--evidence','artifacts/proof.json']),/both required/);
  assert.throws(()=>main(['--observations','artifacts/proof.json']),/both required/);
  assert.throws(()=>main(['--evidence','artifacts/proof.json','--observations','artifacts/observations.json','--write']),/must not overwrite/);
  assert.throws(()=>main(['--evidence','../proof.json','--observations','artifacts/observations.json']),/local artifact/);
});
test('external CI observations require independently retrieved source status log hash and passing test identity',()=>{
  const source='a'.repeat(40),log='job\tstep\t2026-10-18 ok 1 - exact owned denial\n';
  const receipt={runId:'123',sourceSha:source,artifactSha256:createHash('sha256').update(log).digest('hex'),passedTests:['exact owned denial']};
  const remote=()=>({metadata:{headSha:source,status:'completed',conclusion:'success'},log});
  assert.equal(authenticateObservedReceipts([receipt],source,remote).length,1);
  for(const patch of [{sourceSha:'b'.repeat(40)},{artifactSha256:'0'.repeat(64)},{runId:'fake'},{passedTests:['fabricated denial']}])assert.throws(()=>authenticateObservedReceipts([{...receipt,...patch}],source,remote));
  assert.throws(()=>authenticateObservedReceipts([receipt],source,()=>({metadata:{headSha:source,status:'completed',conclusion:'failure'},log})));
});
