import { FREE_TRIAL_ACTIONS, getApiBudgetUsd } from '../config/plans.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { recordSupabaseCall } from '../lib/supabaseCallCounters.js';
import {
  isUserProvisioned,
  markUserProvisioned,
  recordProvisioningSkipped,
} from './userProvisioningCache.js';

function currentPeriodStart(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/** Collapses concurrent first-request provisioning for one user into one pass. */
const inFlight = new Map<string, Promise<void>>();

/**
 * Ensures profile + user_actions + token quota exist after auth.
 * AI credit/token pools come from plan tier (shared across devices via Supabase).
 *
 * Performs no reads once the rows are known to exist — see `userProvisioningCache`
 * for why that is safe and what it deliberately does not cache.
 */
export async function ensureUserRecords(userId: string, email?: string): Promise<void> {
  if (isUserProvisioned(userId)) {
    recordProvisioningSkipped();
    return;
  }

  const existing = inFlight.get(userId);
  if (existing) return existing;

  const pending = provisionUserRecords(userId, email).finally(() => {
    inFlight.delete(userId);
  });
  inFlight.set(userId, pending);
  return pending;
}

async function provisionUserRecords(userId: string, email?: string): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();
  recordSupabaseCall({ table: 'profiles', operation: 'select', outcome: 'ok' });

  if (!profile) {
    await supabase.from('profiles').insert({
      id: userId,
      display_name: email?.split('@')[0] ?? 'User',
    });
    recordSupabaseCall({ table: 'profiles', operation: 'insert', outcome: 'ok' });
  }

  const { data: actions } = await supabase
    .from('user_actions')
    // Only the columns this function reasons about. `select('*')` returned every
    // billing column on a request that merely checks the row exists.
    .select('plan_tier, total_actions, used_actions')
    .eq('user_id', userId)
    .maybeSingle();
  recordSupabaseCall({ table: 'user_actions', operation: 'select', outcome: 'ok' });

  if (!actions) {
    await supabase.from('user_actions').insert({
      user_id: userId,
      plan_tier: 'unpaid',
      total_actions: FREE_TRIAL_ACTIONS,
      used_actions: 0,
      concurrency_limit: 1,
    });
    recordSupabaseCall({ table: 'user_actions', operation: 'insert', outcome: 'ok' });
    // Do NOT return early — token quota row must still be provisioned below.
  }

  const planTier = (actions?.plan_tier as string) || 'unpaid';
  const period = currentPeriodStart();
  const { data: tokenRow, error: tokenSelectErr } = await supabase
    .from('user_token_usage')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  recordSupabaseCall({
    table: 'user_token_usage',
    operation: 'select',
    outcome: tokenSelectErr ? 'error' : 'ok',
  });

  // NEVER upsert absolute zeros — that can wipe concurrent billed usage on race/select miss.
  if (!tokenRow && !tokenSelectErr) {
    await supabase.from('user_token_usage').upsert(
      {
        user_id: userId,
        input_tokens: 0,
        output_tokens: 0,
        emergency_bonus: 0,
        bonus_tokens: 0,
        spent_usd: 0,
        rollover_usd: 0,
        plan_budget_usd: getApiBudgetUsd(planTier),
        plan_tier: planTier,
        quota_period_start: period,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id', ignoreDuplicates: true }
    );
    recordSupabaseCall({ table: 'user_token_usage', operation: 'upsert', outcome: 'ok' });
  }

  // Fix unpaid users stuck at 0 or wrong trial totals
  if (actions && (actions.plan_tier === 'unpaid' || !actions.plan_tier)) {
    const used = actions.used_actions ?? 0;
    const needsFix =
      actions.total_actions < FREE_TRIAL_ACTIONS ||
      actions.total_actions > FREE_TRIAL_ACTIONS * 2;

    if (needsFix) {
      await supabase
        .from('user_actions')
        .update({
          plan_tier: 'unpaid',
          total_actions: FREE_TRIAL_ACTIONS,
          used_actions: Math.min(used, FREE_TRIAL_ACTIONS),
          concurrency_limit: 1,
        })
        .eq('user_id', userId);
      recordSupabaseCall({ table: 'user_actions', operation: 'update', outcome: 'ok' });
    }
  }

  // Reached only when every row above is present. A throw on any step leaves the
  // user unmarked, so the next request retries rather than assuming success.
  markUserProvisioned(userId);
}
