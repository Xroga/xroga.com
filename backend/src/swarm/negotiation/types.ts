import type { FeatureCategory, SwarmProgressEvent } from '../../types/features.js';
import type { BuildUsageTracker } from '../../lib/buildUsageTracker.js';
import type { ModelUsageLine } from '../../lib/buildUsageTracker.js';

/** 9-phase AI Swarm Logic (internal 0–8 maps to user-facing Phases 1–9) */
export type NegotiationPhase = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const PHASE_LABELS: Record<NegotiationPhase, string> = {
  0: 'Phase 1: Discovery',
  1: 'Phase 2: Planning',
  2: 'Phase 3: Plan Cross-Verification',
  3: 'Phase 4: Execution',
  4: 'Phase 5: Verification',
  5: 'Phase 6: Correction',
  6: 'Phase 7: Final Holistic Verification',
  7: 'Phase 8: Black Hole V∞ Emission',
  8: 'Phase 9: Auto-Deploy & Live Preview',
};

/** User-facing phase number (1–9) from internal index */
export function userPhaseNumber(internal: NegotiationPhase): number {
  return internal + 1;
}

export interface NegotiationContext {
  userPrompt: string;
  userId: string;
  featureCategory: FeatureCategory;
  onProgress?: (event: SwarmProgressEvent) => void;
  /** Selected repo from chatbar — push updates here instead of creating a new repo */
  githubTargetRepo?: string;
  githubTargetBranch?: string;
  assistantMessageId?: string;
  /** Accumulates real API token usage for billing */
  usageTracker?: BuildUsageTracker;
}

export interface NegotiationResult {
  success: boolean;
  clarifiedBrief: string;
  approvedPlan: string;
  assembledCode: string;
  polishedOutput: string;
  needsUserClarification?: boolean;
  clarificationText?: string;
  needsGitHubConnection?: boolean;
  needsVercelConnection?: boolean;
  featureOutput?: import('../../types/features.js').FeatureOutput;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedUsd: number;
    byModel: ModelUsageLine[];
  };
}

export interface VerificationReport {
  agent: 'groq' | 'gemini' | 'mistral';
  pass: boolean;
  report: string;
}

export type SwarmTodoStatus = 'done' | 'active' | 'pending';

export interface SwarmTodoItem {
  id: string;
  label: string;
  status: SwarmTodoStatus;
}
