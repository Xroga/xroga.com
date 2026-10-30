import test from 'node:test';
import assert from 'node:assert/strict';
import { loadVoiceModel } from './voiceModelLoading';

test('one interrupted public model download retries once and returns the real loaded instance',async()=>{
  let calls=0,retries=0;const model={loaded:true};
  const result=await loadVoiceModel(async()=>{if(++calls===1)throw new TypeError('Failed to fetch');return model;},()=>retries++);
  assert.equal(result,model);assert.equal(calls,2);assert.equal(retries,1);
});
test('repeated network failures stop after two attempts',async()=>{
  let calls=0;await assert.rejects(loadVoiceModel(async()=>{calls++;throw new TypeError('Failed to fetch');},()=>{}));
  assert.equal(calls,2);
});
test('runtime/model failures are not retried as network failures',async()=>{
  for(const error of [new Error('Unsupported model operator'),new TypeError('Invalid model configuration')]) {
    let calls=0;await assert.rejects(loadVoiceModel(async()=>{calls++;throw error;},()=>{}));
    assert.equal(calls,1);
  }
});
