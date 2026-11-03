/** Canonical two-model generation policy. Retrieval retains its own authority
 * and accounting boundary. Historical model records never grant execution. */

import { assertActiveModelId, ZURELAY_BASE_URL, type ModelId } from './models.js';
import { getRouterAdminConfig } from './routerConfig.js';
import { authorityModelSpendLimit } from '../security/authority/enforce.js';
import type { AuthorityPermit, AuthorityDispatchBinding } from '../security/authority/types.js';

export interface ModelEscalation {
  reason: 'complex_multifile_debug' | 'prior_verified_failure' | 'deep_security_review' | 'user_requested_complex_work';
  taskId: string;
  permit: AuthorityPermit;
  binding: AuthorityDispatchBinding;
}
export function assertModelSelection(modelId: ModelId, maximumCostMicroUsd: number, escalation?: ModelEscalation): void {
  assertModelEnabled(modelId);
  if (modelId !== 'claude_sonnet_5_5') return;
  if (!escalation || !['complex_multifile_debug','prior_verified_failure','deep_security_review','user_requested_complex_work'].includes(escalation.reason)
    || !escalation.taskId || !Number.isSafeInteger(maximumCostMicroUsd) || maximumCostMicroUsd <= 0
    || maximumCostMicroUsd > authorityModelSpendLimit(escalation.permit, escalation.binding, escalation.taskId)) {
    throw Object.assign(new Error('Complex engineering requires a current task-bound Sonnet spending grant.'), { code:'MODEL_DISPATCH_BINDING_DENIED', status:403 });
  }
}
export function assertModelEnabled(modelId: ModelId): void {
  assertActiveModelId(modelId);
  const policy = getRouterAdminConfig();
  if (!policy.allowedModels.includes(modelId) || !policy.enabledProviders.includes('zurelay')) {
    throw Object.assign(new Error('This model is disabled by execution policy.'), { code:'MODEL_DESTINATION_DENIED', status:400 });
  }
}

/**
 * Providers permitted to perform software-engineering work, with their required transport.
 *
 * Historical ModelId members intentionally have no executable transport.
 */
export const CODING_MODEL_TRANSPORT = {
  deepseek_v4_1_flash_1017: 'zurelay',
  claude_sonnet_5_5: 'zurelay',
} as const satisfies Partial<Record<ModelId, string>>;

export type CodingModelId = keyof typeof CODING_MODEL_TRANSPORT;

/** Providers restricted to retrieval. Research output is untrusted external evidence. */
export const RESEARCH_MODEL_TRANSPORT = {} as const;

export type ResearchModelId = keyof typeof RESEARCH_MODEL_TRANSPORT;

/**
 * Tavily is a search and retrieval service, not a chat model.
 *
 * It has no entry in `MODELS` and cannot be selected by any router. Named here so the
 * policy tests can assert it explicitly rather than passing because the identifier does
 * not happen to exist — an absence that a future integration could quietly end.
 */
const CODING_IDS = new Set<string>(['deepseek_v4_1_flash_1017', 'claude_sonnet_5_5']);
const RESEARCH_IDS = new Set<string>(Object.keys(RESEARCH_MODEL_TRANSPORT));

/**
 * Whether a model may perform coding work.
 *
 * Allowlist rather than denylist: an unrecognised identifier is not a coding model. A model
 * added to the registry without being added here is refused, which is the correct direction
 * for a policy whose failure mode is a research provider writing code.
 */
export function isCodingModel(modelId: string | null | undefined): modelId is CodingModelId {
  return typeof modelId === 'string' && CODING_IDS.has(modelId);
}

export function isResearchModel(modelId: string | null | undefined): boolean {
  return typeof modelId === 'string' && RESEARCH_IDS.has(modelId);
}

/** The transport a coding model must use. Null when the model may not code at all. */
export function requiredCodingTransport(modelId: string): string | null {
  return isCodingModel(modelId) ? CODING_MODEL_TRANSPORT[modelId] : null;
}

/** Disabled providers must be denied even when a legacy caller bypasses ranking.
 * Keep historical model IDs and accounting intact. This grants no routing fallback. */
export function assertProviderEnabled(provider: string): void {
  if (provider !== 'zurelay' || !getRouterAdminConfig().enabledProviders.some(enabled => enabled === provider)) {
    throw Object.assign(new Error('This model provider is disabled by execution policy.'),
      { code: 'MODEL_DESTINATION_DENIED', status: 400 });
  }
}

/** Provider identity binds both its credential namespace and exact API base.
 * This is separate from model-id configuration and cannot be supplied by a prompt. */
export function assertModelProviderDestination(provider: string, baseUrl: string, secretName?: string): void {
  assertProviderEnabled(provider);
  const allowed:Record<string,{url:string;secret:string}>={
    zurelay:{url:ZURELAY_BASE_URL,secret:'ZURELAY_API_KEY'},
  };
  const expected=allowed[provider];
  if(!expected||baseUrl!==expected.url||(secretName!==undefined&&secretName!==expected.secret)){
    throw Object.assign(new Error('Model provider destination or credential namespace is not approved.'),{code:'MODEL_DESTINATION_DENIED',status:400});
  }
}

export class ProviderPolicyError extends Error {
  readonly code = 'PROVIDER_POLICY_VIOLATION' as const;
  constructor(message: string) {
    super(message);
    this.name = 'ProviderPolicyError';
  }
}

/**
 * Refuses a non-coding model at the point of use.
 *
 * Throwing beats filtering here. A silently dropped research model looks identical to a
 * correctly empty candidate list, and the run would continue with one fewer option and no
 * record of why — exactly the class of invisible routing decision Command 3 §8 exists to
 * remove.
 */
export function assertCodingModel(modelId: string, context: string): asserts modelId is CodingModelId {
  if (!isCodingModel(modelId)) {
    throw new ProviderPolicyError(
      `${context}: "${modelId}" is not a coding provider. Only ` +
        `${Object.keys(CODING_MODEL_TRANSPORT).join(', ')} may perform engineering work; ` +
        'research providers retrieve external evidence and never generate or modify code.',
    );
  }
}

/** Drops any non-coding model from a candidate or fallback list. */
export function codingModelsOnly<T extends { modelId: string }>(candidates: readonly T[]): T[] {
  return candidates.filter((candidate) => isCodingModel(candidate.modelId));
}
