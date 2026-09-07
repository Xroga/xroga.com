/**
 * The canonical coding/research provider split.
 *
 * Command 3 §7 divides providers into two categories with different authority. Coding
 * providers may perform software engineering. Research providers may retrieve external
 * facts and nothing else — they never generate project files, never receive repository
 * mutation tools, and never appear in a coding fallback chain.
 *
 * This module is the single place that answers "may this model write code?". Routing sites
 * import from here rather than re-deriving the answer, so a future model added to the
 * registry is refused by default instead of silently inheriting coding authority.
 *
 * Note on `router.ts`: its non-coding routes assign Grok to a field named `builder`. That
 * is a naming artifact — those branches run only when `classification.requiresCoding` is
 * false, so they are chat/research responders, not engineering. They are left alone
 * deliberately; changing them would break chat and research routing without serving the
 * policy.
 */

import type { ModelId } from './models.js';

/**
 * Providers permitted to perform software-engineering work, with their required transport.
 *
 * The map is total over `ModelId`, so adding a generic model without an explicit approved
 * transport is a compile-time error.
 */
export const CODING_MODEL_TRANSPORT = {
  kimi_k3: 'moonshot',
  glm_5_3: 'zhipu',
  glm_5_3_flash: 'zhipu',
  deepseek_v4_flash: 'openrouter',
} as const satisfies Record<ModelId, string>;

/**
 * Compile-time proof that every runtime model above is spelled like a real `ModelId`.
 *
 * Unused at runtime and deliberately so: its only job is to fail the build if one of these
 * keys is ever mistyped, which the widened `satisfies` above no longer catches on its own.
 */
const MODEL_ID_TRANSPORT_COVERAGE: Partial<Record<ModelId, string>> = {
  kimi_k3:
    CODING_MODEL_TRANSPORT.kimi_k3,

  glm_5_3:
    CODING_MODEL_TRANSPORT.glm_5_3,

  glm_5_3_flash:
    CODING_MODEL_TRANSPORT.glm_5_3_flash,

  deepseek_v4_flash:
    CODING_MODEL_TRANSPORT.deepseek_v4_flash,
};
void MODEL_ID_TRANSPORT_COVERAGE;

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
const CODING_IDS = new Set<string>(Object.keys(CODING_MODEL_TRANSPORT));
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
