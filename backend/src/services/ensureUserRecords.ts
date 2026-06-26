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
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (!actions) {
    await supabase.from('user_actions').insert({
      user_id: userId,
      plan_tier: 'unpaid',
      total_actions: FREE_TRIAL_ACTIONS,
      used_actions: 0,
    });
  }
}
