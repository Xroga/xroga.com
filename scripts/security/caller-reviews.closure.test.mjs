import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import {applyCallerReviews,evaluateCallerClosure,structuredCallerReviewRecords} from './caller-reviews.mjs';
import {tenantCriteria,highRiskClasses} from './tenant-acceptance.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex'),criterion=n=>`XB01-C007-AC${String(n).padStart(2,'0')}`;
function fixture(){
 const sourceSha='a'.repeat(40),path='backend/src/fixture.ts',source='export const owned = (db,owner) => db.from("projects").eq("user_id",owner);';
 const candidate={id:'owned',path,sourceSha256:hash(source),kind:'PRIVILEGED_FACTORY',review:'REVIEW_REQUIRED'};
 const registry={version:'1.0',reviews:[{path,sourceSha256:hash(source),callIds:['owned'],disposition:'SCOPED_BOUNDARY',authority:'The server verifies the original actor and exact current project owner before the scoped operation.',reason:'Complete original Command007 actor and parent scope has authenticated allow and denial evidence.',evidence:[{path:'backend/src/fixture.test.ts',marker:'exact actor owner positive and negative'}]}]};
 const bindings=[];for(const boundaryId of ['BOUNDARY',criterion(4),criterion(5),criterion(6),...highRiskClasses.map(c=>`class:${c}`),'migration:fresh','migration:upgrade'])for(const polarity of ['POSITIVE','NEGATIVE'])bindings.push({id:`${boundaryId} ${polarity}`,boundaryId,polarity});
 const transcript=bindings.map((b,i)=>`ok ${i+1} - ${b.id}`).join('\n'),artifact={path:'artifacts/closure/proof.tap',sha256:hash(transcript)};
 const admission={version:1,sourceSha,obligations:[{id:'BOUNDARY',callerIds:['owned'],path,sourceSha256:hash(source),state:'VERIFIED_BOUNDARY',actorOrigin:'SERVER_VERIFIED',ownerBinding:'EXACT_OWNER_PARENT',connectedAccountBound:true,secretBearing:true,criterionIds:[criterion(2),criterion(4),criterion(6),criterion(10)],proofIds:['real']}],criteria:tenantCriteria.map((text,i)=>({id:criterion(i+1),text,status:'PASS',proofIds:['real']})),proofs:[{id:'real',kind:'DISPOSABLE',sourceSha,artifact,tests:structuredClone(bindings),receiptId:'observed'}]};
 const receipts=[{id:'observed',sourceSha,kind:'DISPOSABLE',conclusion:'success',runId:'12345',artifactSha256:artifact.sha256,failed:0,skipped:0,passedTests:bindings.map(b=>b.id),testBindings:structuredClone(bindings)}];
 const assets=new Map([[path,source],['backend/src/fixture.test.ts','exact actor owner positive and negative'],[artifact.path,transcript]]);
 const environment={readAsset:p=>assets.get(p)??null,receipts,exceptions:[],expectedSourceSha:sourceSha};
 return {candidate,registry,admission,environment,assets};
}
function evaluate(f){return evaluateCallerClosure(applyCallerReviews([f.candidate],f.registry,f.environment.readAsset),f.admission,f.environment);}
test('complete verified original scope passes both existing records without promoting either record',()=>{
 const f=fixture(),before=structuredClone({registry:f.registry,admission:f.admission,assets:f.assets}),r=evaluate(f);assert.equal(r.structured.result,'PASS');assert.equal(r.acceptance.result,'PASS');assert.equal(r.counts.agreedVerified,1);assert.equal(r.counts.manualUnresolved,0);assert.equal(r.rows[0].state,'AGREED_VERIFIED_SCOPE');assert.deepEqual({registry:f.registry,admission:f.admission,assets:f.assets},before);
});
for(const polarity of ['POSITIVE','NEGATIVE'])test(`combined closure rejects missing authenticated ${polarity.toLowerCase()} proof`,()=>{
 const f=fixture();f.admission.proofs[0].tests=f.admission.proofs[0].tests.filter(t=>t.boundaryId!=='BOUNDARY'||t.polarity!==polarity);assert.equal(evaluate(f).acceptance.result,'BLOCKED');
});
for(const [name,mutate]of [
 ['wrong source SHA',f=>f.admission.sourceSha='b'.repeat(40)],
 ['source modified after collection',f=>f.assets.set(f.candidate.path,'changed source')],
 ['forged provider success',f=>{f.admission.proofs[0].kind='PROVIDER';f.environment.receipts[0].kind='PROVIDER';Object.assign(f.environment.receipts[0],{provider:'claimed',providerResource:'claimed',independentPostcondition:true});}],
 ['incorrect credential account identity',f=>f.admission.obligations[0].connectedAccountBound=false],
 ['missing server-issued actor',f=>f.admission.obligations[0].actorOrigin='CLIENT_ASSERTED'],
 ['changed parent ownership binding',f=>f.admission.obligations[0].ownerBinding='STALE_PARENT'],
 ['unsupported manual exception',f=>f.registry.reviews[0].disposition='NARROW_EXCEPTION'],
 ['legacy review relabeled scoped without structured proof',f=>f.admission.obligations=[]],
])test(`combined closure rejects ${name}`,()=>{const f=fixture();mutate(f);assert.equal(evaluate(f).acceptance.result,'BLOCKED');});
test('valid structured proof cannot override an independently unresolved manual tenant requirement',()=>{
 const f=fixture();f.registry.reviews[0].disposition='REVIEWED_GAP';f.registry.reviews[0].reason='Original Command007 target-parent admission remains independently unreviewed in the manual record.';
 const r=evaluate(f);assert.equal(r.structured.result,'PASS');assert.equal(r.acceptance.result,'BLOCKED');assert.equal(r.counts.proofAwaitingManualReconciliation,1);assert.equal(r.counts.manualUnresolved,1);assert.equal(f.registry.reviews[0].disposition,'REVIEWED_GAP');assert.ok(r.acceptance.criteria.filter(c=>[criterion(2),criterion(4),criterion(6),criterion(10)].includes(c.id)).every(c=>c.reasons.includes('UNRESOLVED_MANUAL_TENANT_REVIEW')));
});
test('unimplemented independent later-phase custody stays open without blocking fully proven Command007 scope',()=>{
 const f=fixture();f.registry.reviews[0].laterPhaseObligations=[{requirementId:'XB01-C009-AC01',state:'NOT_IMPLEMENTED',scope:'Independent encrypted custody requirement, not the verified owner selection boundary.'}];
 assert.equal(evaluate(f).acceptance.result,'PASS');assert.equal(f.registry.reviews[0].laterPhaseObligations[0].state,'NOT_IMPLEMENTED');
 f.registry.reviews[0].disposition='REVIEWED_GAP';assert.equal(evaluate(f).acceptance.result,'BLOCKED','An actual manual tenant gap still blocks regardless of later-phase labels');
});
test('all obligations on the same caller must pass before manual scope is supported',()=>{
 const f=fixture();f.admission.obligations.push({...f.admission.obligations[0],id:'UNRESOLVED_PARENT',state:'EVIDENCE_GAP',proofIds:[]});const r=evaluate(f);assert.equal(r.acceptance.result,'BLOCKED');assert.equal(r.rows[0].structuredVerified,false);assert.equal(r.rows[0].dispositionSupported,false);
});
test('manual subset reconciliation preserves the original obligation identity and every open caller',()=>{
 const f=fixture(),original={...f.registry.reviews[0],callIds:['first','second'],disposition:'REVIEWED_GAP'};
 const before=structuredCallerReviewRecords({reviews:[original]})[0];
 const structuredOrigin={id:before.id,callIds:original.callIds,disposition:'REVIEWED_GAP'};
 const scoped={...original,callIds:['first'],disposition:'SCOPED_BOUNDARY',structuredOrigin},gap={...original,callIds:['second'],structuredOrigin};
 const after=structuredCallerReviewRecords({reviews:[scoped,gap]});assert.equal(after.length,1);assert.equal(after[0].id,before.id);assert.deepEqual(after[0].callIds,original.callIds);assert.equal(after[0].legacyDisposition,'REVIEWED_GAP');assert.deepEqual(after[0].manualPartitions.map(p=>p.disposition),['SCOPED_BOUNDARY','REVIEWED_GAP']);
 for(const invalid of [[scoped],[scoped,scoped],[scoped,{...gap,sourceSha256:'0'.repeat(64)}],[scoped,{...gap,structuredOrigin:{...structuredOrigin,id:'OB-forged'}}],[scoped,{...gap,structuredOrigin:{...structuredOrigin,disposition:'NOT_PERSISTENCE'}}]])assert.throws(()=>structuredCallerReviewRecords({reviews:invalid}));
});
