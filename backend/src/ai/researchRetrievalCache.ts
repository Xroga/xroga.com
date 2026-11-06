import {createHash} from 'node:crypto';
import {requireTenantContext,requireResourceOwner} from '../security/tenantContext.js';
import {getTenantSupabaseAdmin} from '../security/serviceRoleGuard.js';
import {requireModelProjectBinding,type TenantModelScope} from './tenantModelDispatch.js';
import {publicHttpsUrl} from '../security/egress/urlPolicy.js';
import {containsCredentialSecretText} from '../security/egress/dataClassification.js';
import type {RetrievalOperation,RetrievalReceipt} from './researchRetrievalPlan.js';
import {requireAdmittedRunAttempt} from './runStore.js';

async function activeScope(scope: TenantModelScope) {
  const context=requireTenantContext(scope.context);requireResourceOwner(context,scope.userId);
  await requireModelProjectBinding(scope);
  if(!scope.runAttempt)return;
  const attempt=requireAdmittedRunAttempt(scope.runAttempt);requireResourceOwner(context,attempt.userId);
  const {data,error}=await getTenantSupabaseAdmin(context).from('swarm_runs')
    .select('id,user_id,project_id,status,worker_id,lease_generation').eq('id',attempt.runId).eq('user_id',context.userId).maybeSingle();
  if(error||!data||data.id!==attempt.runId||data.user_id!==context.userId||data.project_id!==(scope.projectId??null)
    ||data.status!=='running'||data.worker_id!==attempt.workerId||data.lease_generation!==attempt.generation)
    throw Object.assign(new Error('Research run is no longer active'),{code:'RUN_STATE_CONFLICT'});
}

export function retrievalCacheKey(scope: TenantModelScope, operation: RetrievalOperation, body: Record<string, unknown>) {
  const context = requireTenantContext(scope.context);
  requireResourceOwner(context, scope.userId);
  return createHash('sha256').update(JSON.stringify(['deepseek-retrieval-v1',context.tenantId,context.userId,
    scope.projectId??null,scope.repository??null,operation,body.objective,body.search_queries??null,
    body.urls??null,body.result_count??null,body.research_kind??'normal'])).digest('hex');
}
export const retrievalTtlSeconds = (objective: string) => /\b(today|latest|breaking|live|now|current|price|weather|availability)\b/i.test(objective) ? 60 : 600;
export const retrievalRefreshRequested = (objective: string) => /\b(refresh|check again|search again|recheck|new results)\b/i.test(objective);
export function validCachedRetrieval(value: unknown): value is RetrievalReceipt {
  if (!value || typeof value !== 'object') return false;
  const result=value as RetrievalReceipt;
  return result.provider==='deepseek' && typeof result.search_id==='string' && /^[A-Za-z0-9-]{8,200}$/.test(result.search_id)
    && Array.isArray(result.results) && result.results.length>0 && result.results.length<=50
    && result.results.every(page=>{
      try {publicHttpsUrl(page.url);return !containsCredentialSecretText(page.url)
        && (page.title===undefined||typeof page.title==='string') && Array.isArray(page.excerpts)
        && page.excerpts.some(x=>typeof x==='string'&&x.trim().length>0)
        && page.excerpts.every(x=>typeof x==='string'&&x.length<=12_000&&!containsCredentialSecretText(x));}catch{return false;}
    });
}
export async function readRetrievalCache(scope: TenantModelScope, operation: RetrievalOperation, body: Record<string, unknown>) {
  const context=requireTenantContext(scope.context);
  requireResourceOwner(context,scope.userId);
  await activeScope(scope);
  if(retrievalRefreshRequested(String(body.objective)))return null;
  const {data,error}=await getTenantSupabaseAdmin(context).from('xroga_private_retrieval_cache')
    .select('result,expires_at').eq('user_id',context.userId).eq('cache_key',retrievalCacheKey(scope,operation,body))
    .gt('expires_at',new Date().toISOString()).maybeSingle();
  await activeScope(scope);
  if(error||!data||Date.parse(data.expires_at)<=Date.now()||!validCachedRetrieval(data.result))return null;
  return structuredClone(data.result) as RetrievalReceipt;
}
export async function writeRetrievalCache(scope: TenantModelScope,operation: RetrievalOperation,body: Record<string, unknown>,result: RetrievalReceipt) {
  if(!validCachedRetrieval(result))return;
  const context=requireTenantContext(scope.context);requireResourceOwner(context,scope.userId);
  await activeScope(scope);
  const {error}=await getTenantSupabaseAdmin(context).rpc('put_xroga_private_retrieval_cache',{
    p_user_id:context.userId,p_cache_key:retrievalCacheKey(scope,operation,body),p_result:result,
    p_ttl_seconds:retrievalTtlSeconds(String(body.objective)),
  });
  // A cache failure cannot repeat, erase or reclassify a settled provider call.
  if(error)console.warn('[research] Private cache persistence unavailable');
}
