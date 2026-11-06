import assert from 'node:assert/strict';
import {test} from 'node:test';
import {CODING_MODEL_TIERS,FAMILY_TRANSPORT,MIN_EVIDENCE_SAMPLES,SUFFICIENT_VALIDATION_RATE,TransportPolicyError,assertTransportPolicy,chooseCostAware,codingTierFor,familyFor,modelAvailability,type ModelEvidence} from './providerCostTiers.js';
const ordinary='deepseek_v4_1_flash_1017',premium='claude_sonnet_5_5';
const evidence=(over:Partial<ModelEvidence>&{modelId:string}):ModelEvidence=>({role:'implementation',validationSuccessRate:.9,samples:20,costUsdPerTask:.05,maturity:'verified',...over});
const choose=(records:ModelEvidence[])=>chooseCostAware({role:'implementation',candidates:[premium,ordinary,'kimi_k3'],evidence:records,env:{}});
test('only the two approved engineering models have an executable Zurelay transport',()=>{
 assert.deepEqual(FAMILY_TRANSPORT,{deepseek:'zurelay',claude:'zurelay'});
 assert.deepEqual(CODING_MODEL_TIERS.map(({modelId,family,tier})=>({modelId,family,tier})),[{modelId:ordinary,family:'deepseek',tier:'cost_efficient'},{modelId:premium,family:'claude',tier:'premium'}]);
 for(const row of CODING_MODEL_TIERS){assert.doesNotThrow(()=>assertTransportPolicy(row.modelId,'zurelay'));assert.deepEqual(codingTierFor(row.modelId),row);assert.equal(familyFor(row.modelId),row.family);assert.equal(modelAvailability(row.modelId,{}),'available');}
});
test('legacy credentials and names cannot restore a retired transport',()=>{
 for(const id of ['kimi_k3','glm_5_3','glm_5_3_flash','deepseek_v4_flash','kimi_k2_7','grok_4_5','zurelay-auto','auto','unknown']){
  for(const provider of ['zurelay','openrouter','moonshot','zhipu'])assert.throws(()=>assertTransportPolicy(id,provider),TransportPolicyError);
  assert.equal(modelAvailability(id,{KIMI_API_KEY:'synthetic',GLM_API_KEY:'synthetic',OPENROUTER_API_KEY:'synthetic'}),'unknown_model');assert.equal(codingTierFor(id),null);
 }
 for(const id of [ordinary,premium])for(const provider of ['openrouter','moonshot','zhipu'])assert.throws(()=>assertTransportPolicy(id,provider),TransportPolicyError);
});
test('operator identity overrides cannot advertise an unapproved external model',()=>{
 assert.equal(modelAvailability(ordinary,{ZURELAY_DEEPSEEK_MODEL_ID:'zurelay-auto'}),'not_configured');
 assert.equal(modelAvailability(premium,{ZURELAY_SONNET_MODEL_ID:'other'}),'not_configured');
});
test('verified ordinary evidence chooses the default without purchasing premium',()=>{
 const result=choose([evidence({modelId:ordinary,costUsdPerTask:.01}),evidence({modelId:premium,costUsdPerTask:.001})]);assert.equal(result?.modelId,ordinary);assert.equal(result?.measured,true);assert.deepEqual(result?.escalation,[]);
});
test('unmeasured, undersampled, experimental and other-role evidence remain explicitly prior-based',()=>{
 for(const observation of [undefined,{samples:MIN_EVIDENCE_SAMPLES-1},{maturity:'experimental' as const},{role:'code_review'}]){
  const result=choose([evidence({modelId:premium}),...(observation?[evidence({modelId:ordinary,...observation})]:[])]);assert.equal(result?.modelId,ordinary);assert.equal(result?.measured,false);assert.deepEqual(result?.escalation,[]);
 }
});
test('known poor default performance returns no route and never spends on premium automatically',()=>{
 assert.equal(choose([evidence({modelId:ordinary,validationSuccessRate:SUFFICIENT_VALIDATION_RATE-.01}),evidence({modelId:premium})]),null);
});
test('premium-only and retired-only candidates need their separate canonical authority path',()=>{
 for(const candidates of [[premium],['kimi_k3','glm_5_3'],[]])assert.equal(chooseCostAware({role:'implementation',candidates,evidence:[evidence({modelId:premium})]}),null);
});
