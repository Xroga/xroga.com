/**
 * The canonical Black Hole ∞ model registry.
 *
 * One public identity — Black Hole ∞ — over several real providers. This file is the single
 * place that answers, for any internal model: which provider carries it, what it can do, and
 * what it is *allowed* to do. Those last two are deliberately different questions.
 *
 * ## Why this exists beside the current registries rather than replacing them
 *
 * Model truth is currently spread across four files that each own a slice: `models.ts` holds
 * transport and pricing, `providerPolicy.ts` holds the coding/research split,
 * `providerCostTiers.ts` holds tiering and configuration gating, and
 * `modelCapabilityRegistry.ts` holds runtime capability. They do not currently disagree, but
 * nothing makes agreement structural — the same class of latent defect as a transport binding
 * with no enforcement.
 *
 * This registry unifies *capability and authority*, and deliberately does **not** restate
 * transport or availability. It derives those from the existing owners:
 *
 *   - transport   → `providerPolicy` (`CODING_MODEL_TRANSPORT` / `RESEARCH_MODEL_TRANSPORT`)
 *   - availability→ `providerCostTiers.modelAvailability`
 *
 * Restating them here would create a second truth to drift against, which is the problem this
 * file exists to end rather than to double.
 *
 * ## Capability is not authority
 *
 * Grok can emit text containing code. That is a *capability*. Whether Xroga permits it to
 * write project files is an *authority*, and the answer is no. Conflating the two is how a
 * research provider ends up holding a repository token, so they are separate fields and the
 * routing question is always about authority.
 *
 * ## Nothing here invents a provider slug
 *
 * Where a model's exact provider identifier has not been verified against the live account,
 * the entry is configuration-gated and reports `not_configured` until an operator supplies
 * it. A guessed slug that looks production-ready is worse than an absent one.
 */

import {
  CODING_MODEL_TRANSPORT,
  RESEARCH_MODEL_TRANSPORT,
  isCodingModel,
  isResearchModel,
} from '../providerPolicy.js';
import { codingTierFor, modelAvailability, type ModelAvailability } from '../providerCostTiers.js';

/** The real transports Black Hole ∞ speaks. Named per provider, never per model family. */
export type BlackHoleProvider = 'moonshot' | 'glm_official' | 'openrouter' | 'xai';

/**
 * What a model is technically able to do.
 *
 * Claims here must be true of the provider's actual contract. An aspirational `vision: true`
 * is worse than `false`, because routing will believe it and send an image to a model that
 * cannot read one.
 */
export interface BlackHoleCapabilities {
  readonly text: boolean;
  readonly reasoning: boolean;
  readonly deepReasoning: boolean;
  readonly coding: boolean;
  readonly repositoryCoding: boolean;
  readonly longContext: boolean;
  readonly vision: boolean;
  readonly tools: boolean;
  readonly structuredOutput: boolean;
  readonly streaming: boolean;
  readonly research: boolean;
  readonly xSearch: boolean;
  readonly webSearch: boolean;
}

/**
 * What a model is permitted to do, regardless of what it can do.
 *
 * `writeProjectFiles` and `mutateRepository` are the two that matter most: they are the
 * difference between a model that drafts text and a model that changes a customer's
 * repository.
 */
export interface BlackHoleAuthority {
  readonly research: boolean;
  readonly inspectMedia: boolean;
  readonly writeProjectFiles: boolean;
  readonly mutateRepository: boolean;
  readonly deploy: boolean;
}

export type BlackHoleCostClass = 'ultra_low' | 'low' | 'medium' | 'high' | 'premium';

export interface BlackHoleModelDefinition {
  readonly id: string;
  readonly provider: BlackHoleProvider;
  /**
   * The provider's own identifier, or `null` when it must be configured first.
   *
   * Null is meaningful: it marks a model that is registered and represented but not callable
   * until an operator supplies the verified slug through its `providerModelEnv`.
   */
  readonly providerModel: string | null;
  /** Environment variable carrying the provider identifier, when overridable or required. */
  readonly providerModelEnv: string | null;
  readonly credentialEnv: string;
  readonly capabilities: BlackHoleCapabilities;
  readonly authority: BlackHoleAuthority;
  readonly contextWindow: number;
  readonly costClass: BlackHoleCostClass;
  readonly preferredRoles: readonly string[];
  readonly prohibitedRoles: readonly string[];
}

/** Full engineering authority: may write files, change repositories and deploy. */
const ENGINEERING_AUTHORITY: BlackHoleAuthority = {
  research: true,
  inspectMedia: true,
  writeProjectFiles: true,
  mutateRepository: true,
  deploy: true,
};

/**
 * Research-only authority.
 *
 * Everything a research model returns is untrusted external data. It may inform a decision;
 * it may never make one that writes.
 */
const RESEARCH_ONLY_AUTHORITY: BlackHoleAuthority = {
  research: true,
  inspectMedia: true,
  writeProjectFiles: false,
  mutateRepository: false,
  deploy: false,
};

const NO_CAPABILITY: BlackHoleCapabilities = {
  text: false,
  reasoning: false,
  deepReasoning: false,
  coding: false,
  repositoryCoding: false,
  longContext: false,
  vision: false,
  tools: false,
  structuredOutput: false,
  streaming: false,
  research: false,
  xSearch: false,
  webSearch: false,
};

const codingCapabilities = (
  overrides: Partial<BlackHoleCapabilities> = {},
): BlackHoleCapabilities => ({
  ...NO_CAPABILITY,
  text: true,
  reasoning: true,
  coding: true,
  repositoryCoding: true,
  tools: true,
  structuredOutput: true,
  streaming: true,
  ...overrides,
});

/**
 * The canonical pool.
 *
 * Ids match the identifiers already used by `providerCostTiers` and the measured-evidence
 * ledger. Introducing a second id for a model that already has one — `kimi_k2_7_code`
 * alongside `kimi_k2_7` — would split its benchmark history in two and defeat the purpose of
 * a canonical registry.
 */
export const BLACK_HOLE_MODELS: readonly BlackHoleModelDefinition[] = [
  {
    id: 'kimi_k3',
    provider: 'moonshot',
    providerModel: 'kimi-k3',
    providerModelEnv: 'KIMI_MODEL_ID',
    credentialEnv: 'KIMI_API_KEY',
    capabilities: codingCapabilities({ deepReasoning: true, longContext: true, vision: true }),
    authority: ENGINEERING_AUTHORITY,
    contextWindow: 1_000_000,
    costClass: 'premium',
    preferredRoles: ['flagship_reasoning', 'architecture', 'vision', 'long_context', 'escalation'],
    prohibitedRoles: [],
  },
  {
    // Registered and represented, not callable until the verified slug is configured.
    // `providerCostTiers` already gates this model on KIMI_COST_EFFICIENT_MODEL_ID; the same
    // variable is used here rather than a second one, so one operator action enables both.
    id: 'kimi_k2_7',
    provider: 'moonshot',
    providerModel: null,
    providerModelEnv: 'KIMI_COST_EFFICIENT_MODEL_ID',
    credentialEnv: 'KIMI_API_KEY',
    capabilities: codingCapabilities({ longContext: true }),
    authority: ENGINEERING_AUTHORITY,
    contextWindow: 256_000,
    costClass: 'low',
    preferredRoles: ['coding', 'repository_implementation', 'refactor', 'debugging'],
    prohibitedRoles: [],
  },
  {
    id: 'glm_5_2',
    provider: 'glm_official',
    providerModel: 'glm-5.2',
    providerModelEnv: 'GLM_MODEL_ID',
    credentialEnv: 'GLM_API_KEY',
    capabilities: codingCapabilities({ deepReasoning: true, longContext: true }),
    authority: ENGINEERING_AUTHORITY,
    contextWindow: 200_000,
    costClass: 'high',
    preferredRoles: ['long_horizon_engineering', 'repository_understanding', 'migration'],
    prohibitedRoles: [],
  },
  {
    id: 'deepseek_v4_flash',
    provider: 'openrouter',
    providerModel: 'deepseek/deepseek-v4-flash',
    providerModelEnv: 'DEEPSEEK_FLASH_MODEL_ID',
    credentialEnv: 'OPENROUTER_API_KEY',
    capabilities: codingCapabilities(),
    authority: ENGINEERING_AUTHORITY,
    contextWindow: 128_000,
    costClass: 'ultra_low',
    preferredRoles: ['chat', 'summarisation', 'extraction', 'classification', 'light_reasoning'],
    prohibitedRoles: [],
  },
  {
    id: 'deepseek_v4_pro',
    provider: 'openrouter',
    providerModel: 'deepseek/deepseek-v4-pro',
    providerModelEnv: 'DEEPSEEK_PRO_MODEL_ID',
    credentialEnv: 'OPENROUTER_API_KEY',
    capabilities: codingCapabilities({ deepReasoning: true }),
    authority: ENGINEERING_AUTHORITY,
    contextWindow: 128_000,
    costClass: 'medium',
    preferredRoles: ['deep_reasoning', 'debugging', 'planning', 'coding_fallback'],
    prohibitedRoles: [],
  },
  {
    // Capable of producing code; not authorised to write any. The prohibited roles are stated
    // rather than implied so a router asking "may this model implement?" gets a direct answer.
    id: 'grok_4_5',
    provider: 'xai',
    providerModel: 'grok-4.5',
    providerModelEnv: 'GROK_MODEL_ID',
    credentialEnv: 'GROK_API_KEY',
    capabilities: {
      ...NO_CAPABILITY,
      text: true,
      reasoning: true,
      vision: true,
      tools: true,
      streaming: true,
      research: true,
      xSearch: true,
      webSearch: true,
    },
    authority: RESEARCH_ONLY_AUTHORITY,
    contextWindow: 256_000,
    costClass: 'medium',
    preferredRoles: ['x_search', 'realtime_research', 'crypto_research', 'media_inspection'],
    prohibitedRoles: ['implementation', 'repository_mutation', 'review', 'deployment'],
  },
  {
    id: 'grok_4_3',
    provider: 'xai',
    providerModel: 'grok-4.3',
    providerModelEnv: 'GROK_FAST_MODEL_ID',
    credentialEnv: 'GROK_API_KEY',
    capabilities: {
      ...NO_CAPABILITY,
      text: true,
      reasoning: true,
      vision: true,
      tools: true,
      streaming: true,
      research: true,
      xSearch: true,
      webSearch: true,
    },
    authority: RESEARCH_ONLY_AUTHORITY,
    contextWindow: 128_000,
    costClass: 'low',
    preferredRoles: ['file_analysis', 'realtime_research', 'media_inspection'],
    prohibitedRoles: ['implementation', 'repository_mutation', 'review', 'deployment'],
  },
];

const BY_ID = new Map(BLACK_HOLE_MODELS.map((model) => [model.id, model]));

export function blackHoleModel(id: string): BlackHoleModelDefinition | null {
  return BY_ID.get(id) ?? null;
}

/**
 * The provider identifier to send, or `null` when the model is not configured.
 *
 * An environment override always wins, because a provider renaming a model must not require a
 * code change. A gated model with no override stays `null` rather than falling back to a
 * plausible-looking guess.
 */
export function providerModelIdentifier(
  id: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const model = BY_ID.get(id);
  if (!model) return null;
  const override = model.providerModelEnv ? env[model.providerModelEnv]?.trim() : '';
  return override || model.providerModel;
}

/**
 * Whether a model can actually be called right now.
 *
 * Delegates to `providerCostTiers` for models it governs so the two cannot disagree, and
 * falls back to "configured if it has an identifier" for the research models, which that
 * module does not cover.
 */
export function blackHoleAvailability(
  id: string,
  env: NodeJS.ProcessEnv = process.env,
): ModelAvailability {
  const model = BY_ID.get(id);
  if (!model) return 'unknown_model';
  if (codingTierFor(id)) return modelAvailability(id, env);
  return providerModelIdentifier(id, env) ? 'available' : 'not_configured';
}

/**
 * Whether a model may perform an authority-bearing operation.
 *
 * The one function routing should ask before handing work to a model. It reads authority,
 * never capability, so a model that *could* write code but must not is refused here.
 */
export function mayPerform(
  id: string,
  operation: keyof BlackHoleAuthority,
): boolean {
  return BY_ID.get(id)?.authority[operation] === true;
}

/**
 * The transport this model must use, taken from the security policy rather than restated.
 *
 * Returning the policy's answer keeps a registry edit from silently changing where customer
 * prompts are sent — the registry describes the model, the policy decides the destination.
 */
export function requiredTransport(id: string): string | null {
  if (isCodingModel(id)) return CODING_MODEL_TRANSPORT[id];
  if (id in RESEARCH_MODEL_TRANSPORT) {
    return RESEARCH_MODEL_TRANSPORT[id as keyof typeof RESEARCH_MODEL_TRANSPORT];
  }
  return isResearchModel(id) ? 'research_only' : null;
}
