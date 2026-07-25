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

const REALTIME_RE =
  /\b(news|x\.com|twitter|crypto price|live|realtime|real[- ]time|today|breaking)\b/i;

export function isBuildPrompt(prompt: string): boolean {
  return classifyTaskRequest(prompt).requiresCoding;
}

export function routePrompt(prompt: string): RouteDecision {
  const text = prompt.trim();
  const classification = classifyTaskRequest(text);
  const isCodingTask = classification.requiresCoding;

  if (!isCodingTask && classification.requiresResearch) {
    return {
      kind: 'research',
      converter: 'deepseek_v4_flash',
      builder: REALTIME_RE.test(text) ? 'grok_4_5' : 'kimi_k3',
      useResearch: true,
      reason: 'Research task: gather real sources, then synthesize',
      classification,
    };
  }

  if (!isCodingTask && FILE_RE.test(text)) {
    return {
      kind: 'file_analysis',
      converter: 'deepseek_v4_flash',
      builder: 'grok_4_3',
      useResearch: false,
      reason: 'Document or file analysis',
      classification,
    };
  }

  if (!isCodingTask) {
    return {
      kind: 'chat',
      converter: 'deepseek_v4_flash',
      builder: REALTIME_RE.test(text) ? 'grok_4_5' : 'deepseek_v4_flash',
      useResearch: classification.requiresResearch,
      reason: 'Conversation, explanation, or non-coding output',
      classification,
    };
  }

  // Coding routes are selected by operation and required capability, not a closed niche list.
  if (
    COMPLEX_RE.test(text) ||
    classification.requiredCapabilities.some((capability) =>
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
      converter: 'deepseek_v4_flash',
      builder: 'kimi_k3',
      useResearch: classification.requiresResearch,
      reason: 'Complex multi-capability engineering task',
      classification,
    };
  }

  if (LONG_HORIZON_RE.test(text)) {
    return {
      kind: 'build_long_horizon',
      converter: 'deepseek_v4_flash',
      builder: 'glm_5_2',
      useResearch: classification.requiresResearch,
      reason: 'Long-horizon repository or project-level engineering',
      classification,
    };
  }

  if (
    /\b(landing\s*page|simple\s+(web|site|app)|basic\s+(web|site|app)|static\s+site|todo\s*app)\b/i.test(
      text,
    )
  ) {
    return {
      kind: 'build_volume',
      converter: 'deepseek_v4_flash',
      builder: 'deepseek_v4_pro',
      useResearch: classification.requiresResearch,
      reason: 'Focused, lower-complexity engineering task',
      classification,
    };
  }

  return {
    kind: 'build_complex',
    converter: 'deepseek_v4_flash',
    builder: 'kimi_k3',
    useResearch: classification.requiresResearch,
    reason: 'Adaptive engineering task for an unrestricted project category',
    classification,
  };
}
