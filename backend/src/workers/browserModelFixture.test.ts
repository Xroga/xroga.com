import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createTenantContext } from '../security/tenantContext.js';
import { parseBrowserJob } from './browserJob.js';

export const browserOwner='11111111-1111-4111-8111-111111111111';
export const browserProject='33333333-3333-4333-8333-333333333333';
export const ownedBrowserJob=(attempt=1)=>parseBrowserJob({version:1,tenantId:browserOwner,userId:browserOwner,projectId:browserProject,runId:'r1',taskId:'k1',attempt,
  allowedOrigins:['https://example.com'],startUrl:'https://example.com/',limits:{maxDurationMs:60000,maxNavigations:10,maxRedirects:1,maxPages:1,maxResponseBytes:1000000,maxArtifactBytes:1000000,maxModelCostMicros:2000000}});
export function browserModelFixture(t:TestContext){
  const env={NODE_ENV:'test',SUPABASE_URL:'http://127.0.0.1:55436',SUPABASE_SERVICE_ROLE_KEY:'synthetic-db-service-key',
    OPENROUTER_API_KEY:'synthetic-platform-model-key',GLM_API_KEY:'synthetic-platform-model-key',DEEPSEEK_V4_FLASH_MODEL_ID:'deepseek/deepseek-v4-flash'};
  const old=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
  t.after(()=>{for(const k of Object.keys(env)){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}});
  const context=createTenantContext({userId:browserOwner,via:'remote_getuser'});
  const authority={context,revalidate:async()=>{}};
  const ledger={reserved:[] as any[],settled:[] as any[],released:[] as any[],atomic:0};
  const bodies:any[]=[];const reservations=new Map<string,any>();
  const fixture={authority,ledger,bodies,owner:browserOwner,mode:'ok',beforeReserve:()=>{},beforeSettle:()=>{},
    reply:(_body:any):any=>({id:'synthetic-browser-provider',choices:[{message:{content:'owned fixture'}}],usage:{prompt_tokens:1000,completion_tokens:200}})};
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
    const url=new URL(String(input));const body=init?.body?JSON.parse(String(init.body)):{};
    if(['https://openrouter.ai','https://open.bigmodel.cn'].includes(url.origin)){
      assert.equal(init?.redirect,'manual');bodies.push(body);
      assert.equal(new Headers(init?.headers).get('authorization'),'Bearer synthetic-platform-model-key');
      const value=await fixture.reply(body);return value instanceof Response?value:Response.json(value);
    }
    assert.equal(url.origin,env.SUPABASE_URL,'No uncontrolled transport is allowed');
    if(url.pathname==='/rest/v1/projects')return Response.json(fixture.owner===browserOwner?{id:browserProject}:null);
    if(url.pathname==='/rest/v1/user_integrations')return Response.json(null);
    if(url.pathname==='/rest/v1/user_token_usage')return Response.json({user_id:browserOwner,plan_tier:'spark',plan_budget_usd:20,quota_period_start:new Date().toISOString().slice(0,7)+'-01',input_tokens:0,output_tokens:0,spent_usd:0,rollover_usd:0,model_usage:{}});
    if(url.pathname.endsWith('/reserve_xroga_provider_budget')){
      fixture.beforeReserve();
      if(fixture.mode==='reservationDenied')return Response.json({message:'synthetic denial'},{status:400});
      ledger.reserved.push({maximumOutputTokens:body.p_maximum_output_tokens,idempotencyKey:body.p_idempotency_key});
      const row={id:randomUUID(),user_id:browserOwner,status:'reserved',idempotency_key:body.p_idempotency_key,internal_route:body.p_internal_route,
        purpose:body.p_purpose,price_version:body.p_price_version,estimated_input_tokens:body.p_estimated_input_tokens,
        maximum_output_tokens:body.p_maximum_output_tokens,reserved_micro_usd:body.p_reservation_micro_usd};reservations.set(row.id,row);return Response.json(row);
    }
    if(url.pathname.endsWith('/settle_xroga_provider_budget')){
      fixture.beforeSettle();
      if(fixture.mode==='settlementDenied')return Response.json({message:'synthetic settlement denial'},{status:400});
      ledger.settled.push({result:{inputTokens:body.p_actual_input_tokens,outputTokens:body.p_output_tokens}});
      return Response.json({...reservations.get(body.p_reservation_id),status:'settled',settled_micro_usd:body.p_actual_micro_usd,provider_request_id:body.p_provider_request_id,
        actual_input_tokens:body.p_actual_input_tokens,cached_input_tokens:body.p_cached_input_tokens,output_tokens:body.p_output_tokens,reasoning_tokens:body.p_reasoning_tokens,tool_calls:body.p_tool_calls,search_calls:body.p_search_calls});
    }
    if(url.pathname.endsWith('/release_xroga_provider_budget')){ledger.released.push(body);return Response.json(null);}
    if(url.pathname.endsWith('/record_ai_usage_atomic')){
      ledger.atomic++;
      return Response.json({userId:browserOwner,receiptId:body.p_receipt_id,modelId:body.p_model_id,poolRole:body.p_pool_role,inputTokens:body.p_input,outputTokens:body.p_output,costUsd:body.p_cost_usd,
        ledgerId:'1',period:new Date().toISOString().slice(0,7)+'-01',replayed:false,usage:{user_id:browserOwner}});
    }
    assert.fail('Unexpected database protocol '+url.pathname);
  });
  return fixture;
}
