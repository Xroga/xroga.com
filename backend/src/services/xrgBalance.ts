import { getSupabaseAdmin } from '../config/supabase.js';

export interface XrgBalance {
  totalXrg: number;
  availableXrg: number;
  vestedXrg: number;
  tokenBoostTotal: number;
  consistencyStreakMonths: number;
  consistencyBonusPercent: number;
}

const memory = new Map<string, XrgBalance>();

function defaultBalance(): XrgBalance {
  return {
    totalXrg: 0,
    availableXrg: 0,
    vestedXrg: 0,
    tokenBoostTotal: 0,
    consistencyStreakMonths: 0,
    consistencyBonusPercent: 0,
  };
}

export async function getXrgBalance(userId: string): Promise<XrgBalance> {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const supabase = getSupabaseAdmin();
      const { data } = await supabase
        .from('user_xrg_balance')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (data) {
        return {
          totalXrg: Number(data.total_xrg ?? 0),
          availableXrg: Number(data.available_xrg ?? 0),
          vestedXrg: Number(data.vested_xrg ?? 0),
          tokenBoostTotal: Number(data.token_boost_total ?? 0),
          consistencyStreakMonths: Number(data.consistency_streak_months ?? 0),
          consistencyBonusPercent: Number(data.consistency_bonus_percent ?? 0),
        };
      }
    } catch {
      // fall through to memory
    }
  }

  return memory.get(userId) ?? defaultBalance();
}

export async function creditXrg(
  userId: string,
  xrg: number,
  tokenBoost: number
): Promise<XrgBalance> {
  const current = await getXrgBalance(userId);
  const updated: XrgBalance = {
    ...current,
    totalXrg: current.totalXrg + xrg,
    availableXrg: current.availableXrg + xrg,
    tokenBoostTotal: current.tokenBoostTotal + tokenBoost,
  };

  memory.set(userId, updated);

  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const supabase = getSupabaseAdmin();
      await supabase.from('user_xrg_balance').upsert(
        {
          user_id: userId,
          total_xrg: updated.totalXrg,
          available_xrg: updated.availableXrg,
          vested_xrg: updated.vestedXrg,
          token_boost_total: updated.tokenBoostTotal,
          consistency_streak_months: updated.consistencyStreakMonths,
          consistency_bonus_percent: updated.consistencyBonusPercent,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );
    } catch {
      // memory fallback ok
    }
  }

  return updated;
}
