/** Xroga AI Phase 1 — Model registry (internal only; never exposed to users) */

import type { InternalModelId } from './types.js';

export interface ModelConfig {
  id: InternalModelId;
  /** Provider API model id */
  apiModel: string;
  provider: 'deepseek' | 'xai' | 'anthropic';
  inputCostPer1M: number;
  outputCostPer1M: number;
  contextWindow: number;
  /** Fallback if primary fails */
  fallback?: InternalModelId;
}

export const MODELS: Record<InternalModelId, ModelConfig> = {
  deepseek_flash: {
    id: 'deepseek_flash',
    apiModel: 'deepseek-chat',
    provider: 'deepseek',
    inputCostPer1M: 0.14,
    outputCostPer1M: 0.28,
    contextWindow: 1_000_000,
    fallback: undefined,
  },
  deepseek_pro: {
    id: 'deepseek_pro',
    apiModel: 'deepseek-reasoner',
    provider: 'deepseek',
    inputCostPer1M: 0.435,
    outputCostPer1M: 0.87,
    contextWindow: 1_000_000,
    fallback: 'deepseek_flash',
  },
  grok_fast: {
    id: 'grok_fast',
    apiModel: process.env.XROGA_GROK_MODEL?.trim() || 'grok-4-fast-reasoning',
    provider: 'xai',
    inputCostPer1M: 0.2,
    outputCostPer1M: 0.5,
    contextWindow: 2_000_000,
    fallback: 'deepseek_flash',
  },
  claude_sonnet: {
    id: 'claude_sonnet',
    apiModel: process.env.XROGA_CLAUDE_SONNET_MODEL?.trim() || 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    inputCostPer1M: 2.0,
    outputCostPer1M: 10.0,
    contextWindow: 1_000_000,
    fallback: 'deepseek_flash',
  },
  claude_opus: {
    id: 'claude_opus',
    apiModel: process.env.XROGA_CLAUDE_OPUS_MODEL?.trim() || 'claude-opus-4-20250514',
    provider: 'anthropic',
    inputCostPer1M: 5.0,
    outputCostPer1M: 25.0,
    contextWindow: 1_000_000,
    fallback: 'deepseek_pro',
  },
};

export const QUOTA = {
  inputTokens: 4_700_000,
  outputTokens: 2_300_000,
  totalTokens: 7_000_000,
  emergencyTokens: 250_000,
  emergencyThreshold: 100_000,
} as const;

export function estimateCost(
  modelId: InternalModelId,
  inputTokens: number,
  outputTokens: number
): number {
  const m = MODELS[modelId];
  return (
    (inputTokens / 1_000_000) * m.inputCostPer1M +
    (outputTokens / 1_000_000) * m.outputCostPer1M
  );
}
