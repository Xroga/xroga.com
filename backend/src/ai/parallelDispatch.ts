import {randomUUID} from 'node:crypto';
import {getSecret} from '../config/envSecrets.js';
import {requireTenantContext,requireResourceOwner} from '../security/tenantContext.js';
import {getTenantSupabaseAdmin} from '../security/serviceRoleGuard.js';
import {EgressDenied} from '../security/egress/egressPolicy.js';
import {prepareParallelApproval,requireParallelAdmission,type ParallelAdmission} from './parallelApproval.js';
import {publicHttpsUrl} from '../security/egress/urlPolicy.js';
import {containsCredentialSecretText} from '../security/egress/dataClassification.js';
import {requireAdmittedRunAttempt} from './runStore.js';
import {requireModelProjectBinding,type TenantModelScope} from './tenantModelDispatch.js';
import {finishFailedProviderReservation,type ProviderReservation} from './providerBudget.js';
import {PostCompletionAccountingError} from './postCompletionAccounting.js';
import {WEB_PRICE_VERSION} from './webBudget.js';
import {AuthorityError} from '../security/authority/enforce.js';
import {deepseekSearchCredential,researchSearchMicroUsd,deepseekSearchBody,normaliseDeepseekSearch,DEEPSEEK_SEARCH_URL} from './researchSearchProvider.js';

type Operation='search'|'extract'|'responses';
function requireRetrievalOperation(operation: string): void {
  if (operation !== 'search' && operation !== 'extract') throw Object.assign(new Error('Generative research uses the canonical Zurelay model path.'), {code:'MODEL_DESTINATION_DENIED',status:400});
}
const denied=()=>Object.assign(new Error('Research dispatch admission is unavailable.'),{code:'PROVIDER_RESERVATION_DENIED',retryable:false});
const exact=(a:unknown,b:number)=>(typeof a==='number'||typeof a==='string'&&/^\d+$/.test(a))&&Number(a)===b&&Number.isSafeInteger(Number(a));

/** Parallel's fixed per-request charges use the existing provider reservation
 * table and RPCs. This adapter adds no ledger, entitlement or identity issuer.
 * Pricing source: https://docs.parallel.ai/getting-started/pricing, 2026-10-27.
 * Shared caller provenance and provider-internal URL fetching remain separate
 * review obligations, never certified by this low-level transport alone.
 */
export async function executeParallelRequest(input:{scope:TenantModelScope|undefined;userId:string;operation:Operation;body:Record<string,unknown>;signal?:AbortSignal;admission?:ParallelAdmission}):Promise<Response>{
  requireRetrievalOperation(input.operation);
  const context=requireTenantContext(input.scope?.context);requireResourceOwner(context,input.userId);
  const scope={...input.scope!,context},body=structuredClone(input.body),operation=input.operation,signal=input.signal;
  const attempt=scope.runAttempt?requireAdmittedRunAttempt(scope.runAttempt):undefined;
  const admission=input.admission?requireParallelAdmission(input.admission,scope,operation,body):undefined;
  // One dispatch remains bound to the platform credential present at admission.
  // Rotation or removal cannot silently substitute a different credential after
  // ownership, audit, reservation or provider-response waits.
  // Public-web search uses only the dedicated official DeepSeek Search credential. Without it, search is refused.
  const credential=operation==='extract'?'native-credential-free':deepseekSearchCredential();
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
    if(operation!=='extract'&&(!credential||deepseekSearchCredential()!==credential))throw denied();
    await admission?.check();
    signal?.throwIfAborted();
  };
  let amount:number,units=1,route:string;
  if(operation==='search'){
    if(body.mode!=='turbo'||!Array.isArray(body.search_queries)||!body.search_queries.length||body.search_queries.length>3
      ||body.search_queries.some(q=>typeof q!=='string'||q.length>500)||typeof body.objective!=='string'||body.objective.length>4000
      ||Object.keys(body).some(k=>!['mode','objective','search_queries'].includes(k)))throw denied();
    amount=researchSearchMicroUsd();route='deepseek_search';
  }else if(operation==='extract'){
    if(!Array.isArray(body.urls)||!body.urls.length||body.urls.length>4||body.urls.some(u=>typeof u!=='string')
      ||typeof body.objective!=='string'||body.objective.length>4000||Object.keys(body).some(k=>!['urls','objective'].includes(k)))throw denied();
    for(const url of body.urls as string[])publicHttpsUrl(url);
    units=body.urls.length;amount=0;route='native_public_extract';
  }else throw denied();
  await check();
  const destination=DEEPSEEK_SEARCH_URL;
  if(!admission)return Response.json(await prepareParallelApproval(scope,operation,body,signal),{status:202});
  // Known URLs are fetched only by the credential-free DNS-pinned native path.
  if(operation==='extract')throw denied();
  if(admission.maximumMicroUsd!==amount)throw denied();
  await admission.begin();
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
    const response=await fetch(destination,{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json',Authorization:`Bearer ${credential}`},
      body:JSON.stringify(deepseekSearchBody(body as {objective:string;search_queries:string[]})),signal:AbortSignal.any([AbortSignal.timeout(25000),...(signal?[signal]:[])])});
    if(response.redirected||response.status>=300&&response.status<400){await response.body?.cancel().catch(()=>undefined);throw new EgressDenied('UNSAFE_DESTINATION');}
    if(response.status===401||response.status===403){await response.body?.cancel().catch(()=>undefined);throw new AuthorityError('PARALLEL_PROVIDER_AUTHORIZATION_DENIED');}
    if(!response.ok){void response.body?.cancel().catch(()=>undefined);throw Object.assign(new Error(`Parallel provider request failed (${response.status}).`),{status:response.status});}
    completed=true;
    const reader=response.body?.getReader();let size=0;const chunks:Uint8Array[]=[];
    try{if(!reader)throw new Error('Missing provider receipt');for(;;){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>2*1024*1024)throw new Error('Provider receipt too large');chunks.push(next.value);}}
    finally{await reader?.cancel().catch(()=>undefined);reader?.releaseLock();}
    const received=Buffer.concat(chunks).toString('utf8');
    // DeepSeek results are normalised into the existing result shape; its receipt identity is the x-ds-trace-id header.
    const data=normaliseDeepseekSearch(JSON.parse(received),response.headers.get('x-ds-trace-id'));
    const text=JSON.stringify(data),requestId=data.search_id;
    if(operation==='search'&&(!Array.isArray(data.results)||data.results.some((r:unknown)=>!r||typeof r!=='object'||typeof (r as {url?:unknown}).url!=='string'
      ||(r as {title?:unknown}).title!==undefined&&typeof (r as {title?:unknown}).title!=='string'
      ||(r as {excerpts?:unknown}).excerpts!==undefined&&(!Array.isArray((r as {excerpts?:unknown}).excerpts)||((r as {excerpts:unknown[]}).excerpts).some(v=>typeof v!=='string')))))throw new Error('Malformed provider result');
    if(typeof requestId!=='string'||!requestId.trim()||requestId!==requestId.trim()||requestId.length>500
      ||/[\x00-\x20\x7f]/.test(requestId)||containsCredentialSecretText(requestId))throw new Error('Missing or unsafe provider request identity');
    // DeepSeek bills only a successful search with at least one returned result.
    // An empty response still consumes one Search dispatch and retains its trace.
    const billedMicroUsd=data.results.length ? amount : 0;
    const {data:settled,error}=await db.rpc('settle_xroga_provider_budget',{p_user_id:context.userId,p_reservation_id:reservation.id,p_actual_micro_usd:billedMicroUsd,p_provider_request_id:requestId,
      p_actual_input_tokens:0,p_cached_input_tokens:0,p_output_tokens:0,p_reasoning_tokens:0,p_tool_calls:0,p_search_calls:units});
    if(error||!settled||settled.id!==reservation.id||settled.user_id!==context.userId||settled.status!=='settled'||settled.internal_route!==internalRoute
      ||settled.price_version!==WEB_PRICE_VERSION||settled.provider_request_id!==requestId||!exact(settled.reserved_micro_usd,amount)||!exact(settled.settled_micro_usd,billedMicroUsd)
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
