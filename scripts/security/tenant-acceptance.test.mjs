import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import {evaluateTenantAcceptance,tenantCriteria,highRiskClasses,invariantStates} from './tenant-acceptance.mjs';
const hash=text=>createHash('sha256').update(text).digest('hex');
const id=n=>`XB01-C007-AC${String(n).padStart(2,'0')}`;

function fixture(){
  const sourceSha='a'.repeat(40),path='backend/src/fixture.ts',source='export function owned(db,owner){return db.from("projects").eq("user_id",owner);}';
  const caller={id:'caller',path,sourceSha256:hash(source),kind:'PRIVILEGED_FACTORY'};
  const obligation={id:'OWNED',callerIds:['caller'],path,sourceSha256:hash(source),state:'VERIFIED_BOUNDARY',actorOrigin:'SERVER_VERIFIED',
    ownerBinding:'EXACT_OWNER_PARENT',proofIds:['tested'],secretBearing:true,connectedAccountBound:true};
  const bindings=[];
  for(const boundaryId of ['OWNED',id(4),id(5),id(6),...highRiskClasses.map(c=>`class:${c}`),'migration:fresh','migration:upgrade']){
    for(const polarity of ['POSITIVE','NEGATIVE'])bindings.push({id:`${boundaryId} ${polarity} passes`,boundaryId,polarity});
  }
  const transcript=bindings.map(b=>`ok ${b.id}`).join('\n'),artifact={path:'artifacts/tenant/result.tap',sha256:hash(transcript)};
  const input={version:1,sourceSha,callers:[caller],obligations:[obligation],criteria:tenantCriteria.map((text,i)=>({id:id(i+1),text,status:'PASS',proofIds:['tested']})),
    proofs:[{id:'tested',kind:'DISPOSABLE',sourceSha,artifact,tests:structuredClone(bindings),receiptId:'independently-observed'}]};
  const receipts=[{id:'independently-observed',sourceSha,kind:'DISPOSABLE',conclusion:'success',runId:'12345',artifactSha256:artifact.sha256,
    failed:0,skipped:0,passedTests:bindings.map(b=>b.id),testBindings:structuredClone(bindings)}];
  const assets=new Map([[path,source],[artifact.path,transcript]]);
  return {input,environment:{readAsset:p=>assets.get(p)??null,receipts,exceptions:[],expectedSourceSha:sourceSha},assets};
}

test('fully valid synthetic ten-criterion proof passes and computes a nonzero scoped factory count',()=>{
  const f=fixture(),r=evaluateTenantAcceptance(f.input,f.environment);
  assert.equal(r.result,'PASS');assert.equal(r.certifiedScopedPrivilegedCallers,1);assert.equal(r.unresolvedCandidateBoundaries,0);
  assert.equal(r.criteria.length,10);assert.ok(r.criteria.every(c=>c.status==='PASS'));assert.equal(r.failures.length,0);
});

test('missing caller review, negative proof or stale source cannot pass',()=>{
  for(const mutate of [f=>f.input.obligations=[],f=>f.input.proofs[0].tests=f.input.proofs[0].tests.filter(t=>t.polarity!=='NEGATIVE'),
    f=>f.input.obligations[0].sourceSha256='0'.repeat(64),f=>f.assets.set('backend/src/fixture.ts','changed source'),
    f=>f.input.proofs[0].sourceSha='b'.repeat(40),f=>f.environment.receipts[0].sourceSha='b'.repeat(40),f=>f.environment.expectedSourceSha='b'.repeat(40)]){
    const f=fixture();mutate(f);assert.equal(evaluateTenantAcceptance(f.input,f.environment).result,'BLOCKED');
  }
});

test('fabricated provider PASS and tampered artifact or manifest hash are rejected',()=>{
  for(const mutate of [f=>{f.input.proofs[0].kind='PROVIDER';f.input.proofs[0].providerVerified=true;},
    f=>{f.input.proofs[0].kind='PROVIDER';f.environment.receipts[0].kind='PROVIDER';},
    f=>{f.input.proofs[0].kind='PROVIDER';Object.assign(f.environment.receipts[0],{kind:'PROVIDER',provider:'fabricated',providerResource:'fake',independentPostcondition:true});},
    f=>f.assets.set('artifacts/tenant/result.tap','tampered'),f=>f.input.proofs[0].artifact.sha256='0'.repeat(64),
    f=>f.environment.receipts[0].artifactSha256='0'.repeat(64),f=>f.environment.receipts=[],
    f=>f.environment.receipts[0].conclusion='failure',f=>f.environment.receipts[0].skipped=1]){
    const f=fixture();mutate(f);assert.equal(evaluateTenantAcceptance(f.input,f.environment).result,'BLOCKED');
  }
});

test('a passed test cannot be relabeled as an unobserved negative or another boundary',()=>{
  for(const mutate of [f=>f.input.proofs[0].tests[0].polarity='NEGATIVE',f=>f.input.proofs[0].tests[0].boundaryId='another-boundary']){
    const f=fixture();mutate(f);assert.equal(evaluateTenantAcceptance(f.input,f.environment).result,'BLOCKED');
  }
});

test('unexplained bypass, client identity and unbound credential cannot certify a boundary',()=>{
  for(const mutate of [f=>f.input.callers.push({...f.input.callers[0],id:'unexplained'}),
    f=>f.input.obligations[0].actorOrigin='CLIENT_ASSERTED',f=>f.input.obligations[0].ownerBinding='ID_ONLY',
    f=>f.input.obligations[0].connectedAccountBound=false]){
    const f=fixture();mutate(f);const r=evaluateTenantAcceptance(f.input,f.environment);assert.equal(r.result,'BLOCKED');
    assert.ok(r.failures.some(x=>['MISSING_CALLER_REVIEW','UNBOUND_AUTHORITY','UNBOUND_CREDENTIAL_ACCOUNT'].includes(x.code)));
  }
});

test('partial closure cannot clear another independent obligation or launder an external/out-of-scope gap',()=>{
  for(const state of invariantStates.filter(s=>!['VERIFIED_BOUNDARY','APPROVED_NARROW_EXCEPTION','NOT_PERSISTENCE'].includes(s))){
    const f=fixture();f.input.obligations.push({...f.input.obligations[0],id:'SECOND',state});
    const r=evaluateTenantAcceptance(f.input,f.environment);assert.equal(r.result,'BLOCKED');assert.equal(r.certifiedScopedPrivilegedCallers,0);
  }
});

test('credential source classification cannot be bypassed by deleting the secretBearing annotation',()=>{
  const f=fixture(),old=f.input.callers[0].path,path='backend/src/services/integrations/userProviderKeys.ts';
  f.assets.set(path,f.assets.get(old));f.input.callers[0].path=path;f.input.obligations[0].path=path;
  delete f.input.obligations[0].secretBearing;delete f.input.obligations[0].connectedAccountBound;
  const r=evaluateTenantAcceptance(f.input,f.environment);assert.equal(r.result,'BLOCKED');
  assert.ok(r.failures.some(f=>f.code==='UNBOUND_CREDENTIAL_ACCOUNT'));
});

test('only exact registered narrow exceptions with observed allow and denial tests close',()=>{
  const f=fixture();f.input.obligations[0].state='APPROVED_NARROW_EXCEPTION';f.input.obligations[0].exceptionId='global-health';
  assert.equal(evaluateTenantAcceptance(f.input,f.environment).result,'BLOCKED');
  f.environment.exceptions=[{id:'global-health',path:f.input.callers[0].path,callerIds:['caller'],operations:['aggregate_health'],
    authority:'Current server administrative admission',reason:'Fixed non-sensitive global aggregate only'}];
  assert.equal(evaluateTenantAcceptance(f.input,f.environment).result,'PASS');
  f.environment.exceptions[0].operations=['*'];assert.equal(evaluateTenantAcceptance(f.input,f.environment).result,'BLOCKED');
});

test('all ten original criteria are mandatory even with a fully scoped caller register',()=>{
  for(let n=0;n<10;n++){
    for(const mutate of [f=>f.input.criteria[n].status='BLOCKED',f=>f.input.criteria[n].text='relaxed wording',f=>f.input.criteria[n].proofIds=[]]){
      const f=fixture();mutate(f);assert.equal(evaluateTenantAcceptance(f.input,f.environment).result,'BLOCKED');
    }
  }
  const f=fixture();f.input.criteria.pop();assert.equal(evaluateTenantAcceptance(f.input,f.environment).result,'BLOCKED');
});

test('real disposable class, worker and fresh/upgrade requirements cannot use local-only proof',()=>{
  const f=fixture();f.input.proofs[0].kind='LOCAL';f.environment.receipts[0].kind='LOCAL';
  assert.equal(evaluateTenantAcceptance(f.input,f.environment).result,'BLOCKED');
  for(const boundaryId of ['class:files','migration:upgrade',id(5)]){
    const g=fixture();g.input.proofs[0].tests=g.input.proofs[0].tests.filter(t=>t.boundaryId!==boundaryId);
    assert.equal(evaluateTenantAcceptance(g.input,g.environment).result,'BLOCKED');
  }
});

test('non-persistence requires a source-bound semantic review and cannot erase another obligation',()=>{
  const f=fixture(),text='Exact Buffer.from operation only copies local bytes and has no database or storage side effect.';
  f.assets.set('scripts/fixture.test.mjs',text);Object.assign(f.input.obligations[0],{state:'NOT_PERSISTENCE',reason:text,
    review:{path:'scripts/fixture.test.mjs',sha256:hash(text),marker:'Exact Buffer.from operation'}});
  assert.equal(evaluateTenantAcceptance(f.input,f.environment).result,'PASS');
  f.assets.set('scripts/fixture.test.mjs','changed');assert.equal(evaluateTenantAcceptance(f.input,f.environment).result,'BLOCKED');
});
