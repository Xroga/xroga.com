import {randomUUID} from 'node:crypto';
import {getSecret} from '../config/envSecrets.js';
import {requireTenantContext,requireResourceOwner} from '../security/tenantContext.js';
import {getTenantSupabaseAdmin} from '../security/serviceRoleGuard.js';
import {preparedActionDigest} from '../security/authority/digest.js';
import {enforceEgress,EgressDenied} from '../security/egress/egressPolicy.js';
import {persistSecurityDecision} from '../security/egress/securityDecision.js';
import {publicHttpsUrl} from '../security/egress/urlPolicy.js';
import {containsCredentialSecretText} from '../security/egress/dataClassification.js';
import {requireAdmittedRunAttempt} from './runStore.js';
import {requireModelProjectBinding,type TenantModelScope} from './tenantModelDispatch.js';
import {finishFailedProviderReservation,type ProviderReservation} from './providerBudget.js';
import {PostCompletionAccountingError} from './postCompletionAccounting.js';
import {WEB_PRICE_VERSION} from './webBudget.js';
import {AuthorityError} from '../security/authority/enforce.js';

type Operation='search'|'extract'|'responses';
const denied=()=>Object.assign(new Error('Research dispatch admission is unavailable.'),{code:'PROVIDER_RESERVATION_DENIED',retryable:false});
const exact=(a:unknown,b:number)=>(typeof a==='number'||typeof a==='string'&&/^\d+$/.test(a))&&Number(a)===b&&Number.isSafeInteger(Number(a));

/** Parallel's fixed per-request charges use the existing provider reservation
 * table and RPCs. This adapter adds no ledger, entitlement or identity issuer.
 * Pricing source: https://docs.parallel.ai/getting-started/pricing, 2026-10-27.
 * Shared caller provenance and provider-internal URL fetching remain separate
 * review obligations, never certified by this low-level transport alone.
 */
export async function executeParallelRequest(input:{scope:TenantModelScope|undefined;userId:string;operation:Operation;body:Record<string,unknown>;signal?:AbortSignal}):Promise<Response>{
  const context=requireTenantContext(input.scope?.context);requireResourceOwner(context,input.userId);
  const scope={...input.scope!,context},body=structuredClone(input.body),operation=input.operation,signal=input.signal;
  const attempt=scope.runAttempt?requireAdmittedRunAttempt(scope.runAttempt):undefined;
  // One dispatch remains bound to the platform credential present at admission.
  // Rotation or removal cannot silently substitute a different credential after
  // ownership, audit, reservation or provider-response waits.
  const credential=getSecret('PARALLEL_API_KEY');
  if(!credential)throw denied();
  const check=async()=>{
    signal?.throwIfAborted();requireResourceOwner(context,scope.userId);
    await requireModelProjectBinding(scope);
    if(scope.authority)throw denied(); // A model permit cannot authorize another provider operation.
    if(attempt){
      requireResourceOwner(context,attempt.userId);
      const {data,error}=await getTenantSupabaseAdmin(context).from('swarm_runs').select('id,user_id,project_id,status,worker_id,lease_generation')
        .eq('id',attempt.runId).eq('user_id',context.userId).maybeSingle();
      if(error||!data||data.id!==attempt.runId||data.user_id!==context.userId||data.project_id!==(scope.projectId??null)
        ||data.status!=='running'||data.worker_id!==attempt.workerId||data.lease_generation!==attempt.generation)throw denied();
    }
    if(!credential||getSecret('PARALLEL_API_KEY')!==credential)throw denied();
    signal?.throwIfAborted();
  };
  let amount:number,units=1,route:string;
  if(operation==='search'){
    if(body.mode!=='turbo'||!Array.isArray(body.search_queries)||!body.search_queries.length||body.search_queries.length>3
      ||body.search_queries.some(q=>typeof q!=='string'||q.length>500)||typeof body.objective!=='string'||body.objective.length>4000
      ||Object.keys(body).some(k=>!['mode','objective','search_queries'].includes(k)))throw denied();
    amount=1000;route='parallel_search_turbo';
  }else if(operation==='extract'){
    if(!Array.isArray(body.urls)||!body.urls.length||body.urls.length>4||body.urls.some(u=>typeof u!=='string')
      ||typeof body.objective!=='string'||body.objective.length>4000||Object.keys(body).some(k=>!['urls','objective'].includes(k)))throw denied();
    for(const url of body.urls as string[])publicHttpsUrl(url);
    units=body.urls.length;amount=1000*units;route='parallel_extract';
  }else if(operation==='responses'){
    const effort=(body.reasoning as {effort?:unknown})?.effort;
    if(body.model!=='parallel'||typeof body.input!=='string'||body.input.length>10000||!['low','medium'].includes(String(effort))
      ||Object.keys(body).some(k=>!['model','input','reasoning'].includes(k))||Object.keys(body.reasoning as object).some(k=>k!=='effort'))throw denied();
    amount=effort==='medium'?50000:10000;route=effort==='medium'?'parallel_responses_medium':'parallel_responses_low';
  }else throw denied();
  await check();
  const destination=`https://api.parallel.ai/v1/${operation}`,digest=preparedActionDigest(body);
  try{
    await enforceEgress({context,actionClass:'READ',destination,recipient:'parallel-public-research',purpose:route,payload:body,declaredClass:'PUBLIC',toolTrust:'SERVER_REGISTERED',
      binding:{userId:context.userId,provider:'parallel',connectedAccountId:'platform',operation:route,targetDigest:digest,planDigest:digest}},r=>persistSecurityDecision(context,r));
  }catch(error){
    if((error as {name?:string})?.name==='EgressDenied'||(error as {reason?:unknown})?.reason)throw error;
    throw denied();
  }
  await check();
  // Production always needs the durable canonical store. There is no local
  // user-ID fallback, memory budget or telemetry-as-accounting path here.
  if(!process.env.SUPABASE_SERVICE_ROLE_KEY)throw denied();
  const db=getTenantSupabaseAdmin(context),idempotencyKey=randomUUID(),internalRoute='web.'+route;
  const reserve=()=>db.rpc('reserve_xroga_provider_budget',{p_user_id:context.userId,p_idempotency_key:idempotencyKey,p_purpose:'daily_work',p_internal_route:internalRoute,
    p_price_version:WEB_PRICE_VERSION,p_estimated_input_tokens:0,p_maximum_output_tokens:0,p_reservation_micro_usd:amount});
  let reserved;
  try{
    reserved=await reserve();
    if(reserved.error&&/active_billing_cycle_required/i.test(reserved.error.message)){
      const free=await db.rpc('ensure_xroga_free_cycle',{p_user_id:context.userId});if(free.error)throw denied();reserved=await reserve();
    }
  }catch{throw denied();}
  const row=reserved.data;
  if(reserved.error||!row||Array.isArray(row)||typeof row.id!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(row.id)
    ||row.user_id!==context.userId||row.idempotency_key!==idempotencyKey||row.internal_route!==internalRoute||row.purpose!=='daily_work'
    ||row.status!=='reserved'||row.price_version!==WEB_PRICE_VERSION||!exact(row.estimated_input_tokens,0)||!exact(row.maximum_output_tokens,0)||!exact(row.reserved_micro_usd,amount))throw denied();
  const reservation:ProviderReservation={id:row.id,reservedMicroUsd:amount,priceVersion:WEB_PRICE_VERSION};
  let completed=false,settledVerified=false;
  try{
    await check();
    const response=await fetch(destination,{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json',...(operation==='responses'?{Authorization:`Bearer ${credential}`}:{'x-api-key':credential})},
      body:JSON.stringify(body),signal:AbortSignal.any([AbortSignal.timeout(operation==='responses'?45000:25000),...(signal?[signal]:[])])});
    if(response.redirected||response.status>=300&&response.status<400){await response.body?.cancel().catch(()=>undefined);throw new EgressDenied('UNSAFE_DESTINATION');}
    if(response.status===401||response.status===403){await response.body?.cancel().catch(()=>undefined);throw new AuthorityError('PARALLEL_PROVIDER_AUTHORIZATION_DENIED');}
    if(!response.ok){void response.body?.cancel().catch(()=>undefined);throw Object.assign(new Error(`Parallel provider request failed (${response.status}).`),{status:response.status});}
    completed=true;
    const reader=response.body?.getReader();let size=0;const chunks:Uint8Array[]=[];
    try{if(!reader)throw new Error('Missing provider receipt');for(;;){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>2*1024*1024)throw new Error('Provider receipt too large');chunks.push(next.value);}}
    finally{await reader?.cancel().catch(()=>undefined);reader?.releaseLock();}
    const text=Buffer.concat(chunks).toString('utf8'),data=JSON.parse(text),requestId=data?.[operation==='search'?'search_id':operation==='extract'?'extract_id':'id'];
    if(typeof requestId!=='string'||!requestId.trim()||requestId!==requestId.trim()||requestId.length>500
      ||/[\x00-\x20\x7f]/.test(requestId)||containsCredentialSecretText(requestId))throw new Error('Missing or unsafe provider request identity');
    const {data:settled,error}=await db.rpc('settle_xroga_provider_budget',{p_user_id:context.userId,p_reservation_id:reservation.id,p_actual_micro_usd:amount,p_provider_request_id:requestId,
      p_actual_input_tokens:0,p_cached_input_tokens:0,p_output_tokens:0,p_reasoning_tokens:0,p_tool_calls:0,p_search_calls:units});
    if(error||!settled||settled.id!==reservation.id||settled.user_id!==context.userId||settled.status!=='settled'||settled.internal_route!==internalRoute
      ||settled.price_version!==WEB_PRICE_VERSION||settled.provider_request_id!==requestId||!exact(settled.reserved_micro_usd,amount)||!exact(settled.settled_micro_usd,amount)
      ||!exact(settled.actual_input_tokens,0)||!exact(settled.cached_input_tokens,0)||!exact(settled.output_tokens,0)||!exact(settled.reasoning_tokens,0)||!exact(settled.tool_calls,0)||!exact(settled.search_calls,units))throw new Error('Settlement receipt mismatch');
    settledVerified=true;
    await check();
    return new Response(text,{status:response.status,headers:{'Content-Type':'application/json'}});
  }catch(error){
    if(settledVerified)throw error;
    if(completed){
      await finishFailedProviderReservation({userId:context.userId,reservation,error:new Error('Research completion requires reconciliation')}).catch(()=>undefined);
      // No response publication or provider retry after an uncertain completed call.
      throw new PostCompletionAccountingError();
    }
    await finishFailedProviderReservation({userId:context.userId,reservation,error}).catch(()=>{throw denied();});
    throw error;
  }
}
