import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { verifyJobEnvelope } from './jobEnvelope.mjs';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const pem = publicKey.export({type:'spki',format:'pem'});
const expected = {tenantId:'tenant-a',userId:'user-a',runId:'run-a',taskId:'task-a',attempt:1,fence:7,executionId:'execution-a'};
const source = () => ({version:1,issuedAt:1000,expiresAt:61000,fence:7,executionId:'execution-a',start:{type:'start',
  job:{...expected,limits:{maxDurationMs:50000,maxModelCostMicros:0}},plan:{steps:[{op:'screenshot',name:'page.png'}]}}});
const seal = value => {const payload=JSON.stringify(value);return {payload,signature:sign(null,Buffer.from(payload),privateKey).toString('base64')};};

test('accepts a signed, bounded, model-free attempt for exactly one execution',()=>{
  assert.equal(verifyJobEnvelope(seal(source()),pem,expected,1000).fence,7);
  assert.equal(verifyJobEnvelope(seal(source()),pem,expected,20000).expiresAt,61000,'cold-start time reduces execution time instead of invalidating a still-live grant');
});
test('rejects tampering and wrong tenant, owner, task, run, attempt, fence or execution',()=>{
  const envelope=seal(source());
  assert.throws(()=>verifyJobEnvelope({...envelope,payload:envelope.payload+' '},pem,expected,1000));
  for(const field of Object.keys(expected)) assert.throws(()=>verifyJobEnvelope(envelope,pem,{...expected,[field]:'wrong'},1000));
});
test('rejects expired, future, oversized and unbounded attempts',()=>{
  for(const change of [{expiresAt:1000},{issuedAt:1001},{expiresAt:602000},{fence:0}])
    assert.throws(()=>verifyJobEnvelope(seal({...source(),...change}),pem,expected,1000));
  assert.throws(()=>verifyJobEnvelope({payload:'x'.repeat(2097153),signature:''},pem,expected,1000));
  assert.throws(()=>verifyJobEnvelope(seal(null),pem,expected,1000),/AUTHORIZATION_DENIED/);
});
test('refuses model calls, supplied consequential grants and a duration past authorization',()=>{
  for(const mutate of [s=>s.start.job.limits.maxModelCostMicros=1,s=>s.start.plan.steps=[{op:'aiAct'}],
    s=>s.start.plan.writeGrant={grantId:'fabricated'},s=>s.start.job.limits.maxDurationMs=60001]) {
    const s=source();mutate(s);assert.throws(()=>verifyJobEnvelope(seal(s),pem,expected,1000));
  }
});
