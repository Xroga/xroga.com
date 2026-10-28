import test from 'node:test';import assert from 'node:assert/strict';
import{runBrowserTask,type BrowserCapabilityDeps}from'./browserCapability.js';import{createTenantContext}from'../security/tenantContext.js';import{InMemoryExecutionStateStore}from'../ai/executionRuntime.js';import{MemoryLeaseStore}from'./leaseStore.js';

test('explicit browser plans cannot carry credential canaries to the worker outside the model gateway',async()=>{
 const context=createTenantContext({userId:'11111111-1111-4111-8111-111111111111',via:'remote_getuser'});let calls=0;
 const deps:BrowserCapabilityDeps={workerId:'fixture',leases:new MemoryLeaseStore(),storeFor:()=>new InMemoryExecutionStateStore(),authoriseProject:async()=>true,drive:{listObjects:async()=>[],putServerObject:async()=>{throw Error('No artifact expected');}},worker:{run:async(job)=>{calls++;return{finalUrl:job.startUrl,visitedUrls:[job.startUrl],navigations:1,responseBytes:1,summary:'fixture',extracted:{},artifacts:[],metrics:{consequentialActions:0}};}}};
 const request={goal:'Inspect the public page',startUrl:'https://example.com/',allowedOrigins:['https://example.com'],plan:{steps:[{op:'fill',selector:'#search',value:'SYNTHETIC_BROWSER_CREDENTIAL_CANARY'}],expect:[]}};
 await assert.rejects(runBrowserTask(context,request,deps),error=>{assert.doesNotMatch(String(error),/SYNTHETIC_BROWSER_CREDENTIAL_CANARY/);return true;});assert.equal(calls,0);
 await assert.rejects(runBrowserTask(context,{...request,startUrl:'https://example.com/?password=opaque-private-value',plan:{steps:[{op:'screenshot',name:'page.png'}],expect:[]}},deps));assert.equal(calls,0);
 const safe={...request,plan:{steps:[{op:'fill',selector:'#search',value:'public documentation'}],expect:[]}};const result=await runBrowserTask(context,safe,deps);assert.equal(result.task.status,'completed');assert.equal(calls,1);
 const outputDeps={...deps,planner:async()=>request.plan as unknown as import('./browserPlan.js').BrowserPlan};await assert.rejects(runBrowserTask(context,{...safe,plan:undefined},outputDeps));assert.equal(calls,1);
});
