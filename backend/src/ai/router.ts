import type { ModelId } from './models.js';

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
}

const BUILD_RE =
  /\b(build|create|make|generate|scaffold|develop|spin\s*up|code|app|website|landing|page|dashboard|saas|chatbot|bot|game|crypto|swap|defi|platform|product|android|ios|mobile|expo)\b/i;

const COMPLEX_RE =
  /\b(crypto|exchange|staking|wallet|full[- ]?stack|compiler|chip|autonomous|from scratch|complex|enterprise|multi[- ]?tenant|android|ios|react\s*native|expo)\b/i;

const LONG_HORIZON_RE =
  /\b(refactor|codebase|repository|repo|large|suite|web\s*\+\s*mobile|mini[- ]?program|880k|long[- ]?horizon|project[- ]?level)\b/i;

const RESEARCH_RE =
  /\b(research|latest|news|trends?|market|report|compare|sources?|citations?|web search|current)\b/i;

const FILE_RE =
  /\b(analyze|analyse|review|document|pdf|file|upload|code review|diff)\b/i;

const REALTIME_RE =
  /\b(news|x\.com|twitter|crypto price|live|realtime|real[- ]time|today|breaking)\b/i;

export function isBuildPrompt(prompt: string): boolean {
  return BUILD_RE.test(prompt);
}

export function routePrompt(prompt: string): RouteDecision {
  const t = prompt.trim();

  if (!isBuildPrompt(t) && RESEARCH_RE.test(t)) {
    return {
      kind: 'research',
      converter: 'deepseek_v4_flash',
      builder: REALTIME_RE.test(t) ? 'grok_4_5' : 'kimi_k3',
      useResearch: true,
      reason: 'Deep research — gather sources then synthesize',
    };
  }

  if (!isBuildPrompt(t) && FILE_RE.test(t)) {
    return {
      kind: 'file_analysis',
      converter: 'deepseek_v4_flash',
      builder: 'grok_4_3',
      useResearch: false,
      reason: 'Document / file analysis → Grok 4.3',
    };
  }

  if (!isBuildPrompt(t)) {
    return {
      kind: 'chat',
      converter: 'deepseek_v4_flash',
      builder: REALTIME_RE.test(t) ? 'grok_4_5' : 'deepseek_v4_flash',
      useResearch: RESEARCH_RE.test(t) || REALTIME_RE.test(t),
      reason: 'Light chat / Q&A',
    };
  }

  // Builds — Converter always DeepSeek Flash (cheap), builder by complexity
  if (COMPLEX_RE.test(t)) {
    return {
      kind: 'build_complex',
      converter: 'deepseek_v4_flash',
      builder: 'kimi_k3',
      useResearch: RESEARCH_RE.test(t) || /\bcrypto\b/i.test(t),
      reason: 'Complex product build → Kimi K3 flagship',
    };
  }

  if (LONG_HORIZON_RE.test(t)) {
    return {
      kind: 'build_long_horizon',
      converter: 'deepseek_v4_flash',
      builder: 'glm_5_2',
      useResearch: false,
      reason: 'Long-horizon / large codebase → GLM-5.2',
    };
  }

  if (/\b(landing\s*page|simple\s+(web|site|app)|basic\s+(web|site|app)|static\s+site|todo\s*app)\b/i.test(t)) {
    return {
      kind: 'build_volume',
      converter: 'deepseek_v4_flash',
      builder: 'deepseek_v4_pro',
      useResearch: false,
      reason: 'Simple/volume site → DeepSeek V4 Pro',
    };
  }

  return {
    kind: 'build_complex',
    converter: 'deepseek_v4_flash',
    builder: 'kimi_k3',
    useResearch: false,
    reason: 'Default product build → Kimi K3',
  };
}
