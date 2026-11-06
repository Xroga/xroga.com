import assert from 'node:assert/strict';
import test from 'node:test';
import {grokLiveSearch} from './research.js';
import {geminiGenerate,geminiFactCheck} from '../lib/gemini.js';

test('retired Grok and Gemini cannot dispatch or manufacture research',async t=>{
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw Error('No external bytes');});
  for(const includeX of [false,true])await assert.rejects(grokLiveSearch('Unverified claim','synthetic-retired-key',{includeX,forceX:includeX},async()=>{calls++;throw Error('Must not fetch');}),{code:'MODEL_DESTINATION_DENIED'});
  await assert.rejects(geminiGenerate('system','question'),{code:'MODEL_DESTINATION_DENIED'});
  await assert.rejects(geminiFactCheck(['claim'],['https://example.com']),{code:'MODEL_DESTINATION_DENIED'});
  assert.equal(calls,0);
});
