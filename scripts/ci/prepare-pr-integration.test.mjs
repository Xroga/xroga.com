import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { validateIntegrationIdentity,projectVanishedNonPersistenceReviews,projectStableArrayConversionReviews,integrationAdmissionProjection } from './prepare-pr-integration.mjs';
import { discoverPersistenceCalls } from '../security/audit-tenant-policies.mjs';
const fixture={ci:'true',event:'pull_request',head:'a'.repeat(40),parents:['b'.repeat(40),'c'.repeat(40)],expectedBase:'b'.repeat(40),expectedHead:'c'.repeat(40)};
test('candidate evidence binds exact virtual merge, base and feature identities without release approval',()=>{
  const result=validateIntegrationIdentity(fixture);
  assert.equal(result.featureSha,fixture.expectedHead);assert.equal(result.baseSha,fixture.expectedBase);
  assert.equal(result.sourceSha,fixture.head);assert.match(result.scope,/NOT_COMMITTED_TRUTH_OR_RELEASE_APPROVAL/);
});

test('integration refreshes only unaccepted derived admission while preserving frozen mappings and original criteria',()=>{
  const path='docs/xroga/security/tenant-invariant-obligations.json',frozen='docs/xroga/batch-1/phases/PHASE-2-FROZEN-WORKLIST.json';
  const template={proofs:[],criteria:Array.from({length:10},()=>({status:'BLOCKED',proofIds:[]}))};
  const outputs=new Map([[frozen,'immutable frozen source\n'],[path,JSON.stringify(template)]]);
  const result=integrationAdmissionProjection(outputs,()=>outputs.get(frozen));assert.equal(result.path,path);assert.deepEqual(JSON.parse(result.content),template);
  assert.throws(()=>integrationAdmissionProjection(outputs,()=> 'changed frozen source\n'),/Immutable Phase1 mapping drift/);
  for(const changed of [{...template,proofs:[{id:'fabricated'}]},{...template,criteria:template.criteria.slice(1)},{...template,criteria:template.criteria.map((c,i)=>i===0?{...c,status:'PASS'}:c)}]){
    assert.throws(()=>integrationAdmissionProjection(new Map([[path,JSON.stringify(changed)]]),()=>''),/cannot grant acceptance/);
  }
  assert.throws(()=>integrationAdmissionProjection(new Map(),()=>''),/Missing derived admission/);
});
test('ordinary local checkouts, missing identities and wrong parents cannot project passing branch truth',()=>{
  for(const changed of [{ci:undefined},{event:'push'},{event:'workflow_dispatch'},
    {head:fixture.expectedHead},{expectedHead:undefined},{parents:[fixture.expectedBase]},
    {parents:[fixture.expectedHead,fixture.expectedBase]},{expectedBase:'d'.repeat(40)},
  ])assert.throws(()=>validateIntegrationIdentity({...fixture,...changed}));
});

test('a newer actual main parent is recorded only after its snapshot ancestry is verified',()=>{
  const newer={...fixture,parents:['d'.repeat(40),fixture.expectedHead]};
  assert.throws(()=>validateIntegrationIdentity(newer));
  const result=validateIntegrationIdentity({...newer,baseSnapshotIsAncestor:true});
  assert.equal(result.baseSha,newer.parents[0]);assert.equal(result.reportedBaseSnapshot,fixture.expectedBase);
});

test('integration retires only exact vanished non-persistence identities and retains security obligations',()=>{
  const path='frontend/removed-decoration.tsx',old='export const decoration = Array.from({length: 10});\n';
  const call=discoverPersistenceCalls(path,old)[0];assert.ok(call);
  const record={path,sourceSha256:createHash('sha256').update(old).digest('hex'),callIds:[call.id],disposition:'NOT_PERSISTENCE'};
  const registry={version:'1.0',reviews:[record,{...record,disposition:'REVIEWED_GAP'}]};
  const result=projectVanishedNonPersistenceReviews(registry,{readFeature:()=>old,readIntegrated:()=>"export const decoration = 'removed';\n"});
  assert.equal(result.registry.reviews.length,1);assert.equal(result.registry.reviews[0].disposition,'REVIEWED_GAP');
  assert.deepEqual(result.retired[0].callIds,[call.id]);assert.equal(registry.reviews.length,2,'Feature evidence is never modified');
  for(const current of [old,'export const x = db.from("secret");','export const x = getSupabaseAdmin();','export const x = db.rpc("write");','export const x = Array.from({length: 5});',null]){
    const unchanged=projectVanishedNonPersistenceReviews({reviews:[record]},{readFeature:()=>old,readIntegrated:()=>current});
    assert.equal(unchanged.retired.length,0,'Any candidate or missing source remains for strict review');
  }
  for(const changed of [{sourceSha256:'0'.repeat(64)},{callIds:['fabricated']},{structuredOrigin:{id:'partitioned'}}]){
    assert.throws(()=>projectVanishedNonPersistenceReviews({reviews:[{...record,...changed}]},{readFeature:()=>old,readIntegrated:()=>''}));
  }
  assert.throws(()=>projectVanishedNonPersistenceReviews({reviews:[{...record,callIds:[discoverPersistenceCalls(path,'getSupabaseAdmin()')[0].id]}]},{readFeature:()=>old,readIntegrated:()=>''}));
});

test('integration rebinds only unique byte-identical native Array conversion functions, not changed security boundaries',()=>{
  const path='frontend/conversion.tsx',old='function convert(list) { return Array.from(list); }\n';
  const record={path,sourceSha256:createHash('sha256').update(old).digest('hex'),callIds:[discoverPersistenceCalls(path,old)[0].id],disposition:'NOT_PERSISTENCE'};
  const project=(current,changed={})=>projectStableArrayConversionReviews({reviews:[{...record,...changed}]},{readFeature:()=>old,readIntegrated:()=>current});
  const current='import { Icon } from "icons";\n'+old+'export const label = "new UI";\n';
  const result=project(current);assert.equal(result.rebound.length,1);
  assert.equal(result.registry.reviews[0].sourceSha256,createHash('sha256').update(current).digest('hex'));
  assert.deepEqual(result.registry.reviews[0].callIds,[discoverPersistenceCalls(path,current)[0].id]);
  assert.equal(record.sourceSha256,createHash('sha256').update(old).digest('hex'),'Feature review remains immutable');
  for(const unsafe of [old.replace('list);','list).filter(Boolean);'),old+old,
    'const Array = database;\n'+old,'import Array from "database";\n'+old,
    'Array.from = database.from;\n'+old,'globalThis.Array = database;\n'+old,
    'globalThis["Array"] = database;\n'+old,'Object.assign(Array, database);\n'+old])assert.equal(project(unsafe).rebound.length,0,unsafe);
  for(const disposition of ['SCOPED_BOUNDARY','REVIEWED_GAP','NARROW_EXCEPTION'])assert.equal(project(current,{disposition}).rebound.length,0);
  assert.equal(project(current,{structuredOrigin:{id:'partitioned'}}).rebound.length,0);
  assert.throws(()=>project(current,{sourceSha256:'0'.repeat(64)}),/Unbound original/);
});

test('a changed rendering closure requires exact source and function review and cannot hide added DML',()=>{
  const path='frontend/reviewed-conversion.tsx',old='function convert(list) { return Array.from(list); }\n';
  const current='function convert(list) { const label="reviewed"; return Array.from(list); }\ndb.from("new_private_table");\n';
  const hash=value=>createHash('sha256').update(value).digest('hex');
  const record={path,sourceSha256:hash(old),callIds:[discoverPersistenceCalls(path,old)[0].id],disposition:'NOT_PERSISTENCE'};
  const review={path,featureSourceSha256:hash(old),integratedSourceSha256:hash(current),reviewedMainSource:'a'.repeat(40),
    functions:[{expression:'Array.from(list)',featureFunctionSha256:hash(old.trim()),integratedFunctionSha256:hash(current.split('\n')[0])}]};
  const project=(text,reviewedFunctionChanges=[review],change={})=>projectStableArrayConversionReviews({reviews:[{...record,...change}]},{readFeature:()=>old,readIntegrated:()=>text,reviewedFunctionChanges});
  const approved=project(current);assert.equal(approved.rebound.length,1);
  assert.equal(approved.rebound[0].unchangedFunctionSha256.length,0);
  assert.equal(approved.rebound[0].reviewedChangedFunctions.length,1);
  const database=discoverPersistenceCalls(path,current).find(call=>call.target==='new_private_table');
  assert.ok(database&&!approved.registry.reviews[0].callIds.includes(database.id),'New persistence remains a separate obligation');
  assert.equal(project(current,[]).rebound.length,0);
  for(const changed of [{integratedSourceSha256:'0'.repeat(64)},{featureSourceSha256:'0'.repeat(64)},
    {functions:[{...review.functions[0],integratedFunctionSha256:'0'.repeat(64)}]}])assert.equal(project(current,[{...review,...changed}]).rebound.length,0);
  assert.equal(project(current+'// unreviewed change\n').rebound.length,0);
  for(const disposition of ['SCOPED_BOUNDARY','NARROW_EXCEPTION','REVIEWED_GAP'])assert.equal(project(current,[review],{disposition}).rebound.length,0);
  const shadowed='const Array=db;\n'+current;
  assert.equal(project(shadowed,[{...review,integratedSourceSha256:hash(shadowed)}]).rebound.length,0);
});
