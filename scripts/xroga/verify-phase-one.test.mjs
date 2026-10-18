import assert from 'node:assert/strict';
import {test} from 'node:test';
import {validatePhaseReceipt,implementationBindingsAtSource,baselineFixtureLog} from './verify-phase-one.mjs';
import {buildPhaseOne} from './phase-one.mjs';
function fixture(){return {version:1,collection:'GH_READ_ONLY_EXACT_SOURCE_AND_DOWNLOADED_ARTIFACTS',sourceSha:'a'.repeat(40),integratedSha:'b'.repeat(40),
  aggregateRun:'123',disposableRun:'456',
  workflowCategories:11,branchRuns:2,integratedRuns:2,stagesPerRun:21,sourceTreeMutated:false,
  disposable:{migrations:115,securityTests:149,browserTests:3,failures:0,skips:0,experimentAdmission:true},
  implementationBindings:[{path:'scripts/fixture.mjs',sha256:'c'.repeat(64)}],manifestSetSha256:'d'.repeat(64),
  criteria:buildPhaseOne().scoreboard.filter(c=>c.phase===1).map(c=>({...c,status:'PASS',testIds:['synthetic valid receipt fixture only'],proofIds:['synthetic']}))};}
test('Phase1 receipt validation admits complete synthetic evidence without claiming real CI',()=>{
  const f=fixture();assert.equal(validatePhaseReceipt(f,f.implementationBindings),f);
});
test('Phase1 receipt rejects stale implementation missing original criteria skips and unverified growth overlay',()=>{
  for(const mutate of [r=>r.criteria.pop(),r=>r.criteria[0].originalText='relaxed',r=>r.criteria[0].status='BLOCKED',r=>r.criteria[0].testIds=[],
    r=>r.sourceSha='old',r=>r.branchRuns=1,r=>r.sourceTreeMutated=true,r=>r.workflowCategories=10,
    r=>r.disposable.skips=1,r=>r.disposable.migrations=113,r=>r.disposable.experimentAdmission=false,r=>r.disposable.failures=1]){
    const r=fixture();mutate(r);assert.throws(()=>validatePhaseReceipt(r,[{path:'scripts/fixture.mjs',sha256:'c'.repeat(64)}]));
  }
  const r=fixture();assert.throws(()=>validatePhaseReceipt(r,[{path:'scripts/fixture.mjs',sha256:'e'.repeat(64)}]));
});
test('prior accepted source bindings come from immutable Git objects rather than newer working files',()=>{
  const source='ea2305700ae5c46ea24f612f9a09fbfcba4161cd',bindings=implementationBindingsAtSource(source);
  assert.ok(bindings.length>100);assert.ok(bindings.some(b=>b.path==='backend/src/growth/growthService.ts'));
  assert.ok(!bindings.some(b=>b.path==='scripts/security/tenant-acceptance.mjs'));
  assert.equal(implementationBindingsAtSource(source),bindings);
});
test('acceptance collects both baseline failure-propagation and inventory policy fixture logs',()=>{
  const files=['branch/baseline-negative-fixtures.log','branch/inventory-and-ledger-fixtures.log','branch/backend-unit-tests.log'];
  const log=baselineFixtureLog(files,p=>p.includes('baseline-negative')?'ok 1 - genuine compiler failure stops baseline':p.includes('inventory-and-ledger')?'ok 1 - valid source-bound criterion proof':'irrelevant');
  assert.ok(log.includes('genuine compiler failure'));assert.ok(log.includes('valid source-bound criterion proof'));assert.ok(!log.includes('irrelevant'));
});
