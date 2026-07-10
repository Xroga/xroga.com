/** Xroga AI Phase 1 — Foundation Layer types */

export const PHASE1_INTENTS = [
  'code_generation',
  'code_reading',
  'architecture_design',
  'security_audit',
  'ui_ux_design',
  'business_advice',
  'deep_reasoning',
  'general_chat',
  'file_analysis',
  'image_generation',
  'browser_automation',
] as const;

export type Phase1Intent = (typeof PHASE1_INTENTS)[number];

export type InternalModelId =
  | 'deepseek_flash'
  | 'deepseek_pro'
  | 'grok_fast'
  | 'claude_sonnet'
  | 'claude_opus';

export interface ModelCallResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  modelId: InternalModelId;
}

export interface TokenUsageSnapshot {
  inputTokensUsed: number;
  outputTokensUsed: number;
  totalTokensUsed: number;
  inputTokensRemaining: number;
  outputTokensRemaining: number;
  totalTokensRemaining: number;
  percentUsed: number;
  quotaPeriodStart: string;
  emergencyTokensAvailable: boolean;
  emergencyTokensClaimedThisMonth: boolean;
}

export interface Phase1ChatRequest {
  message: string;
  userId: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface Phase1ChatResponse {
  response: string;
  intent: Phase1Intent;
  usage: TokenUsageSnapshot;
}

export interface Phase1ErrorResponse {
  error: string;
  code: string;
}

export interface RoutingPlan {
  intent: Phase1Intent;
  primary: InternalModelId | null;
  secondary: InternalModelId | null;
  phase2Message?: string;
  grokReasoningEffort?: 'high';
}
