import { FREE_TRIAL_ACTIONS } from '../config/plans.js';
import { getSupabaseAdmin } from '../config/supabase.js';

function currentPeriodStart(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/**
 * Ensures profile + user_actions + token quota exist after auth.
 * Free/unpaid users receive 7M tokens/month for testing.
 */
export async function ensureUserRecords(userId: string, email?: string): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (!profile) {
    await supabase.from('profiles').insert({
      id: userId,
      display_name: email?.split('@')[0] ?? 'User',
    });
  }

  const { data: actions } = await supabase
    .from('user_actions')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (!actions) {
    await supabase.from('user_actions').insert({
      user_id: userId,
      plan_tier: 'unpaid',
      total_actions: FREE_TRIAL_ACTIONS,
      used_actions: 0,
      concurrency_limit: 1,
    });
    // Do NOT return early — token quota row must still be provisioned below.
  }

  const period = currentPeriodStart();
  const { data: tokenRow, error: tokenSelectErr } = await supabase
    .from('user_token_usage')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  // NEVER upsert absolute zeros — that can wipe concurrent billed usage on race/select miss.
  if (!tokenRow && !tokenSelectErr) {
    await supabase.from('user_token_usage').upsert(
      {
        user_id: userId,
        input_tokens: 0,
        output_tokens: 0,
        emergency_bonus: 0,
        bonus_tokens: 0,
        quota_period_start: period,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id', ignoreDuplicates: true }
    );
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
    }
  }
}
