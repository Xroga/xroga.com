import { getSupabaseAdmin } from '../config/supabase.js';
import { TOKEN_DISTRIBUTION } from '../config/phase3Constants.js';
import { getUsage, creditBonusTokens } from '../phase1/tokenTracker.js';

export interface TokenDistributionPreview {
  unusedTokens: number;
  manualTotal: number;
  autoTotal: number;
  rolloverAmount: number;
  shareAmount: number;
  autoPlatform: number;
  autoCommunity: number;
  autoHeavyUsers: number;
  autoBuilders: number;
  alreadyDistributed: boolean;
}

function periodKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function getDistributionPreview(userId: string): Promise<TokenDistributionPreview> {
  const usage = await getUsage(userId);
  const unused = usage.totalTokensRemaining;

  const rolloverAmount = Math.floor(unused * (TOKEN_DISTRIBUTION.rolloverPercent / 100));
  const shareAmount = Math.floor(unused * (TOKEN_DISTRIBUTION.sharePercent / 100));
  const autoPlatform = Math.floor(unused * (TOKEN_DISTRIBUTION.platformReservePercent / 100));
  const autoCommunity = Math.floor(unused * (TOKEN_DISTRIBUTION.communityPoolPercent / 100));
  const autoHeavyUsers = Math.floor(unused * (TOKEN_DISTRIBUTION.heavyUsersPercent / 100));
  const autoBuilders = Math.floor(unused * (TOKEN_DISTRIBUTION.activeBuildersPercent / 100));

  let alreadyDistributed = false;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const supabase = getSupabaseAdmin();
      const { data } = await supabase
        .from('token_distribution_log')
        .select('id')
        .eq('user_id', userId)
        .eq('period_key', periodKey())
        .maybeSingle();
      alreadyDistributed = Boolean(data);
    } catch {
      // ignore
    }
  }

  return {
    unusedTokens: unused,
    manualTotal: rolloverAmount + shareAmount,
    autoTotal: autoPlatform + autoCommunity + autoHeavyUsers + autoBuilders,
    rolloverAmount,
    shareAmount,
    autoPlatform,
    autoCommunity,
    autoHeavyUsers,
    autoBuilders,
    alreadyDistributed,
  };
}

export async function confirmDistribution(
  userId: string,
  opts: { rollover: boolean; shareTarget?: 'community' | 'friends' | 'team' }
): Promise<{ success: boolean; message: string }> {
  const preview = await getDistributionPreview(userId);
  if (preview.alreadyDistributed) {
    return { success: false, message: 'Tokens for this month were already distributed.' };
  }
  if (preview.unusedTokens <= 0) {
    return { success: false, message: 'No unused tokens to distribute.' };
  }

  let credited = 0;
  if (opts.rollover) {
    await creditBonusTokens(userId, preview.rolloverAmount);
    credited += preview.rolloverAmount;
  }

  if (opts.shareTarget === 'community' && preview.shareAmount > 0) {
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const supabase = getSupabaseAdmin();
        const { data: pool } = await supabase.from('community_pool').select('balance_tokens').eq('id', 1).single();
        await supabase.from('community_pool').update({
          balance_tokens: Number(pool?.balance_tokens ?? 0) + preview.shareAmount,
          updated_at: new Date().toISOString(),
        }).eq('id', 1);
      } catch {
        // ignore
      }
    }
  }

  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const supabase = getSupabaseAdmin();
      await supabase.from('token_distribution_log').insert({
        user_id: userId,
        period_key: periodKey(),
        unused_tokens: preview.unusedTokens,
        rollover_tokens: opts.rollover ? preview.rolloverAmount : 0,
        shared_tokens: opts.shareTarget ? preview.shareAmount : 0,
        share_target: opts.shareTarget ?? null,
        auto_platform: preview.autoPlatform,
        auto_community: preview.autoCommunity,
        auto_heavy_users: preview.autoHeavyUsers,
        auto_builders: preview.autoBuilders,
      });
    } catch {
      // ignore
    }
  }

  return {
    success: true,
    message: opts.rollover
      ? `${preview.rolloverAmount.toLocaleString()} tokens rolled to next month. Automatic allocations recorded.`
      : 'Automatic token distribution recorded for this month.',
  };
}
