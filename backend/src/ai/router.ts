import type { ModelId } from './models.js';

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
  classification: TaskClassification;
}

const COMPLEX_RE =
  /\b(crypto|exchange|staking|wallet|full[- ]?stack|compiler|chip|autonomous|from scratch|complex|enterprise|multi[- ]?tenant|android|ios|react\s*native|expo)\b/i;

const LONG_HORIZON_RE =
  /\b(refactor|codebase|repository|repo|large|suite|web\s*\+\s*mobile|mini[- ]?program|880k|long[- ]?horizon|project[- ]?level)\b/i;

const FILE_RE =
  /\b(analyze|analyse|review|document|pdf|file|upload|code review|diff)\b/i;

const SIMPLE_BUILD_RE =
  /\b(landing\s*page|simple\s+(web|site|app)|basic\s+(web|site|app)|static\s+site|todo\s*app)\b/i;

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
  const text = prompt.trim();

  const classification =
    classifyTaskRequest(text);

  const isCodingTask =
    classification.requiresCoding;

  /*
   * Current/public evidence is gathered independently by
   * runWebIntelligence().
   *
   * Grok is therefore NOT selected here for generic news,
   * realtime queries, research synthesis, or ordinary chat.
   *
   * When the evidence controller decides that X/Twitter
   * itself is required, it invokes xAI + x_search directly.
   *
   * This model route only decides who synthesizes the
   * resulting evidence.
   */
  if (
    !isCodingTask &&
    classification.requiresResearch
  ) {
    return {
      kind: 'research',

      converter:
        'deepseek_v4_flash',

      /*
       * Temporary compile-safe synthesis model.
       *
       * After GLM-5.3 Flash is registered in models.ts,
       * this becomes glm_5_3_flash.
       */
      builder:
        'deepseek_v4_flash',

      useResearch: true,

      reason:
        'External evidence is gathered by the web-intelligence layer, then synthesized by the low-cost reasoning route',

      classification,
    };
  }

  /*
   * File bytes and text extraction are handled by the
   * local Xroga file runtime.
   *
   * Until GLM-5.3 Flash is registered, existing GLM-5.2
   * handles substantial document reasoning.
   */
  if (
    !isCodingTask &&
    FILE_RE.test(text)
  ) {
    return {
      kind: 'file_analysis',

      converter:
        'deepseek_v4_flash',

      builder:
        'glm_5_2',

      useResearch: false,

      reason:
        'Local file processing followed by long-context document analysis',

      classification,
    };
  }

  /*
   * Normal conversation does not need Grok.
   *
   * runWebIntelligence() independently decides whether
   * fresh public evidence is necessary.
   */
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
        'Cost-efficient conversation and synthesis route',

      classification,
    };
  }

  /*
   * Principal-level engineering.
   *
   * Kimi remains reserved for genuinely complex,
   * multi-capability work.
   */
  if (
    COMPLEX_RE.test(text) ||
    classification.requiredCapabilities.some(
      (capability) =>
        [
          'blockchain_integration',
          'payment_integration',
          'authentication_integration',
          'database_integration',
        ].includes(capability),
    )
  ) {
    return {
      kind: 'build_complex',

      converter:
        'deepseek_v4_flash',

      builder:
        'kimi_k3',

      useResearch:
        classification.requiresResearch,

      reason:
        'Complex multi-capability engineering task',

      classification,
    };
  }

  /*
   * Large repository / long-context engineering.
   *
   * This stays GLM-5.2 until the GLM-5.3 registry
   * migration is completed.
   */
  if (LONG_HORIZON_RE.test(text)) {
    return {
      kind:
        'build_long_horizon',

      converter:
        'deepseek_v4_flash',

      builder:
        'glm_5_2',

      useResearch:
        classification.requiresResearch,

      reason:
        'Long-horizon repository or project-level engineering',

      classification,
    };
  }

  /*
   * Lower-complexity implementation.
   *
   * DeepSeek Pro remains temporarily because the current
   * model catalogue does not yet contain GLM-5.3 Flash.
   */
  if (SIMPLE_BUILD_RE.test(text)) {
    return {
      kind: 'build_volume',

      converter:
        'deepseek_v4_flash',

      builder:
        'deepseek_v4_pro',

      useResearch:
        classification.requiresResearch,

      reason:
        'Focused lower-complexity engineering task',

      classification,
    };
  }

  return {
    kind: 'build_complex',

    converter:
      'deepseek_v4_flash',

    builder:
      'kimi_k3',

    useResearch:
      classification.requiresResearch,

    reason:
      'Adaptive engineering task for an unrestricted project category',

    classification,
  };
}
