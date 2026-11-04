import assert from 'node:assert/strict';
import test from 'node:test';
import {chatCompletion} from './openaiCompat.js';
import {registerModelSdkAdmission} from './modelSdkAdmission.js';

test('production transport acquires capacity before revalidating authority and releases after one actual SDK completion',async t=>{
  const env={NODE_ENV:'production',SUPABASE_URL:'https://synthetic-pacing.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'synthetic-not-a-real-key',ZURELAY_API_KEY:'synthetic-zurelay-key'};
  const previous=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
  t.after(()=>{for(const k of Object.keys(env)){if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];}});
  const events:string[]=[],binding={userId:'11111111-1111-4111-8111-111111111111',reservationId:'22222222-2222-4222-8222-222222222222'};
  const model='deepseek-v4.1-flash-1017';let rejectAuthority=false,limited=false,wires=0;
  t.mock.method(globalThis,'fetch',async(input:string|URL|Request,init?:RequestInit)=>{
    const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
    if(url.pathname.endsWith('/claim_xroga_model_request')){
      events.push('capacity');const body=JSON.parse(String(init?.body));
      assert.equal(body.p_user_id,binding.userId);assert.equal(body.p_reservation_id,binding.reservationId);
      assert.match(body.p_key,/^[a-f0-9]{64}$/);return Response.json({granted:true,retry_after_ms:0});
    }
    if(url.pathname.endsWith('/release_xroga_model_request')){
      events.push('release');assert.equal(JSON.parse(String(init?.body)).p_cooldown_seconds,limited?120:0);return Response.json(null);
    }
    if(url.hostname==='synthetic-pacing.supabase.co'&&url.pathname==='/rest/v1/model_provider_health')return Response.json(null);
    assert.equal(url.href,'https://api.zurelay.com/v1/chat/completions');events.push('provider');wires++;
    if(limited)return Response.json({error:{code:'rate_limit_exceeded',message:'fixture rate limit'}},{status:429,headers:{'retry-after':'120'}});
    return Response.json({id:'synthetic-pacing-request',model,usage:{prompt_tokens:2,completion_tokens:2,total_tokens:4},
      choices:[{index:0,message:{role:'assistant',content:'Offline fixture'},finish_reason:'stop'}]},
      {headers:{'x-request-id':'synthetic-pacing-request','x-zurelay-model':model}});
  });
  const run=async()=>{
    const guard=async()=>{events.push('authority');if(rejectAuthority)throw Error('Revoked while waiting');};
    const admission=registerModelSdkAdmission(guard,'deepseek_v4_1_flash_1017',undefined,binding);
    try{return await chatCompletion('deepseek_v4_1_flash_1017',[{role:'user',content:'Offline fixture'}],{maxTokens:20,beforeDispatch:guard});}
    finally{admission.revoke();}
  };
  assert.equal((await run()).text,'Offline fixture');assert.deepEqual(events,['capacity','authority','provider','release']);
  events.length=0;rejectAuthority=true;await assert.rejects(run());
  assert.deepEqual(events,['capacity','authority','release']);assert.equal(wires,1,'Revoked authority sends no provider bytes');
  events.length=0;rejectAuthority=false;limited=true;await assert.rejects(run(),(e:any)=>e.status===429);
  assert.equal(wires,2,'A 429 never triggers an SDK retry');assert.deepEqual(events,['capacity','authority','provider','release']);
});
