import { getSupabaseAdmin } from '../config/supabase.js';

/**
 * Internal public-web economics.
 *
 * These are NOT customer quotas.
 * Crossing either value never blocks a user request.
 *
 * They exist for:
 * - COGS monitoring
 * - routing analytics
 * - future economic tuning
 */
export const WEB_TARGET_MICRO_USD = 750_000; // $0.75
export const WEB_SOFT_BURST_MICRO_USD = 1_250_000; // $1.25

export const WEB_PRICE_VERSION = '2026-09-06-v1';

export type WebProvider = 'parallel' | 'xai';

export type WebOperation =
  | 'parallel_extract'
  | 'parallel_search_turbo'
  | 'parallel_responses_low'
  | 'parallel_responses_medium'
  | 'grok_x_search';

/**
 * Record actual/fixed web-provider spend.
 *
 * Important:
 * accounting failure must NEVER fail the user's build.
 */
export async function recordWebSpend(input: {
  userId: string;
  provider: WebProvider;
  operation: WebOperation;
  microUsd: number;
  providerRequestId?: string;
}): Promise<void> {
  const amount = Math.max(0, Math.round(input.microUsd));

  if (!amount) return;

  // Local/dev environments without durable billing storage
  // should still be allowed to execute.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return;
  }

  try {
    const admin = getSupabaseAdmin();
    const now = new Date().toISOString();

    const { data: cycle } = await admin
      .from('xroga_billing_cycles')
      .select('id')
      .eq('user_id', input.userId)
      .eq('status', 'active')
      .lte('starts_at', now)
      .gt('ends_at', now)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { error } = await admin.from('xroga_web_usage').insert({
      cycle_id: cycle?.id ?? null,
      user_id: input.userId,
      provider: input.provider,
      operation: input.operation,
      price_version: WEB_PRICE_VERSION,
      actual_micro_usd: amount,
      provider_request_id: input.providerRequestId ?? null,
    });

    if (error) {
      console.warn('[web-budget] accounting write failed:', error.message);
    }
  } catch (error) {
    console.warn(
      '[web-budget] accounting unavailable:',
      (error as Error).message,
    );
  }
}
