/**
 * The canonical coding/research provider split.
 *
 * Command 3 §7 divides providers into two categories with different authority. Coding
 * providers may perform software engineering. Research providers may retrieve external
 * facts and nothing else — they never generate project files, never receive repository
 * mutation tools, and never appear in a coding fallback chain.
 *
 * That policy was documented and not enforced. Three things were true at `59cdcf6`:
 *
 *   - `STRENGTHS` gave `grok_4_5` and `grok_4_3` a `coding` score of 7, and
 *     `capabilityCandidates()` builds a routing profile from every entry in the runtime
 *     registry. A `routeByCapability({ capability: 'coding' })` call could therefore rank
 *     and select Grok to implement a user's project.
 *   - `FALLBACKS` listed `grok_4_3` as a fallback for `kimi_k3`, `glm_5_2` and
 *     `deepseek_v4_flash` — the three coding models. Since #478 made the universal
 *     implement step actually walk its fallback chain, that was no longer theoretical:
 *     two coding-provider failures would have handed implementation to a research model.
 *   - Grok's declared role string in `models.ts` still advertised "coding agents".
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
 * Keyed by logical model id rather than by `ModelId`, because a coding model can be known to
 * policy before it is callable. `kimi_k2_7` is exactly that case: `providerCostTiers` gates it
 * on a verified provider identifier that has not been supplied, so it has no `MODELS` entry
 * and no verified pricing, and inventing either would be worse than leaving it absent.
 *
 * It still belongs here. Policy decides *where a model's traffic may go*, and that question
 * has an answer — Moonshot — long before the model can be called. Omitting it would leave the
 * one coding model most likely to be enabled next as the only one with no transport binding,
 * which is precisely the unenforced-binding shape this module exists to prevent.
 *
 * `MODEL_ID_TRANSPORT_COVERAGE` below keeps the compile-time typo protection that the previous
 * `satisfies Partial<Record<ModelId, string>>` provided for every entry that *is* a `ModelId`.
 */
export const CODING_MODEL_TRANSPORT = {
  kimi_k3: 'moonshot',
  glm_5_2: 'zhipu',
  deepseek_v4_pro: 'openrouter',
  deepseek_v4_flash: 'openrouter',
  kimi_k2_7: 'moonshot',
} as const satisfies Record<string, string>;

/**
 * Compile-time proof that every runtime model above is spelled like a real `ModelId`.
 *
 * Unused at runtime and deliberately so: its only job is to fail the build if one of these
 * keys is ever mistyped, which the widened `satisfies` above no longer catches on its own.
 */
const MODEL_ID_TRANSPORT_COVERAGE: Partial<Record<ModelId, string>> = {
  kimi_k3: CODING_MODEL_TRANSPORT.kimi_k3,
  glm_5_2: CODING_MODEL_TRANSPORT.glm_5_2,
  deepseek_v4_pro: CODING_MODEL_TRANSPORT.deepseek_v4_pro,
  deepseek_v4_flash: CODING_MODEL_TRANSPORT.deepseek_v4_flash,
};
void MODEL_ID_TRANSPORT_COVERAGE;

export type CodingModelId = keyof typeof CODING_MODEL_TRANSPORT;

/** Providers restricted to retrieval. Research output is untrusted external evidence. */
export const RESEARCH_MODEL_TRANSPORT = {
  grok_4_5: 'xai',
  grok_4_3: 'xai',
} as const satisfies Partial<Record<ModelId, string>>;

export type ResearchModelId = keyof typeof RESEARCH_MODEL_TRANSPORT;

/**
 * Tavily is a search and retrieval service, not a chat model.
 *
 * It has no entry in `MODELS` and cannot be selected by any router. Named here so the
 * policy tests can assert it explicitly rather than passing because the identifier does
 * not happen to exist — an absence that a future integration could quietly end.
 */
export const TAVILY_PROVIDER_ID = 'tavily' as const;

const CODING_IDS = new Set<string>(Object.keys(CODING_MODEL_TRANSPORT));
const RESEARCH_IDS = new Set<string>([...Object.keys(RESEARCH_MODEL_TRANSPORT), TAVILY_PROVIDER_ID]);

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
