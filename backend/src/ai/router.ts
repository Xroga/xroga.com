import type {
  ModelId,
} from './models.js';

import {
  classifyTaskRequest,
  type TaskClassification,
} from '../lib/taskClassifier.js';

export type TaskKind =
  | 'chat'
  | 'convert'
  | 'build_complex'
  | 'build_long_horizon'
  | 'build_volume'
  | 'research'
  | 'file_analysis'
  | 'realtime';

export interface RouteDecision {
  kind: TaskKind;

  converter: ModelId;

  builder: ModelId;

  useResearch: boolean;

  reason: string;

  classification:
    TaskClassification;
}

/**
 * Kimi is deliberately narrow.
 *
 * Ordinary "complex app" work should not automatically
 * consume principal-level reasoning.
 */
const PRINCIPAL_RE =
  /\b(kernel|compiler|operating system|database engine|consensus protocol|cryptographic protocol|formal verification|new programming language|novel distributed system)\b/i;

const SERIOUS_RE =
  /\b(crypto|exchange|staking|wallet|full[- ]?stack|enterprise|multi[- ]?tenant|android|ios|react\s*native|expo|architecture|security|payments?|oauth|authentication|migration)\b/i;

const LONG_HORIZON_RE =
  /\b(refactor|codebase|repository|repo|large|suite|web\s*\+\s*mobile|long[- ]?horizon|project[- ]?level|entire codebase|whole repository)\b/i;

const FILE_RE =
  /\b(analyze|analyse|review|document|pdf|file|upload|attachment|code review|diff)\b/i;

const SIMPLE_BUILD_RE =
  /\b(landing\s*page|simple\s+(web|site|app)|basic\s+(web|site|app)|static\s+site|todo\s*app)\b/i;

const SERIOUS_CAPABILITIES =
  new Set([
    'blockchain_integration',
    'payment_integration',
    'authentication_integration',
    'database_integration',
    'security_review',
    'deployment',
  ]);

export function isBuildPrompt(
  prompt: string,
): boolean {
  return classifyTaskRequest(
    prompt,
  ).requiresCoding;
}

export function routePrompt(
  prompt: string,
): RouteDecision {
  const text =
    prompt.trim();

  const classification =
    classifyTaskRequest(
      text,
    );

  const isCodingTask =
    classification.requiresCoding;

  /**
   * Retrieval is handled independently:
   *
   * general public web -> Parallel
   * X-native retrieval -> xAI x_search
   *
   * This route chooses only the final synthesis model.
   */
  if (
    !isCodingTask &&
    classification.requiresResearch
  ) {
    return {
      kind:
        'research',

      converter:
        'deepseek_v4_flash',

      builder:
        'glm_5_3_flash',

      useResearch:
        true,

      reason:
        'External evidence is retrieved separately and synthesized by the efficient GLM route',

      classification,
    };
  }

  /**
   * File bytes are parsed locally first.
   *
   * attachments.ts may escalate a large document to GLM-5.3.
   */
  if (
    !isCodingTask &&
    FILE_RE.test(text)
  ) {
    return {
      kind:
        'file_analysis',

      converter:
        'deepseek_v4_flash',

      builder:
        'glm_5_3_flash',

      useResearch:
        false,

      reason:
        'Local file processing followed by GLM document analysis',

      classification,
    };
  }

  if (!isCodingTask) {
    return {
      kind: 'chat',

      converter:
        'deepseek_v4_flash',

      builder:
        'deepseek_v4_flash',

      useResearch:
        classification.requiresResearch,

      reason:
        'Low-cost conversation and utility route',

      classification,
    };
  }

  /**
   * Rare principal-expert escalation.
   */
  if (
    PRINCIPAL_RE.test(
      text,
    )
  ) {
    return {
      kind:
        'build_complex',

      converter:
        'deepseek_v4_flash',

      builder:
        'kimi_k3',

      useResearch:
        classification.requiresResearch,

      reason:
        'Principal-level systems engineering task',

      classification,
    };
  }

  /**
   * Long-horizon repository engineering.
   */
  if (
    LONG_HORIZON_RE.test(
      text,
    )
  ) {
    return {
      kind:
        'build_long_horizon',

      converter:
        'deepseek_v4_flash',

      builder:
        'glm_5_3',

      useResearch:
        classification.requiresResearch,

      reason:
        'Long-horizon repository engineering requires the senior GLM route',

      classification,
    };
  }

  const seriousCapability =
    classification.requiredCapabilities.some(
      (capability) =>
        SERIOUS_CAPABILITIES.has(
          capability,
        ),
    );

  /**
   * Serious development stays with GLM-5.3.
   */
  if (
    SERIOUS_RE.test(text) ||
    seriousCapability
  ) {
    return {
      kind:
        'build_complex',

      converter:
        'deepseek_v4_flash',

      builder:
        'glm_5_3',

      useResearch:
        classification.requiresResearch,

      reason:
        'Serious multi-capability engineering task',

      classification,
    };
  }

  /**
   * Ordinary implementation should be the high-volume
   * GLM-5.3-Flash path.
   */
  if (
    SIMPLE_BUILD_RE.test(
      text,
    )
  ) {
    return {
      kind:
        'build_volume',

      converter:
        'deepseek_v4_flash',

      builder:
        'glm_5_3_flash',

      useResearch:
        classification.requiresResearch,

      reason:
        'Focused high-volume implementation task',

      classification,
    };
  }

  return {
    kind:
      'build_volume',

    converter:
      'deepseek_v4_flash',

    builder:
      'glm_5_3_flash',

    useResearch:
      classification.requiresResearch,

    reason:
      'Normal software implementation route',

    classification,
  };
}
