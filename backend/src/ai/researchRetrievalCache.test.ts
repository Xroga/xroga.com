import test from 'node:test';
import assert from 'node:assert/strict';
import {createTenantContext} from '../security/tenantContext.js';
import {readRetrievalCache,writeRetrievalCache,retrievalCacheKey} from './researchRetrievalCache.js';
import {parallelSearch,parallelExtract} from './parallelWeb.js';

test('private retrieval cache revalidates ownership after IO and reuses evidence without provider or billing effects',async t=>{
 const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',project='33333333-3333-4333-8333-333333333333';
 const context=createTenantContext({userId:owner,via:'remote_getuser'}),scope={context,userId:owner,projectId:project};
 const body={objective:'public documentation',mode:'turbo',search_queries:['public docs'],result_count:15,research_kind:'normal'};
 const result={search_id:'synthetic-cache-receipt',provider:'deepseek' as const,results:[{url:'https://example.com/docs',title:'Public docs',excerpts:['Public evidence']}]};
 const env={NODE_ENV:'test',SUPABASE_URL:'http://127.0.0.1:55439',SUPABASE_SERVICE_ROLE_KEY:'synthetic-cache-service'};
 const prior=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
 t.after(()=>{for(const k of Object.keys(env)){if(prior[k]===undefined)delete process.env[k];else process.env[k]=prior[k];}});
 let mode='hit',ownerNow=owner,reads=0,writes=0;
 t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
  const url=new URL(String(input));assert.equal(url.origin,env.SUPABASE_URL,'No provider, billing, confirmation or unmocked network effect is permitted');
  if(url.pathname.endsWith('/projects')){
   assert.equal(url.searchParams.get('user_id'),'eq.'+owner);assert.equal(url.searchParams.get('id'),'eq.'+project);
   return Response.json(ownerNow===owner?{id:project}:null);
  }
  if(url.pathname.endsWith('/xroga_private_retrieval_cache')){
   reads++;assert.equal(url.searchParams.get('user_id'),'eq.'+owner);assert.match(url.searchParams.get('cache_key')??'',/^eq\.[a-f0-9]{64}$/);
   assert.ok(url.searchParams.get('expires_at')?.startsWith('gt.'));
   if(mode==='revoke')ownerNow=other;
   if(mode==='unavailable')return Response.json({message:'fixture unavailable'},{status:503});
   return Response.json({result:mode==='poison'?{...result,results:[{...result.results[0],url:'http://169.254.169.254/'}]}:result,expires_at:new Date(Date.now()+(mode==='expired'?-1000:60000)).toISOString()});
  }
  if(url.pathname.endsWith('/put_xroga_private_retrieval_cache')){
   writes++;const payload=JSON.parse(String(init?.body));assert.equal(payload.p_user_id,owner);assert.equal(payload.p_cache_key,retrievalCacheKey(scope,'search',body));assert.equal(payload.p_ttl_seconds,600);assert.deepEqual(payload.p_result,result);
   return Response.json(null);
  }
  throw Error('Unexpected fixture path '+url.pathname);
 });
 assert.deepEqual(await readRetrievalCache(scope,'search',body),result);
 const reused=await parallelSearch({userId:owner,dispatchScope:scope,objective:body.objective,queries:body.search_queries});
 assert.equal(reused.requestId,result.search_id);assert.equal(reused.sources.length,1);assert.equal(reused.needsConfirmation,undefined);
 assert.equal((await parallelExtract({userId:owner,dispatchScope:scope,objective:body.objective,urls:['https://example.com/docs']})).requestId,result.search_id);
 await writeRetrievalCache(scope,'search',body,result);assert.equal(writes,1);
 for(const value of ['expired','poison','unavailable']){mode=value;assert.equal(await readRetrievalCache(scope,'search',body),null);}
 const before=reads;assert.equal(await readRetrievalCache(scope,'search',{...body,objective:'refresh public documentation'}),null);assert.equal(reads,before);
 mode='revoke';await assert.rejects(readRetrievalCache(scope,'search',body));
 await assert.rejects(writeRetrievalCache(scope,'search',body,result));assert.equal(writes,1);
 await assert.rejects(readRetrievalCache({...scope,userId:other},'search',body));
 await assert.rejects(readRetrievalCache({...scope,context:{...context}},'search',body));
 assert.equal(writes,1);
});
