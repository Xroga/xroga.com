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

  const response = await executeParallelRequest({scope:input.dispatchScope,userId:input.userId,operation:'search',body:{mode:'turbo',objective,search_queries:queries},signal:input.signal});
  const pending=await pendingApproval(response);if(pending)return pending;

  if (!response.ok) {
    throw new Error(
      `Parallel Search HTTP ${response.status}`,
    );
  }

  const data = (await response.json()) as {
    search_id?: string;
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
    .slice(0, 10)
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

  // Successful Turbo request = $0.001.
  await recordWebSpend({
    userId: input.userId,
    provider: 'parallel',
    operation: 'parallel_search_turbo',
    microUsd: 1_000,
    providerRequestId: data.search_id,
  });

  return {
    answer: '',
    sources,
    requestId: data.search_id,
  };
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
    .slice(0, 4);

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
