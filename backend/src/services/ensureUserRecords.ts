import { FREE_TRIAL_ACTIONS } from '../config/plans.js';
import { getSupabaseAdmin } from '../config/supabase.js';

/**
 * Ensures profile + user_actions exist after auth (handles users created before triggers).
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
    return;
  }

  // Fix unpaid users stuck at 0 or wrong trial totals
  if (actions.plan_tier === 'unpaid' || !actions.plan_tier) {
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
