import assert from 'node:assert/strict';import test from 'node:test';import {randomUUID} from 'node:crypto';import {createServer} from 'node:http';import express from 'express';
import {isDeepStrictEqual} from 'node:util';
import router from './billing.js';import type {AuthRequest} from '../middleware/auth.js';import {createTenantContext} from '../security/tenantContext.js';
import {cancelBusinessActionConfirmation} from '../services/integrations/businessActionConfirmations.js';
import {actionPlanDigest} from '../services/integrations/businessAction.js';

test('real checkout route uses canonical owner claim, egress, one dispatch and durable completion',async t=>{
 const values={NODE_ENV:'test',SUPABASE_URL:'http://127.0.0.1:55436',SUPABASE_SERVICE_ROLE_KEY:'synthetic-only',WHOP_API_KEY:'synthetic-held-checkout-key',WHOP_COMPANY_ID:'biz_qhYONL4RebGX96',WHOP_PLAN_ID:'plan_hlV1A10I5QfSP',WHOP_REDIRECT_URL:'https://xroga.com/workspace?billing=success'};
 const old=Object.fromEntries(Object.keys(values).map(n=>[n,process.env[n]]));Object.assign(process.env,values);t.after(()=>{for(const[n,v]of Object.entries(old))if(v===undefined)delete process.env[n];else process.env[n]=v;});
 const owner=randomUUID(),context=createTenantContext({userId:owner,via:'local_jwt'}),native=globalThis.fetch;
 let row:any=null,mode='ok',actor='owner',effects=0,claims=0,audits:any[]=[],dbReads=0,providerReads=0;
 const providerPlan={id:values.WHOP_PLAN_ID,account_id:values.WHOP_COMPANY_ID,plan_type:'renewal',renewal_price:25,billing_period:30,trial_period_days:null,currency:'usd'};
 t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
  const url=new URL(String(input));const body=init?.body?JSON.parse(String(init.body)):null;
  if(url.origin==='https://api.whop.com'){
   if(url.pathname.endsWith('/plans/'+values.WHOP_PLAN_ID)){providerReads++;return Response.json(providerPlan);}
   assert.equal(url.pathname,'/api/v1/checkout_configurations');assert.equal(init?.method,'POST');assert.equal(init.redirect,'manual');effects++;
   assert.equal(audits.at(-1)?.outcome,'ALLOW');assert.equal(row.status,'executing');assert.ok(row.effect_started_at);
   assert.equal(body.metadata.xroga_user_id,owner);assert.equal(body.metadata.xroga_checkout_id,row.plan.authority.nonce);
   if(mode==='provider403'||mode==='provider503')return Response.json({message:'PRIVATE_PROVIDER_CANARY'},{status:mode==='provider403'?403:503});
   if(mode==='redirect')return new Response(null,{status:307,headers:{location:'http://169.254.169.254/collect'}});
   const metadata={...body.metadata,...(mode==='nonce-substitution'?{xroga_checkout_id:'older-checkout'}:{})};
   return Response.json({id:'ch_owned_checkout',account_id:values.WHOP_COMPANY_ID,plan:providerPlan,mode:'payment',metadata,purchase_url:'https://whop.com/checkout/plan_hlV1A10I5QfSP/?session=owned',...(mode==='oversized'?{padding:'x'.repeat(65537)}:{})});
  }
  if(url.origin!==values.SUPABASE_URL)return native(input,init);
  dbReads++;
  if(url.pathname==='/rest/v1/production_audit_log'){
   assert.equal(body.user_id,owner);assert.doesNotMatch(JSON.stringify(body),/synthetic-held-checkout-key|PRIVATE_PROVIDER_CANARY/);audits.push(body);
   if(mode==='audit-fail')return Response.json({message:'synthetic outage'},{status:503});
   if(mode==='cancel-at-audit')row.status='cancelled';
   if(mode==='expire-at-audit')row.expires_at=new Date(0).toISOString();
   if(mode==='rotate-at-audit')process.env.WHOP_API_KEY='synthetic-rotated-checkout-key';
   if(mode==='audit-substituted-owner')return Response.json({...body,user_id:randomUUID()});
   return Response.json(body);
  }
  if(url.pathname==='/rest/v1/business_action_confirmations'){
   if(init?.method==='POST'){row={...body,id:randomUUID(),created_at:new Date().toISOString(),claimed_at:null,completed_at:null};return Response.json(row);}
   assert.equal(url.searchParams.get('id'),'eq.'+row.id);
   if(url.searchParams.get('user_id')!=='eq.'+row.user_id)return Response.json(null);
   if(init?.method==='PATCH'){Object.assign(row,body);return Response.json(row);}
   return Response.json(row);
  }
  assert.equal(body.p_owner,owner);
  if(url.pathname.endsWith('/claim_business_action_confirmation')){
   claims++;if(row.status!=='pending'||body.p_digest!==row.plan_digest)return Response.json(null);
   row={...row,status:'executing',claimed_at:new Date().toISOString()};return Response.json(row);
  }
  if(url.pathname.endsWith('/authorize_business_action_dispatch')){
   assert.equal(body.p_expected.id,row.id);
   const exact=['id','user_id','plan','plan_digest','summary','toolkit','risk','created_at','expires_at','claimed_at'].every(key=>isDeepStrictEqual(body.p_expected[key],row[key]));
   return Response.json(row.status==='executing'&&exact&&Date.parse(row.expires_at)>Date.now()?{...row,effect_started_at:row.effect_started_at??=new Date().toISOString()}:null);
  }
  if(url.pathname.endsWith('/finish_business_action_confirmation')){
   if(row.status!=='executing')return Response.json(null);
   const receipt=body.p_expected.effect_receipt;
   row={...row,status:body.p_status,failure_code:body.p_failure_code,completed_at:new Date().toISOString(),...(receipt?{effect_receipt:{...receipt,outcome:body.p_status==='consumed'?'provider_reported_success':'dispatch_uncertain',recordedAt:new Date().toISOString()}}:{})};return Response.json(row);
  }
  throw new Error('Unapproved fixture database call');
 });
 const app=express();app.use(express.json());app.use((req:AuthRequest,_res,next)=>{req.userId=owner;req.tenantContext=actor==='missing'?undefined:actor==='clone'?{...context}:actor==='foreign'?createTenantContext({userId:randomUUID(),via:'local_jwt'}):context;next();});app.use(router);
 const server=createServer(app);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();assert.ok(address&&typeof address!=='string');const base=`http://127.0.0.1:${address.port}`;t.after(async()=>{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));});
 const prepare=()=>native(base+'/checkout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({planTier:'spark'})});
 const confirm=()=>native(base+`/checkout/${row.id}/confirm`,{method:'POST'});
 for(actor of ['missing','clone','foreign'])await t.test('prepare denies '+actor+' actor before any credential or provider read',async()=>{const before=[dbReads,providerReads,effects];assert.notEqual((await prepare()).status,200);assert.deepEqual([dbReads,providerReads,effects],before);});
 actor='owner';
 for(const scenario of ['ok','cancelled','foreign-confirmation','wrong-operation','changed-target','changed-summary','audit-fail','audit-substituted-owner','cancel-at-audit','expire-at-audit','rotate-at-audit','provider403','provider503','redirect','oversized','nonce-substitution','concurrent'])await t.test(scenario,async()=>{
  mode=scenario;effects=claims=0;audits=[];process.env.WHOP_API_KEY=values.WHOP_API_KEY;
  const prepared=await prepare();assert.equal(prepared.status,200);const preview=await prepared.json() as any;assert.equal(preview.confirmation.toolSlug,'XROGA_CREATE_CHECKOUT');assert.equal(effects,0);
  if(mode==='concurrent'){const results=await Promise.all([confirm(),confirm()]);assert.equal(results.filter(r=>r.status===200).length,1);assert.equal(effects,1);return;}
  if(mode==='cancelled')await cancelBusinessActionConfirmation(owner,row.id);
  if(mode==='foreign-confirmation')row.user_id=randomUUID();
  if(['wrong-operation','changed-target','changed-summary'].includes(mode)){
   if(mode==='wrong-operation')row.plan.toolkit='github';
   if(mode==='changed-target')row.plan.arguments.body.account_id='foreign';
   if(mode==='changed-summary')row.plan.summary='A harmless free read';
   const {planDigest:_,...unsigned}=row.plan;row.plan.planDigest=actionPlanDigest(unsigned);row.plan_digest=row.plan.planDigest;row.summary=row.plan.summary;row.toolkit=row.plan.toolkit;
  }
  const response=await confirm(),result=await response.json();actor='owner';
  if(mode==='ok'){assert.equal(response.status,200);assert.equal((result as any).purchaseUrl,'https://whop.com/checkout/plan_hlV1A10I5QfSP/?session=owned');assert.equal(row.status,'consumed');assert.equal(effects,1);}
  else{assert.notEqual(response.status,200);assert.doesNotMatch(JSON.stringify(result),/synthetic-held-checkout-key|PRIVATE_PROVIDER_CANARY/);assert.equal(effects,['provider403','provider503','redirect','oversized','nonce-substitution'].includes(mode)?1:0);}
  if(mode!=='foreign-confirmation'){const before=effects;assert.notEqual((await confirm()).status,200);assert.equal(effects,before,'used, denied or uncertain confirmation cannot retry provider dispatch');}
 });
});
