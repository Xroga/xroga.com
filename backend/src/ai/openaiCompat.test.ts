import assert from 'node:assert/strict';
import {test} from 'node:test';
import {providerReasoningControls,providerPriceControls,assertProviderControls,requireNonEmptyModelText} from './openaiCompat.js';
import {validateZurelayRequest} from './zurelayWire.js';
const id='deepseek_v4_1_flash_1017';
test('nonempty text is preserved and empty text remains an explicit failure without fallback permission',()=>{
 assert.equal(requireNonEmptyModelText('  answer  ',id),'answer');assert.throws(()=>requireNonEmptyModelText('   ',id),{code:'EMPTY_PROVIDER_RESPONSE'});
});
test('compact DeepSeek output uses documented reasoning_effort none, without unsupported Sonnet controls',()=>{
 assert.deepEqual(providerReasoningControls('zurelay','none',id),{reasoning_effort:'none'});
 assert.deepEqual(providerReasoningControls('zurelay','default',id),{});
 assert.deepEqual(providerReasoningControls('zurelay','none','claude_sonnet_5_5'),{});
 assert.deepEqual(providerPriceControls(id,'zurelay'),{});
});
test('the serialized nonthinking control cannot be removed and hidden provider alternatives are refused',()=>{
 const expected={...providerReasoningControls('zurelay','none',id)};
 assert.doesNotThrow(()=>assertProviderControls(JSON.stringify(expected),id,'zurelay','none'));
 for(const changed of [{},{reasoning_effort:'high'},{reasoning_effort:undefined}])assert.throws(()=>assertProviderControls(JSON.stringify(changed),id,'zurelay','none'),{code:'MODEL_DISPATCH_BINDING_DENIED'});
 const request={model:'deepseek-v4.1-flash-1017',max_tokens:64,messages:[{role:'user',content:'Fixture'}],...expected};
 for(const extra of [{provider:{max_price:{prompt:.03}}},{models:['claude-sonnet-5-5']},{routing:'auto'}])assert.throws(()=>validateZurelayRequest({...request,...extra},request.model),{code:'MODEL_DESTINATION_DENIED'});
});

 it('serialized price or reasoning controls cannot be removed or changed before dispatch', () => {
   const expected={...providerPriceControls('deepseek_v4_flash','openrouter'),...providerReasoningControls('openrouter','none')};
   assert.doesNotThrow(()=>assertProviderControls(JSON.stringify(expected),'deepseek_v4_flash','openrouter','none'));
   for(const changed of [{},{...expected,provider:undefined},{...expected,reasoning:{exclude:true}},{...expected,provider:{max_price:{prompt:99}}}]) {
     assert.throws(()=>assertProviderControls(JSON.stringify(changed),'deepseek_v4_flash','openrouter','none'),{code:'MODEL_DISPATCH_BINDING_DENIED'});
   }
 });
