import {executeCheckoutWithFixtureClaim} from './fixtures/checkoutApproval.js';
import assert from 'node:assert/strict';
import test,{type TestContext} from 'node:test';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {BillingService,resetBillingMemoryForTests} from './BillingService.js';
const plan={id:'plan_hlV1A10I5QfSP',account_id:'biz_qhYONL4RebGX96',plan_type:'renewal',renewal_price:25,billing_period:30,trial_period_days:null,currency:'usd',purchase_url:'https://whop.com/checkout/plan_hlV1A10I5QfSP/'};
function configured(t:TestContext){
 const values={WHOP_API_KEY:'synthetic-only',WHOP_COMPANY_ID:plan.account_id,WHOP_PLAN_ID:plan.id,WHOP_REDIRECT_URL:'https://xroga.com/workspace?billing=success'};
 for(const[key,value]of Object.entries(values)){const old=process.env[key];process.env[key]=value;t.after(()=>{if(old===undefined)delete process.env[key];else process.env[key]=old;});}
 resetBillingMemoryForTests();t.after(resetBillingMemoryForTests);
}
test('fixed plan read rejects oversized otherwise valid provider receipts',async t=>{
 configured(t);t.mock.method(globalThis,'fetch',async()=>Response.json({...plan,padding:'x'.repeat(65537)}));
 await assert.rejects(BillingService.verifyConfiguredPlan(true),{code:'provider_unavailable'});
});
test('fixed plan read refuses actual redirect and never forwards its issuer credential',async t=>{
 configured(t);const native=globalThis.fetch;let outside=0;
 const sink=createServer((_req,res)=>{outside++;res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify(plan));});
 const source=createServer((_req,res)=>res.writeHead(307,{location:`http://127.0.0.1:${(sink.address() as AddressInfo).port}/collect`}).end());
 await new Promise<void>(r=>sink.listen(0,'127.0.0.1',r));await new Promise<void>(r=>source.listen(0,'127.0.0.1',r));
 t.mock.method(globalThis,'fetch',async(url:Parameters<typeof fetch>[0],init?:RequestInit)=>{assert.equal(String(url),'https://api.whop.com/api/v1/plans/'+plan.id);return native(`http://127.0.0.1:${(source.address() as AddressInfo).port}/`,init);});
 try{await assert.rejects(BillingService.verifyConfiguredPlan(true),{code:'provider_unavailable'});assert.equal(outside,0);}
 finally{source.closeAllConnections();sink.closeAllConnections();await Promise.all([new Promise<void>(r=>source.close(()=>r())),new Promise<void>(r=>sink.close(()=>r()))]);}
});
test('plan denial prevents checkout dispatch and failure does not poison later authorized read',async t=>{
 configured(t);let requests=0;
 t.mock.method(globalThis,'fetch',async(_url:Parameters<typeof fetch>[0],init?:RequestInit)=>{requests++;assert.equal(init?.method??'GET','GET');return new Response('denied',{status:403});});
 await assert.rejects(executeCheckoutWithFixtureClaim('11111111-1111-4111-8111-111111111111'),{code:'provider_unavailable'});assert.equal(requests,1);
 t.mock.method(globalThis,'fetch',async()=>Response.json(plan));await BillingService.verifyConfiguredPlan(true);
});
test('bounded approved plan read preserves exact contract rejection and cache',async t=>{
 configured(t);let requests=0;t.mock.method(globalThis,'fetch',async()=>{requests++;return Response.json(plan);});
 await BillingService.verifyConfiguredPlan(true);await BillingService.verifyConfiguredPlan();assert.equal(requests,1);
 t.mock.method(globalThis,'fetch',async()=>Response.json({...plan,account_id:'foreign'}));await assert.rejects(BillingService.verifyConfiguredPlan(true),{code:'plan_mismatch'});
});
