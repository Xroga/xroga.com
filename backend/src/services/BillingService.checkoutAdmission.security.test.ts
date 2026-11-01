import assert from 'node:assert/strict';
import test from 'node:test';
import {BillingService,resetBillingMemoryForTests} from './BillingService.js';
import {createTenantContext,type TenantContext} from '../security/tenantContext.js';
import {executePreparedBusinessAction} from './integrations/businessAction.js';
import {isTerminalModelFailure} from '../ai/providerRuntime.js';
import {executeCheckoutWithFixtureClaim} from './fixtures/checkoutApproval.js';

test('raw user ID cannot create checkout or read provider plan without issued approval',async t=>{
 const values={WHOP_API_KEY:'synthetic-only',WHOP_COMPANY_ID:'biz_qhYONL4RebGX96',WHOP_PLAN_ID:'plan_hlV1A10I5QfSP',WHOP_REDIRECT_URL:'https://xroga.com/workspace?billing=success'};
 const old=Object.fromEntries(Object.keys(values).map(n=>[n,process.env[n]]));Object.assign(process.env,values);
 t.after(()=>{for(const[n,v]of Object.entries(old))if(v===undefined)delete process.env[n];else process.env[n]=v;resetBillingMemoryForTests();});
 resetBillingMemoryForTests();let wire=0;const owner='11111111-1111-4111-8111-111111111111';
 const plan={id:values.WHOP_PLAN_ID,account_id:values.WHOP_COMPANY_ID,plan_type:'renewal',renewal_price:25,billing_period:30,trial_period_days:null,currency:'usd'};
 t.mock.method(globalThis,'fetch',async(_input:Parameters<typeof fetch>[0],init?:RequestInit)=>{wire++;return Response.json(init?.method==='POST'?{id:'ch_admission_fixture',account_id:values.WHOP_COMPANY_ID,plan,purchase_url:'https://whop.com/checkout/plan_hlV1A10I5QfSP/',metadata:JSON.parse(String(init.body)).metadata}:plan);});
 await assert.rejects(BillingService.createCheckout(owner));assert.equal(wire,0);
 const context=createTenantContext({userId:owner,via:'local_jwt'});
 await assert.rejects(BillingService.prepareCheckoutPlan({...context} as TenantContext));assert.equal(wire,0);
 const prepared=await BillingService.prepareCheckoutPlan(context);assert.equal(wire,1);
 for(const authorityPermit of [undefined,{grantId:'serialized-approval-is-not-authority'}]){
  await assert.rejects(executePreparedBusinessAction({userId:owner,plan:prepared,authorization:{explicitUserAuthorization:true,confirmedHighRisk:true},authorityPermit}),isTerminalModelFailure);
  assert.equal(wire,1,'neither model flags nor serialized approval IDs authorize metadata lookup or dispatch');
 }
});

test('checkout redirect and credential denials remain terminal security failures',async t=>{
 const values={WHOP_API_KEY:'synthetic-only',WHOP_COMPANY_ID:'biz_qhYONL4RebGX96',WHOP_PLAN_ID:'plan_hlV1A10I5QfSP',WHOP_REDIRECT_URL:'https://xroga.com/workspace?billing=success'};
 const old=Object.fromEntries(Object.keys(values).map(n=>[n,process.env[n]]));Object.assign(process.env,values);t.after(()=>{for(const[n,v]of Object.entries(old))if(v===undefined)delete process.env[n];else process.env[n]=v;resetBillingMemoryForTests();});
 const plan={id:values.WHOP_PLAN_ID,account_id:values.WHOP_COMPANY_ID,plan_type:'renewal',renewal_price:25,billing_period:30,trial_period_days:null,currency:'usd'};
 for(const status of [307,401,403]){let effects=0;t.mock.method(globalThis,'fetch',async(_input:Parameters<typeof fetch>[0],init?:RequestInit)=>{if(init?.method!=='POST')return Response.json(plan);effects++;return new Response(null,{status,headers:status===307?{location:'http://169.254.169.254/collect'}:{}});});
  await assert.rejects(executeCheckoutWithFixtureClaim('11111111-1111-4111-8111-111111111111'),isTerminalModelFailure);assert.equal(effects,1);
 }
});

test('the unit claim fixture cannot mint authority in a production runtime',async t=>{
 const old=process.env.NODE_ENV;process.env.NODE_ENV='production';t.after(()=>{if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old;});
 let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw new Error('No production fixture transport allowed');});
 await assert.rejects(executeCheckoutWithFixtureClaim('11111111-1111-4111-8111-111111111111'),{message:'Test-only checkout fixture.'});assert.equal(calls,0);
});
