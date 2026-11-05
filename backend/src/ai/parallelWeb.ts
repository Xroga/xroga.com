import {randomUUID} from 'node:crypto';
import {requireTenantContext,requireResourceOwner} from '../security/tenantContext.js';
import {requireModelProjectBinding} from './tenantModelDispatch.js';
import { executeParallelRequest } from './parallelDispatch.js';
import type { TenantModelScope } from './tenantModelDispatch.js';
import { redactSecrets } from '../lib/truthfulExecution.js';
import {publicHttpsUrl} from '../security/egress/urlPolicy.js';
import { recordWebSpend } from './webBudget.js';
import {containsCredentialSecretText} from '../security/egress/dataClassification.js';
import {EgressDenied} from '../security/egress/egressPolicy.js';


export interface ParallelSource {
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string;
}

export interface ParallelResult {
  answer: string;
  sources: ParallelSource[];
  requestId?: string;
  needsConfirmation?: boolean;
  reviewUrl?: string;
}

/** Conservative, process-local, private-user cache. Never shared between tenants or users.
 * This is only an opportunistic performance optimization; it is NOT durable storage.
 * A separate consented and rights-reviewed persistent public cache is future work. */
const privateSearchCache=new Map<string,{expires:number;result:ParallelResult}>();
const CACHE_ENTRIES_MAX=256;
function searchCacheKey(input:{userId:string;dispatchScope?:TenantModelScope;resultCount?:15|30|50},objective:string,queries:string[]):string|null{
  const scope=input.dispatchScope,context=scope?.context;
  if(!context||!scope)return null;
  return JSON.stringify([context.tenantId,context.userId,input.userId,scope.projectId??null,
    scope.repository??null,input.resultCount??15,objective,queries]);
}
function cachedSearch(key:string,forceRefresh:boolean):ParallelResult|null{
  if(forceRefresh)return null;
  const entry=privateSearchCache.get(key);
  if(!entry)return null;
  if(entry.expires<=Date.now()){privateSearchCache.delete(key);return null;}
  privateSearchCache.delete(key);
  privateSearchCache.set(key,entry);
  return {answer:'',sources:entry.result.sources.map(s=>({...s})),requestId:entry.result.requestId};
}
function cacheSearch(key:string,value:ParallelResult,durationMs:number):void{
  if(!value.sources.length)return;
  privateSearchCache.delete(key);
  privateSearchCache.set(key,{expires:Date.now()+durationMs,
    result:{answer:'',sources:value.sources.map(s=>({...s})),requestId:value.requestId}});
  while(privateSearchCache.size>CACHE_ENTRIES_MAX)privateSearchCache.delete(privateSearchCache.keys().next().value!);
}

async function pendingApproval(response:Response):Promise<ParallelResult|undefined>{
  if(response.status!==202)return;
  const value=await response.json() as {needsConfirmation?:unknown;reviewUrl?:unknown};
  if(value.needsConfirmation!==true||typeof value.reviewUrl!=='string'||!/^\/dashboard\/actions\/confirm\/[a-f0-9-]{36}$/i.test(value.reviewUrl))throw new Error('Invalid research confirmation receipt');
  return{answer:'Research has not been sent. Review the exact external request.',sources:[],needsConfirmation:true,reviewUrl:value.reviewUrl};
}

function safePublicUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;

  try {
    publicHttpsUrl(value);
    return true;
  } catch {
    return false;
  }
}

function safeText(value: string, max: number): string {
  if(containsCredentialSecretText(value))throw new EgressDenied('SECRET_EGRESS_DENIED');
  return redactSecrets(value)
    .trim()
    .slice(0, max);
}

/**
 * Cheapest normal public-web operation.
 *
 * Official Parallel pricing:
 * Turbo = $0.001/request with default 10 results.
 */
export async function parallelSearch(input: {
  userId: string;
  /** Mandatory issued scope at runtime, never inferred from userId. */
  dispatchScope?: TenantModelScope;
  objective: string;
  queries: string[];
  resultCount?: 15 | 30 | 50;
  researchKind?: 'normal' | 'automatic' | 'deep';
  researchRunId?: string;
  signal?: AbortSignal;
}): Promise<ParallelResult> {
  const objective = safeText(input.objective, 4_000);

  let queries = input.queries
    .map((query) => safeText(query, 500))
    .filter(Boolean)
    .slice(0, 3);

  if (!queries.length && objective) {
    queries = [objective.slice(0, 500)];
  }

  if (!queries.length) {
    return {
      answer: '',
      sources: [],
    };
  }

  // A cached result cannot bypass the current actor/project authorization.
  // Never put private prompts, authenticated sources or cross-user data in a shared cache.
  const scope=input.dispatchScope;
  const key=searchCacheKey(input,objective,queries);
  if(key&&scope){
    requireResourceOwner(requireTenantContext(scope.context),input.userId);
    await requireModelProjectBinding(scope);
    const refresh=/\\b(refresh|check again|search again|recheck|new results)\\b/i.test(objective);
    const hit=cachedSearch(key,refresh);
    if(hit)return hit; // No new provider call, no new ledger charge.
  }

  const response = await executeParallelRequest({scope:input.dispatchScope,userId:input.userId,operation:'search',body:{mode:'turbo',objective,search_queries:queries,result_count:input.resultCount??15,research_kind:input.researchKind??'normal',research_run_id:input.researchRunId??randomUUID()},signal:input.signal});
  const pending=await pendingApproval(response);if(pending)return pending;

  if (!response.ok) {
    throw new Error(
      `Parallel Search HTTP ${response.status}`,
    );
  }

  const data = (await response.json()) as {
    search_id?: string;
    provider?: string;
    results?: Array<{
      url?: string;
      title?: string;
      publish_date?: string | null;
      excerpts?: string[];
    }>;
  };

  const sources: ParallelSource[] = (
    data.results ?? []
  )
    .filter((result) =>
      safePublicUrl(result.url),
    )
    .slice(0, input.resultCount??15)
    .map((result) => ({
      title:
        result.title?.trim() ||
        new URL(result.url!).hostname,
      url: result.url!,
      snippet: (result.excerpts ?? [])
        .join('\n')
        .slice(0, 1_200),
      publishedAt:
        result.publish_date ?? undefined,
    }));

  // Search now runs only through official DeepSeek Search, which the dispatcher already reserves and settles in the
  // canonical provider ledger. The older Parallel-only usage table cannot label it, so it is not double-recorded.
  if (data.provider !== 'deepseek') await recordWebSpend({
    userId: input.userId,
    provider: 'parallel',
    operation: 'parallel_search_turbo',
    microUsd: 1_000,
    providerRequestId: data.search_id,
  });

  const result={answer:'',sources,requestId:data.search_id};
  if(key){
    const volatile=/\\b(today|latest|breaking|live|now|current price|stock|weather|availability)\\b/i.test(objective);
    cacheSearch(key,result,volatile?60_000:10*60_000);
  }
  return result;
}

/**
 * Known URL/page/PDF retrieval.
 *
 * Official Parallel pricing:
 * $0.001 per URL.
 */
export async function parallelExtract(input: {
  userId: string;
  /** Mandatory issued scope at runtime, never inferred from userId. */
  dispatchScope?: TenantModelScope;
  urls: string[];
  objective: string;
  signal?: AbortSignal;
}): Promise<ParallelResult> {
  const urls = input.urls
    .map((url) => publicHttpsUrl(url).href)
    .slice(0, 10);

  if (!urls.length) {
    return {
      answer: '',
      sources: [],
    };
  }

  const response = await executeParallelRequest({scope:input.dispatchScope,userId:input.userId,operation:'extract',body:{urls,objective:safeText(input.objective,4_000)},signal:input.signal});
  const pending=await pendingApproval(response);if(pending)return pending;

  if (!response.ok) {
    throw new Error(
      `Parallel Extract HTTP ${response.status}`,
    );
  }

  const data = (await response.json()) as {
    extract_id?: string;
    results?: Array<{
      url?: string;
      title?: string;
      publish_date?: string | null;
      excerpts?: string[];
      full_content?: string;
    }>;
  };

  const sources: ParallelSource[] = (
    data.results ?? []
  )
    .filter((result) =>
      safePublicUrl(result.url),
    )
    .map((result) => ({
      title:
        result.title?.trim() ||
        new URL(result.url!).hostname,
      url: result.url!,
      snippet: (
        (result.excerpts ?? []).join('\n') ||
        result.full_content ||
        ''
      ).slice(0, 1_200),
      publishedAt:
        result.publish_date ?? undefined,
    }));

  await recordWebSpend({
    userId: input.userId,
    provider: 'parallel',
    operation: 'parallel_extract',
    microUsd: urls.length * 1_000,
    providerRequestId: data.extract_id,
  });

  return {
    answer: '',
    sources,
    requestId: data.extract_id,
  };
}

/**
 * Autonomous multi-source research.
 *
 * Low    = $0.01
 * Medium = $0.05
 *
 * High is intentionally not available in Xroga's normal router.
 */
export async function parallelResponses(input: {
  userId: string;
  /** Mandatory issued scope at runtime, never inferred from userId. */
  dispatchScope?: TenantModelScope;
  question: string;
  effort: 'low' | 'medium';
  signal?: AbortSignal;
}): Promise<ParallelResult> {
  const response = await executeParallelRequest({scope:input.dispatchScope,userId:input.userId,operation:'responses',body:{model:'parallel',input:safeText(input.question,10_000),reasoning:{effort:input.effort}},signal:input.signal});
  const pending=await pendingApproval(response);if(pending)return pending;

  if (!response.ok) {
    throw new Error(
      `Parallel Responses HTTP ${response.status}`,
    );
  }

  const data = (await response.json()) as {
    id?: string;
    output_text?: string;
    output?: Array<{
      content?: Array<{
        type?: string;
        text?: string;
        annotations?: Array<{
          type?: string;
          url?: string;
          title?: string;
        }>;
      }>;
    }>;
  };

  const contentItems = (
    data.output ?? []
  ).flatMap(
    (item) => item.content ?? [],
  );

  const answer = (
    data.output_text ||
    contentItems
      .filter(
        (item) =>
          item.type === 'output_text' &&
          typeof item.text === 'string',
      )
      .map((item) => item.text)
      .join('\n')
  )
    .trim()
    .slice(0, 8_000);

  const seen = new Set<string>();
  const sources: ParallelSource[] = [];

  for (const item of contentItems) {
    for (
      const annotation of
      item.annotations ?? []
    ) {
      if (
        annotation.type !== 'url_citation' ||
        !safePublicUrl(annotation.url) ||
        seen.has(annotation.url)
      ) {
        continue;
      }

      seen.add(annotation.url);

      sources.push({
        title:
          annotation.title?.trim() ||
          new URL(
            annotation.url,
          ).hostname,
        url: annotation.url,
        snippet: answer.slice(0, 1_200),
      });

      if (sources.length >= 12) break;
    }

    if (sources.length >= 12) break;
  }

  await recordWebSpend({
    userId: input.userId,
    provider: 'parallel',
    operation:
      input.effort === 'medium'
        ? 'parallel_responses_medium'
        : 'parallel_responses_low',
    microUsd:
      input.effort === 'medium'
        ? 50_000
        : 10_000,
    providerRequestId: data.id,
  });

  return {
    answer,
    sources,
    requestId: data.id,
  };
}
