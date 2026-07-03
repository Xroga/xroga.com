import type { FeatureCategory, SwarmProgressEvent } from '../../types/features.js';

/** 7-phase AI Swarm Logic negotiation loop (Phase 0–7) */
export type NegotiationPhase = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const PHASE_LABELS: Record<NegotiationPhase, string> = {
  0: 'Discovery & Clarification',
  1: 'Initial Planning',
  2: 'Plan Cross-Verification',
  3: 'Step-by-Step Execution',
  4: 'Multi-Agent Verification',
  5: 'Error Negotiation & Correction',
  6: 'Final Full-Code Verification',
  7: 'Black Hole V∞ Emission',
};

export interface NegotiationContext {
  userPrompt: string;
  userId: string;
  featureCategory: FeatureCategory;
  onProgress?: (event: SwarmProgressEvent) => void;
}

export interface NegotiationResult {
  success: boolean;
  clarifiedBrief: string;
  approvedPlan: string;
  assembledCode: string;
  polishedOutput: string;
  needsUserClarification?: boolean;
  clarificationText?: string;
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
