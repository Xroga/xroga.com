import test from 'node:test';
import assert from 'node:assert/strict';
import {runApprovedRetrievalPlan,retrievalMaximum,type RetrievalReceipt} from './researchRetrievalPlan.js';
import {normaliseDeepseekFetch,deepseekSearchBody} from './researchSearchProvider.js';
import {retrievalCacheKey,retrievalTtlSeconds,retrievalRefreshRequested,validCachedRetrieval} from './researchRetrievalCache.js';
import {createTenantContext} from '../security/tenantContext.js';

const body=(kind='normal',count=15)=>({mode:'turbo',objective:'Compare the current public API documentation',search_queries:['public API documentation'],result_count:count,research_kind:kind,research_run_id:'11111111-1111-4111-8111-111111111111'});
test('official Fetch accepts only documented Markdown and a real-shaped upstream receipt',()=>{
  const result=normaliseDeepseekFetch({title:'Documentation',content:'Public API details'},'https://example.com/docs','trace-01234567');
  assert.equal(result.results[0].url,'https://example.com/docs');assert.deepEqual(result.results[0].excerpts,['Public API details']);
  assert.equal(normaliseDeepseekFetch({title:'Empty',content:' '},'https://example.com','trace-01234567').results.length,0);
  for(const value of [null,{}, {title:'X',content:123}])assert.throws(()=>normaliseDeepseekFetch(value,'https://example.com','trace-01234567'));
  assert.throws(()=>normaliseDeepseekFetch({title:'X',content:'Y'},'https://example.com',null));
});
test('query bounds count Unicode characters without splitting surrogate pairs',()=>{
  const q='🌍'.repeat(200);const result=deepseekSearchBody({objective:q,search_queries:[q]});
  assert.equal([...result.query].length,128);assert.equal([...result.ori_question!].length,128);
  assert.throws(()=>deepseekSearchBody({objective:'x',search_queries:['  ']}));
});
test('normal, automatic and manual plans have independent hard operation and result ceilings',()=>{
  assert.equal(retrievalMaximum('search',body()),750);
  assert.equal(retrievalMaximum('search',body('automatic',30)),1500);
  assert.equal(retrievalMaximum('search',body('deep',50)),3750);
  assert.throws(()=>retrievalMaximum('search',body('normal',50)));
  assert.throws(()=>retrievalMaximum('search',body('invented',15)));
  assert.throws(()=>retrievalMaximum('extract',{urls:Array(11).fill('https://example.com')}));
});
for(const [kind,count,expected] of [['normal',15,['search']],['automatic',30,['search','search']],['deep',50,['search','extract','search','extract','search']]] as const){
  test(`${kind} continues within the approved envelope and preserves paid results before another effect`,async()=>{
    const operations:string[]=[],queries:string[]=[],order:string[]=[];
    const result=await runApprovedRetrievalPlan({operation:'search',body:body(kind,count),
      execute:async(operation,request)=>{
        operations.push(operation);order.push('dispatch');if(operation==='search'){queries.push((request.search_queries as string[])[0]);assert.equal(request.result_count,count);}
        return {provider:'deepseek',search_id:'trace-'+operations.length.toString().padStart(8,'0'),results:operation==='extract'
          ?[{url:(request.urls as string[])[0],title:'Inspected primary evidence',excerpts:['Full public evidence']}]
          :[{url:'https://official.example.com/docs',title:'Official docs',excerpts:['Search summary']},{url:'https://independent.example.org/evidence',title:'Independent',excerpts:['Other evidence']}]};
      },progress:async()=>{order.push('persist');}});
    assert.deepEqual(operations,[...expected]);assert.deepEqual(order,operations.flatMap(()=>['dispatch','persist']));
    assert.equal(new Set(queries).size,queries.length);assert.ok(result.results.some(p=>p.url==='https://official.example.com/docs'));
    if(kind==='deep')assert.ok(result.results.some(p=>p.excerpts?.includes('Full public evidence')));
  });
}
test('ten explicitly supplied URLs produce exactly ten individually receipted Fetch operations',async()=>{
  let calls=0;const urls=Array.from({length:10},(_,i)=>`https://example.com/docs/${i}`);
  const result=await runApprovedRetrievalPlan({operation:'extract',body:{urls,objective:'Compare these public pages'},execute:async(operation,request)=>{
    calls++;assert.equal(operation,'extract');assert.equal((request.urls as string[]).length,1);
    return {provider:'deepseek',search_id:'trace-'+calls.toString().padStart(8,'0'),results:[{url:(request.urls as string[])[0],excerpts:['Public page']}]};
  },progress:async()=>{}});
  assert.equal(calls,10);assert.equal(result.results.length,10);
});
test('unsafe search destinations never become Fetch requests and a failed call is never retried',async()=>{
  let calls=0;
  await assert.rejects(runApprovedRetrievalPlan({operation:'search',body:body('deep',50),execute:async(operation)=>{
    calls++;if(calls===2)throw new Error('synthetic downstream failure');assert.equal(operation,'search');
    return {provider:'deepseek',search_id:'trace-01234567',results:[{url:'https://127.0.0.1/private',excerpts:['untrusted']}]};
  },progress:async()=>{}}),/synthetic downstream failure/);
  assert.equal(calls,2);
});
test('private cache keys bind issued owner, project, operation and depth; data cannot forge authority',()=>{
  const user='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
  const context=createTenantContext({userId:user,via:'remote_getuser'}),scope={context,userId:user,projectId:'project-a'};
  const key=retrievalCacheKey(scope,'search',body());
  assert.notEqual(key,retrievalCacheKey({...scope,projectId:'project-b'},'search',body()));
  assert.notEqual(key,retrievalCacheKey(scope,'search',body('deep',50)));
  assert.notEqual(key,retrievalCacheKey({context:createTenantContext({userId:other,via:'remote_getuser'}),userId:other},'search',body()));
  assert.throws(()=>retrievalCacheKey({...scope,userId:other},'search',body()));
  assert.throws(()=>retrievalCacheKey({...scope,context:{...context}},'search',body()));
  assert.equal(retrievalTtlSeconds('latest release'),60);assert.equal(retrievalTtlSeconds('documentation concepts'),600);
  assert.equal(retrievalRefreshRequested('refresh this search'),true);
});
test('poisoned, empty or oversized private cache evidence is not reused',()=>{
  const good:RetrievalReceipt={provider:'deepseek',search_id:'trace-01234567',results:[{url:'https://example.com/docs',excerpts:['Public facts']}]};
  assert.equal(validCachedRetrieval(good),true);
  for(const result of [{...good,provider:'parallel'},{...good,results:[]},{...good,results:[{url:'https://127.0.0.1',excerpts:['private']}]},
    {...good,results:[{url:'https://example.com',excerpts:['x'.repeat(12_001)]}]},{...good,results:[{url:'https://example.com',excerpts:[]}]}])assert.equal(validCachedRetrieval(result),false);
});
