/**
 * Central LLM usage billing — every API path should call this after model work.
 */

import type { XrogaModelRole } from '../config/modelRegistry.js';
import { recordUsage, getUsage } from './tokenTracker.js';
import { recordModelUsage } from './modelQuotaTracker.js';
import type { TokenUsageSnapshot } from './types.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { phase1Logger } from './logger.js';

export interface ModelUsageLine {
  role: XrogaModelRole;
  inputTokens: number;
  outputTokens: number;
}

/** Estimate tokens from text when provider usage is unavailable. */
export function estimateTokensFromText(...parts: string[]): { input: number; output: number } {
  const total = parts.reduce((s, p) => s + (p?.length ?? 0), 0);
  if (parts.length >= 2) {
    const input = Math.max(1, Math.ceil((parts.slice(0, -1).join('').length) / 4));
    const output = Math.max(1, Math.ceil((parts[parts.length - 1]?.length ?? 0) / 4));
    return { input, output };
  }
  const t = Math.max(1, Math.ceil(total / 4));
  return { input: t, output: Math.max(1, Math.round(t * 0.4)) };
}

/** Record aggregate + optional per-model usage; returns updated snapshot. */
export async function recordLlmUsage(
  userId: string,
  inputTokens: number,
  outputTokens: number,
  modelLines?: ModelUsageLine[]
): Promise<TokenUsageSnapshot> {
  const input = Math.max(0, Math.round(inputTokens));
  const output = Math.max(0, Math.round(outputTokens));
  if (input + output === 0) return getUsage(userId);

  const snapshot = await recordUsage(userId, input, output);

  if (modelLines?.length) {
    await recordModelUsage(userId, modelLines);
  } else if (input + output > 0) {
    await recordModelUsage(userId, [{ role: 'deepseek_flash', inputTokens: input, outputTokens: output }]);
  }

  void logTokenActivity(userId, input, output).catch(() => {});

  phase1Logger.debug('LLM usage billed', { userId, input, output, models: modelLines?.length ?? 1 });
  return snapshot;
}

async function logTokenActivity(userId: string, input: number, output: number): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const supabase = getSupabaseAdmin();
  await supabase.from('activity_logs').insert({
    user_id: userId,
    action: 'ai_tokens_used',
    details: { inputTokens: input, outputTokens: output, total: input + output },
  });
}

/** Bill a chat turn from prompt + reply text. */
export async function recordChatTurnUsage(
  userId: string,
  prompt: string,
  reply: string,
  role: XrogaModelRole = 'deepseek_flash'
): Promise<TokenUsageSnapshot> {
  const { input, output } = estimateTokensFromText(prompt, reply);
  return recordLlmUsage(userId, input, output, [{ role, inputTokens: input, outputTokens: output }]);
}
