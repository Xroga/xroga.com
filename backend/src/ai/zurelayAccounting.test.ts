import test from 'node:test';
import assert from 'node:assert/strict';
import {actualProviderCostMicroUsd,estimateProviderReservationMicroUsd} from './providerBudget.js';

test('Zurelay cache reads use published rates and reasoning is part of completion usage',()=>{
  const deep={modelId:'deepseek_v4_1_flash_1017' as const,inputTokens:1_000_000,cachedInputTokens:500_000,outputTokens:1_000_000,reasoningTokens:400_000};
  assert.equal(actualProviderCostMicroUsd(deep),135370);
  assert.equal(actualProviderCostMicroUsd({...deep,reasoningTokens:0}),135370);
  const sonnet={...deep,modelId:'claude_sonnet_5_5' as const};
  assert.equal(actualProviderCostMicroUsd(sonnet),4384500);
  assert.ok(estimateProviderReservationMicroUsd({modelId:sonnet.modelId,estimatedInputTokens:sonnet.inputTokens,maximumOutputTokens:sonnet.outputTokens})>actualProviderCostMicroUsd(sonnet));
});

test('invalid usage cannot become a cheaper receipt and sub-micro requests retain a cost',()=>{
  const usage={modelId:'deepseek_v4_1_flash_1017' as const,inputTokens:2,outputTokens:2};
  assert.equal(actualProviderCostMicroUsd(usage),1);
  assert.throws(()=>actualProviderCostMicroUsd({...usage,cachedInputTokens:3}));
  assert.throws(()=>actualProviderCostMicroUsd({...usage,reasoningTokens:3}));
});

test('historical provider accounting retains its previous meaning without execution permission',()=>{
  const historical={modelId:'glm_5_3_flash' as const,inputTokens:10000,outputTokens:100,reasoningTokens:10};
  assert.equal(actualProviderCostMicroUsd(historical),1555);
  assert.equal(actualProviderCostMicroUsd({...historical,cachedInputTokens:9000}),1555);
  assert.equal(actualProviderCostMicroUsd({modelId:'deepseek_v4_flash',inputTokens:2817,outputTokens:4096,providerCostMicroUsd:1985}),1985);
});
