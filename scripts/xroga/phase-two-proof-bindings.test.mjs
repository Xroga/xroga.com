import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifyHistoricalProofBinding} from './phase-two-proof-bindings.mjs';

const hash=s=>createHash('sha256').update(s).digest('hex');
const invocation='it("owner isolation",()=>{assert.equal(fork.projectId,"owned");})';
const before=invocation+'; it("network",()=>oldBridge());';
const after=invocation+'; it("network",()=>assert.throws(registryOnly));';
const binding={scope:'UNCHANGED_TEST_HISTORICAL_CANDIDATE_NOT_ACCEPTANCE',marker:'owner isolation',
  historicalSourceSha256:hash(before),currentSourceSha256:hash(after),testCallSha256:hash(invocation)};

test('historical candidate hash is preserved only for an exact current binding and unchanged complete test call',()=>{
  assert.equal(verifyHistoricalProofBinding(binding,before,after),hash(before));
});
test('changed assertion, missing or ambiguous test, forged hashes and acceptance scope fail closed',()=>{
  for(const text of [after.replace('"owned"','"foreign"'),after.replace('owner isolation','missing'),after+';'+invocation]){
    assert.throws(()=>verifyHistoricalProofBinding({...binding,currentSourceSha256:hash(text)},before,text));
  }
  for(const field of ['historicalSourceSha256','currentSourceSha256','testCallSha256','scope']){
    assert.throws(()=>verifyHistoricalProofBinding({...binding,[field]:'forged'},before,after));
  }
  assert.throws(()=>verifyHistoricalProofBinding(binding,before,after+'//unreviewed'));
});
