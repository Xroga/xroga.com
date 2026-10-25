import assert from 'node:assert/strict';
import {test} from 'node:test';
import {webReleaseIdentity} from './releaseIdentity';

test('web release uses the explicit tested source before Vercel or virtual merge event metadata',()=>{
  assert.equal(webReleaseIdentity({XROGA_RELEASE_SHA:'a'.repeat(40),VERCEL_GIT_COMMIT_SHA:'b'.repeat(40),GITHUB_SHA:'c'.repeat(40)}),'a'.repeat(40));
  assert.equal(webReleaseIdentity({VERCEL_GIT_COMMIT_SHA:'b'.repeat(40),GITHUB_SHA:'c'.repeat(40)}),'b'.repeat(40));
  assert.equal(webReleaseIdentity({GITHUB_SHA:'abc1234'}),'abc1234');
});
test('web release never exposes arbitrary environment text or falls back from invalid explicit authority',()=>{
  for(const value of ['', 'PRIVATE_CANARY', 'a'.repeat(41), '../abc1234', 'abc1234\n']){
    assert.equal(webReleaseIdentity({XROGA_RELEASE_SHA:value,GITHUB_SHA:'abc1234'}),'unavailable');
  }
  assert.equal(webReleaseIdentity({}),'unavailable');
});
