import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateIntegrationIdentity } from './prepare-pr-integration.mjs';
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
