import crypto from 'crypto';
import { getSupabaseAdmin } from '../config/supabase.js';
import { COMMUNITY_POOL } from '../config/phase3Constants.js';
import { creditBonusTokens, getUsage } from '../phase1/tokenTracker.js';

export interface CommunityPoolStatus {
  poolBalance: number;
  accountAgeDays: number;
  remainingTokens: number;
  requestsThisMonth: number;
  maxRequestsPerMonth: number;
  maxPerMonth: number;
  requestAmount: number;
  eligible: boolean;
  eligibilityReasons: string[];
  nextAvailableAt: string | null;
  history: Array<{
    id: string;
    amount: number;
    status: string;
    reason: string | null;
    createdAt: string;
  }>;
}

const memoryPoolBalance = COMMUNITY_POOL.initialBalance;
const memoryRequests = new Map<string, Array<{ id: string; amount: number; status: string; reason: string | null; createdAt: string }>>();

function monthKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function getAccountAgeDays(userId: string): Promise<number> {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const supabase = getSupabaseAdmin();
      const { data } = await supabase
        .from('profiles')
        .select('created_at')
        .eq('id', userId)
        .maybeSingle();
      if (data?.created_at) {
        const created = new Date(data.created_at).getTime();
        return Math.floor((Date.now() - created) / (1000 * 60 * 60 * 24));
      }
    } catch {
      // fallback
    }
  }
  return 45;
}

async function getPoolBalance(): Promise<number> {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const supabase = getSupabaseAdmin();
      const { data } = await supabase.from('community_pool').select('balance_tokens').eq('id', 1).maybeSingle();
      return Number(data?.balance_tokens ?? COMMUNITY_POOL.initialBalance);
    } catch {
      return memoryPoolBalance;
    }
  }
  return memoryPoolBalance;
}

async function getUserRequestsThisMonth(userId: string): Promise<{
  count: number;
  totalAmount: number;
  history: CommunityPoolStatus['history'];
}> {
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const supabase = getSupabaseAdmin();
      const { data } = await supabase
        .from('community_pool_requests')
        .select('*')
        .eq('user_id', userId)
        .gte('created_at', startOfMonth.toISOString())
        .order('created_at', { ascending: false });

      const approved = (data ?? []).filter((r) => r.status === 'approved');
      return {
        count: approved.length,
        totalAmount: approved.reduce((s, r) => s + Number(r.amount), 0),
        history: (data ?? []).map((r) => ({
          id: r.id,
          amount: Number(r.amount),
          status: r.status,
          reason: r.reason,
          createdAt: r.created_at,
        })),
      };
    } catch {
      // memory
    }
  }

  const all = memoryRequests.get(userId) ?? [];
  const month = monthKey();
  const thisMonth = all.filter((r) => r.createdAt.startsWith(month.slice(0, 7)) || r.status);
  const approved = thisMonth.filter((r) => r.status === 'approved');
  return {
    count: approved.length,
    totalAmount: approved.reduce((s, r) => s + r.amount, 0),
    history: all,
  };
}

export async function getCommunityPoolStatus(userId: string): Promise<CommunityPoolStatus> {
  const [poolBalance, accountAgeDays, usage, reqData] = await Promise.all([
    getPoolBalance(),
    getAccountAgeDays(userId),
    getUsage(userId),
    getUserRequestsThisMonth(userId),
  ]);

  const remainingTokens = usage.totalTokensRemaining;
  const reasons: string[] = [];
  let eligible = true;

  if (accountAgeDays < COMMUNITY_POOL.minAccountAgeDays) {
    eligible = false;
    reasons.push(`Account must be at least ${COMMUNITY_POOL.minAccountAgeDays} days old (${accountAgeDays} days).`);
  }
  if (remainingTokens >= COMMUNITY_POOL.eligibilityRemainingBelow) {
    eligible = false;
    reasons.push(
      `Remaining tokens must be below ${COMMUNITY_POOL.eligibilityRemainingBelow.toLocaleString()} (you have ${remainingTokens.toLocaleString()}).`
    );
  }
  if (reqData.count >= COMMUNITY_POOL.maxRequestsPerMonth) {
    eligible = false;
    reasons.push('Monthly request limit reached (2 requests).');
  }
  if (reqData.totalAmount + COMMUNITY_POOL.requestAmount > COMMUNITY_POOL.maxPerMonth) {
    eligible = false;
    reasons.push('Monthly token cap reached (100,000 tokens).');
  }
  if (poolBalance < COMMUNITY_POOL.requestAmount) {
    eligible = false;
    reasons.push('Community pool is temporarily low. Try again later.');
  }

  let nextAvailableAt: string | null = null;
  if (reqData.count >= COMMUNITY_POOL.maxRequestsPerMonth) {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() + 1);
    d.setUTCDate(1);
    nextAvailableAt = d.toISOString().slice(0, 10);
  }

  return {
    poolBalance,
    accountAgeDays,
    remainingTokens,
    requestsThisMonth: reqData.count,
    maxRequestsPerMonth: COMMUNITY_POOL.maxRequestsPerMonth,
    maxPerMonth: COMMUNITY_POOL.maxPerMonth,
    requestAmount: COMMUNITY_POOL.requestAmount,
    eligible,
    eligibilityReasons: eligible ? [] : reasons,
    nextAvailableAt,
    history: reqData.history,
  };
}

export async function requestCommunityPoolTokens(userId: string): Promise<{
  success: boolean;
  message: string;
  newBalance?: number;
}> {
  const status = await getCommunityPoolStatus(userId);
  if (!status.eligible) {
    return {
      success: false,
      message: status.eligibilityReasons[0] ?? 'Not eligible for community pool tokens.',
    };
  }

  const amount = COMMUNITY_POOL.requestAmount;

  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const supabase = getSupabaseAdmin();
      const { data: pool } = await supabase.from('community_pool').select('balance_tokens').eq('id', 1).single();
      const balance = Number(pool?.balance_tokens ?? 0);
      if (balance < amount) {
        return { success: false, message: 'Community pool balance too low.' };
      }

      await supabase.from('community_pool').update({
        balance_tokens: balance - amount,
        updated_at: new Date().toISOString(),
      }).eq('id', 1);

      await supabase.from('community_pool_requests').insert({
        user_id: userId,
        amount,
        status: 'approved',
        reason: null,
      });
    } catch (err) {
      return { success: false, message: (err as Error).message };
    }
  } else {
    const entry = {
      id: crypto.randomUUID(),
      amount,
      status: 'approved',
      reason: null,
      createdAt: new Date().toISOString(),
    };
    const list = memoryRequests.get(userId) ?? [];
    list.unshift(entry);
    memoryRequests.set(userId, list);
  }

  const snapshot = await creditBonusTokens(userId, amount);
  return {
    success: true,
    message: `${amount.toLocaleString()} AI tokens added from the Community Pool!`,
    newBalance: snapshot.totalTokensRemaining,
  };
}
