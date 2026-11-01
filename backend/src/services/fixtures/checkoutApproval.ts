import {randomUUID} from 'node:crypto';
import {BillingService} from '../BillingService.js';
import {createTenantContext} from '../../security/tenantContext.js';
import {executeAuthorizedAction} from '../../security/authority/enforce.js';
import {preparedActionDigest} from '../../security/authority/digest.js';
import {businessActionAuthorityScope} from '../integrations/businessAction.js';

/** Unit fixture claim only. The separate route integration exercises the real
 * confirmation read/claim/authorize/finish RPC path. No production grant issuer.
 */
export async function executeCheckoutWithFixtureClaim(userId:string){
 if(process.env.NODE_ENV!=='test')throw new Error('Test-only checkout fixture.');
 const context=createTenantContext({userId,via:'local_jwt'}),plan=await BillingService.prepareCheckoutPlan(context),scope=businessActionAuthorityScope(plan);
 const claim={id:randomUUID(),userId,scopeDigest:preparedActionDigest(scope),expiresAt:scope.expiresAt,claimedAt:new Date().toISOString()};
 const oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY,original=globalThis.fetch;
 const origin=process.env.SUPABASE_URL??'http://127.0.0.1:1';
 Object.assign(process.env,{SUPABASE_URL:origin,SUPABASE_SERVICE_ROLE_KEY:process.env.SUPABASE_SERVICE_ROLE_KEY??'synthetic-audit-fixture'});
 globalThis.fetch=async(input,init)=>{
  const url=new URL(String(input));
  if(url.origin===origin){
   if(url.pathname!=='/rest/v1/production_audit_log'||init?.method!=='POST')throw new Error('Only exact synthetic audit receipt permitted');
   const body=JSON.parse(String(init.body));if(body.user_id!==userId||body.actor_id!==userId||body.action!=='egress_decision')throw new Error('Wrong audit owner');return Response.json(body);
  }
  return original(input,init);
 };
 try{return await executeAuthorizedAction({context,scope,claim,revalidateBeforeEffect:async()=>claim},authorityPermit=>BillingService.createCheckout(userId,{plan,authorityPermit}));}
 finally{
  globalThis.fetch=original;
  if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;
  if(oldKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey;
 }
}
