import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { validateIntegrationIdentity,projectVanishedNonPersistenceReviews } from './prepare-pr-integration.mjs';
import { discoverPersistenceCalls } from '../security/audit-tenant-policies.mjs';
const fixture={ci:'true',event:'pull_request',head:'a'.repeat(40),parents:['b'.repeat(40),'c'.repeat(40)],expectedBase:'b'.repeat(40),expectedHead:'c'.repeat(40)};
test('candidate evidence binds exact virtual merge, base and feature identities without release approval',()=>{
  const result=validateIntegrationIdentity(fixture);
  assert.equal(result.featureSha,fixture.expectedHead);assert.equal(result.baseSha,fixture.expectedBase);
  assert.equal(result.sourceSha,fixture.head);assert.match(result.scope,/NOT_COMMITTED_TRUTH_OR_RELEASE_APPROVAL/);
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
