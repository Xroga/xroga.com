import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVE_MODEL_IDS, MODELS, callableModelIds, resolveModelSpec } from './models.js';
import { assertModelSelection, assertModelProviderDestination } from './providerPolicy.js';
import { reserveProviderBudget } from './providerBudget.js';
import { getRouterAdminConfig } from './routerConfig.js';
import { resolveEndpoint, createModelProviderClient } from './openaiCompat.js';
import { validateZurelayRequest, validateZurelayUsage, verifyZurelayResponse } from './zurelayWire.js';

const model = 'deepseek-v4.1-flash-1017';
const headers = { 'x-request-id':'synthetic-request-1', 'x-zurelay-model':model };
const usage = {prompt_tokens:25,completion_tokens:40,total_tokens:65};
const endpoint = {apiKey:'offline-fixture-key',baseUrl:'https://api.zurelay.com/v1',apiModel:model,provider:'zurelay'};
const request = {model,messages:[{role:'user' as const,content:'Fixture'}],max_tokens:40};

test('only two fresh identities are callable, historical records and prices retain their meaning', async () => {
  assert.deepEqual(callableModelIds({}), ACTIVE_MODEL_IDS);
  assert.equal(MODELS.deepseek_v4_flash.provider, 'openrouter');
  assert.equal(MODELS.kimi_k3.outputUsdPer1M, 15);
  for (const id of ['kimi_k3','glm_5_3','glm_5_3_flash','deepseek_v4_flash'] as const) {
    assert.throws(() => resolveEndpoint(id,'fixture-key'), /historical/);
    await assert.rejects(reserveProviderBudget({userId:'fixture-owner',modelId:id,estimatedInputTokens:1,maximumOutputTokens:1}), /historical/);
  }
  assert.equal(resolveModelSpec('deepseek_v4_1_flash_1017',{ZURELAY_DEEPSEEK_MODEL_ID:'zurelay-auto'}),null);
  const policy=getRouterAdminConfig({XROGA_ALLOWED_MODELS:'kimi_k3,claude_sonnet_5_5',XROGA_MODEL_FALLBACK_ORDER:'glm_5_3,claude_sonnet_5_5'});
  assert.deepEqual(policy.allowedModels,['claude_sonnet_5_5']);assert.deepEqual(policy.fallbackOrder,[]);
  assert.deepEqual(policy.enabledProviders,['zurelay']);
  assert.throws(() => assertModelProviderDestination('openrouter','https://openrouter.ai/api/v1'));
});

test('no forged/plain-object Sonnet grant, hidden alternatives or provider price overrides', () => {
  assertModelSelection('deepseek_v4_1_flash_1017',1000);
  assert.throws(() => assertModelSelection('claude_sonnet_5_5',1000));
  assert.throws(() => assertModelSelection('claude_sonnet_5_5',1000,{reason:'complex_multifile_debug',taskId:'fixture',permit:{grantId:'forged'},binding:{} as never}));
  for (const changed of [{models:[]},{provider:{max_price:1}},{routing:'auto'},{model:'auto'},{model:'zurelay-auto'},{max_tokens:Infinity},{max_tokens:0}]) {
    assert.throws(() => validateZurelayRequest({...request,...changed},model));
  }
  validateZurelayRequest(request,model);
  const sonnet={...request,model:'claude-sonnet-5-5'};
  validateZurelayRequest(sonnet,sonnet.model);
  assert.throws(() => validateZurelayRequest({...sonnet,temperature:.3},sonnet.model));
  assert.throws(() => validateZurelayRequest({...sonnet,tool_choice:'required'},sonnet.model));
  assert.throws(() => validateZurelayRequest({...sonnet,messages:[{role:'user',content:[{type:'text',text:'Example',cache_control:{type:'ephemeral'}}]}]},sonnet.model));
  validateZurelayUsage({...usage,prompt_tokens_details:{cached_tokens:10},completion_tokens_details:{reasoning_tokens:20}});
  for(const changed of [{cache_creation_input_tokens:5},{prompt_tokens_details:{cache_write_tokens:5}},{completion_tokens_details:{reasoning_tokens:41}}]) {
    assert.throws(()=>validateZurelayUsage({...usage,...changed}));
  }
});

test('actual SDK boundary fixes origin, disables provider substitution and never follows redirects', async () => {
  const original=globalThis.fetch;let calls=0;
  try {
    globalThis.fetch=async(input,init)=>{
      calls++;assert.equal(String(input),'https://api.zurelay.com/v1/chat/completions');
      assert.equal(new Headers(init?.headers).get('x-zurelay-fallback'),'off');assert.equal(init?.redirect,'manual');
      return Response.json({id:'synthetic-request-1',model,usage,choices:[{index:0,message:{role:'assistant',content:'Fixture only'},finish_reason:'stop'}]},{headers});
    };
    const client=createModelProviderClient(endpoint,async()=>{});
    const result=await client.chat.completions.create(request);
    assert.equal(result.model,model);assert.equal(calls,1);
    await assert.rejects(client.chat.completions.create({...request,model:'zurelay-auto'}));assert.equal(calls,1);
    globalThis.fetch=async()=>{calls++;return new Response(null,{status:307,headers:{location:'https://example.com'}});};
    await assert.rejects(client.chat.completions.create(request),(error:any)=>error.type==='xroga_model_redirect_denied_after_dispatch');
    assert.equal(calls,2);
  } finally {globalThis.fetch=original;}
});

test('missing usage, misrouting and a stopped completion cannot be published as a complete receipt', async () => {
  for (const [body,h] of [
    [{model,choices:[]},headers],
    [{model:'other',usage},headers],
    [{model,usage},{...headers,'x-zurelay-model':'other'}],
    [{model,usage},{...headers,'x-zurelay-routed-from':'another'}],
    [{model,usage,choices:[{finish_reason:'stop'}]},{...headers,'x-zurelay-stopped':'budget'}],
  ] as const) {
    await assert.rejects(verifyZurelayResponse(Response.json(body,{headers:h}),model,false),(error:any)=>error.type==='xroga_model_redirect_denied_after_dispatch');
  }
});

test('real SSE parser preserves Unicode and terminal usage, rejects drops and wrong streamed models', async () => {
  const frames=[{id:'synthetic-request-1',model,choices:[{index:0,delta:{content:'مرحبا'},finish_reason:null}]},
    {id:'synthetic-request-1',model,choices:[{index:0,delta:{},finish_reason:'stop'}]},
    {id:'synthetic-request-1',model,choices:[],usage}];
  const sse=frames.map(frame=>'data: '+JSON.stringify(frame)+'\n\n').join('')+'data: [DONE]\n\n';
  const checked=await verifyZurelayResponse(new Response(sse,{headers}),model,true);
  assert.equal(await checked.text(),sse);
  for (const bad of [sse.replace(JSON.stringify(frames[2]),JSON.stringify({...frames[2],usage:undefined})),sse.replace(/"model":"[^"]+"/,'"model":"other"'),sse.replace('data: [DONE]','')]) {
    const response=await verifyZurelayResponse(new Response(bad,{headers}),model,true);
    await assert.rejects(response.text());
  }
});
