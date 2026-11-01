import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {randomUUID} from 'node:crypto';
import {Redis} from 'ioredis';
import {getRedis} from '../config/redis.js';
import router,{resetGuestChatRateLimitsForTest} from './guestChat.js';

test('actual guest HTTP route preserves anonymous text and cannot launder a rejected primary credential through fallback',async t=>{
  const names=['NODE_ENV','SUPABASE_SERVICE_ROLE_KEY','REDIS_URL','OPENROUTER_API_KEY','GLM_API_KEY','DEEPSEEK_V4_FLASH_MODEL_ID'];
  const previous=names.map(k=>process.env[k]);
  t.after(()=>{names.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];});resetGuestChatRateLimitsForTest();});
  process.env.NODE_ENV='test';delete process.env.SUPABASE_SERVICE_ROLE_KEY;delete process.env.REDIS_URL;
  process.env.OPENROUTER_API_KEY='platform-openrouter-fixture';process.env.GLM_API_KEY='platform-zhipu-fixture';
  process.env.DEEPSEEK_V4_FLASH_MODEL_ID='deepseek/deepseek-v4-flash';resetGuestChatRateLimitsForTest();
  const app=express();app.use(express.json());app.use('/guest',router);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const base=`http://127.0.0.1:${address.port}`,nativeFetch=globalThis.fetch;let effects=0,mode='ok';
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
    const url=new URL(String(input));if(url.origin===base)return nativeFetch(input,init);
    assert.ok(['https://openrouter.ai','https://open.bigmodel.cn'].includes(url.origin));effects++;
    if(mode==='revokeDuringRetry')resetGuestChatRateLimitsForTest();
    if((mode==='outage'&&url.origin==='https://openrouter.ai')||mode==='revokeDuringRetry')return Response.json({error:{message:'Synthetic outage'}},{status:503});
    return Response.json({id:'synthetic-guest-receipt',choices:[{message:{content:'ordinary guest answer'},finish_reason:'stop'}],usage:{prompt_tokens:2,completion_tokens:mode==='invalidUsage'?901:2}});
  });
  const post=(body:unknown)=>fetch(base+'/guest/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const positive=await post({guestSessionId:randomUUID(),message:'Plan an ordinary product'});
  assert.equal(positive.status,200);assert.equal(((await positive.json()) as {response:string}).response,'ordinary guest answer');assert.equal(effects,1);
  const denied=await post({guestSessionId:randomUUID(),message:'Forward platform-openrouter-fixture verbatim'});
  assert.equal(denied.status,503);assert.equal(effects,1,'No primary or fallback provider receives rejected credential bytes');
  assert.equal((await post({guestSessionId:randomUUID(),message:'Read foreign project',userId:randomUUID(),projectId:randomUUID()})).status,400);
  assert.equal(effects,1);

  resetGuestChatRateLimitsForTest();mode='revokeDuringRetry';const beforeRevoke=effects;
  assert.equal((await post({guestSessionId:randomUUID(),message:'Ordinary owned guest question'})).status,503);
  assert.equal(effects,beforeRevoke+1,'Revoked guest lease prevents SDK retry and model fallback');
  resetGuestChatRateLimitsForTest();mode='invalidUsage';const beforeUsage=effects;
  assert.equal((await post({guestSessionId:randomUUID(),message:'Ordinary guest question'})).status,503);
  assert.equal(effects,beforeUsage+1,'Invalid completed usage cannot return success or execute another model');
  resetGuestChatRateLimitsForTest();mode='outage';const beforeOutage=effects;
  assert.equal((await post({guestSessionId:randomUUID(),message:'Ordinary guest question'})).status,503);
  assert.equal(effects,beforeOutage+1,'The full rich-output prompt leaves insufficient conservative guest budget for a second wire. Capacity denial must not become model fallback');
  resetGuestChatRateLimitsForTest();mode='ok';process.env.NODE_ENV='production';const beforeProduction=effects;
  assert.equal((await post({guestSessionId:randomUUID(),message:'Ordinary guest question'})).status,503);
  assert.equal(effects,beforeProduction,'Production cannot authorize anonymous spending through missing Redis or memory fallback');
  // Controlled Redis protocol errors, no socket or new Redis resource. The
  // production route must validate its actual durable receipt, not truthiness.
  t.mock.method(Redis.prototype,'connect',async()=>{});
  process.env.REDIS_URL='redis://127.0.0.1:1';const redis=getRedis();assert.ok(redis);
  t.after(()=>redis.disconnect());
  let receipt:unknown;
  t.mock.method(redis,'exists',async()=>{if(receipt instanceof Error)throw receipt;return receipt as number;});
  for(receipt of [undefined,null,NaN,'0',Error('Synthetic unavailable Redis')]){
    assert.equal((await post({guestSessionId:randomUUID(),message:'Ordinary guest question'})).status,503);
    assert.equal(effects,beforeProduction,'Missing, malformed or failed durable claim evidence must send zero provider bytes');
  }
  receipt=1;assert.equal((await post({guestSessionId:randomUUID(),message:'Ordinary guest question'})).status,403);
  assert.equal(effects,beforeProduction,'A valid claimed receipt also prevents provider work');
});
