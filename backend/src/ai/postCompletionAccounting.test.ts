import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PostCompletionAccountingError } from './postCompletionAccounting.js';
import { executeWithProviderFallback } from './providerRuntime.js';
import { executeHedgedPlannerFallback, resolveStructuredGoalContract } from './universal/semanticRequestPlanner.js';

test('provider fallback preserves post-completion accounting uncertainty without another attempt', async () => {
  const failure = new PostCompletionAccountingError(); let calls = 0;
  await assert.rejects(executeWithProviderFallback({ routes: ['deepseek_v4_1_flash_1017','claude_sonnet_5_5'], maximumAttemptsPerRoute: 3,
    recordHealth: false, execute: async () => { calls++; throw failure; } }), error => error === failure);
  assert.equal(calls, 1);
});

test('semantic planner does not repair or start a fallback for completed-provider accounting failure', async () => {
  const failure = new PostCompletionAccountingError(); let calls = 0;
  await assert.rejects(executeHedgedPlannerFallback({ routes: ['deepseek_v4_1_flash_1017','claude_sonnet_5_5'], signal: new AbortController().signal,
    routeTimeoutMs: 1000, hedgeDelayMs: 100,
    execute: () => resolveStructuredGoalContract(async () => { calls++; throw failure; }, 2),
  }), error => error === failure);
  assert.equal(calls, 1);
});

test('accounting uncertainty cannot start a hedge or a premium request',async()=>{
 const failure=new PostCompletionAccountingError();let calls=0;
 await assert.rejects(executeHedgedPlannerFallback({routes:['deepseek_v4_1_flash_1017','claude_sonnet_5_5'],signal:new AbortController().signal,routeTimeoutMs:1000,hedgeDelayMs:1,
 execute:async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,10));throw failure;}}),error=>error===failure);
 assert.equal(calls,1);
});
