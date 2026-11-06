import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CODING_MODEL_TRANSPORT, ProviderPolicyError, RESEARCH_MODEL_TRANSPORT, assertCodingModel, codingModelsOnly, isCodingModel, isResearchModel, requiredCodingTransport } from './providerPolicy.js';
import { MODELS, ACTIVE_MODEL_IDS } from './models.js';
import { capabilityCandidates } from '../synthesis/universalEntrypoint.js';
import { getRuntimeModelRegistry } from './modelCapabilityRegistry.js';
import { getRouterAdminConfig } from './routerConfig.js';

test('only the two approved Zurelay identities carry engineering authority',()=>{
  assert.deepEqual(Object.keys(CODING_MODEL_TRANSPORT).sort(),[...ACTIVE_MODEL_IDS].sort());
  for(const id of ACTIVE_MODEL_IDS){assert.equal(isCodingModel(id),true);assert.equal(requiredCodingTransport(id),'zurelay');assert.doesNotThrow(()=>assertCodingModel(id,'engineering'));}
});
test('historical records retain their old transport but never execution authority',()=>{
  assert.equal(MODELS.kimi_k3.provider,'moonshot');assert.equal(MODELS.glm_5_3.provider,'zhipu');assert.equal(MODELS.deepseek_v4_flash.provider,'openrouter');
  for(const id of ['kimi_k3','glm_5_3','glm_5_3_flash','deepseek_v4_flash','grok_4_5','grok_4_3','tavily','future_model',undefined,null]){
    assert.equal(isCodingModel(id),false);assert.equal(isResearchModel(id),false);
    if(typeof id==='string'){assert.equal(requiredCodingTransport(id),null);assert.throws(()=>assertCodingModel(id,'engineering'),ProviderPolicyError);}
  }
  assert.deepEqual(RESEARCH_MODEL_TRANSPORT,{});assert.equal((MODELS as Record<string,unknown>).grok_4_3,undefined);
});
test('candidate filters retain supported models and deny retired, retrieval and unknown providers',()=>{
  const candidates=[...ACTIVE_MODEL_IDS,'kimi_k3','glm_5_3','grok_4_3','tavily','future'].map(modelId=>({modelId}));
  assert.deepEqual(codingModelsOnly(candidates).map(m=>m.modelId),ACTIVE_MODEL_IDS);
  for(const candidate of capabilityCandidates())assert.equal(isResearchModel(candidate.profile.modelId),false);
});
test('both runtime entries have coding priors, but no implicit model substitution or premium default',()=>{
  const registry=getRuntimeModelRegistry();assert.deepEqual(registry.map(m=>m.id),ACTIVE_MODEL_IDS);
  for(const model of registry){assert.equal(isCodingModel(model.id),true);assert.ok(model.strengths.coding>0);assert.deepEqual(model.preferredFallbacks,[]);}
  assert.equal(registry.find(m=>m.id==='claude_sonnet_5_5')?.enabled,false);
  assert.deepEqual(getRouterAdminConfig({XROGA_MODEL_FALLBACK_ORDER:'grok_4_3,kimi_k3,claude_sonnet_5_5'}).fallbackOrder,[]);
});
