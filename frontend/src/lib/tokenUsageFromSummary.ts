import type { DashboardSummary, TokenUsage } from '@/lib/api';

const DEFAULT_LIMIT = 7_000_000;
const DEFAULT_INPUT = 4_700_000;
const DEFAULT_OUTPUT = 2_300_000;

export function tokenUsageFromSummary(summary: unknown): {
  usage: TokenUsage | null;
  planTier: string | null;
  planName: string | null;
} {
  if (!summary || typeof summary !== 'object') {
    return { usage: null, planTier: null, planName: null };
  }

  const s = summary as Partial<DashboardSummary> & {
    actions?: { remaining?: number; used?: number; total?: number; resetDate?: string };
  };

  const billing = s.billing;
  const tokens = s.tokens;

  if (tokens && typeof tokens.totalUsed === 'number') {
    return {
      usage: {
        inputTokensUsed: tokens.inputUsed ?? 0,
        outputTokensUsed: tokens.outputUsed ?? 0,
        totalTokensUsed: tokens.totalUsed ?? 0,
        inputTokensRemaining: tokens.inputRemaining ?? DEFAULT_INPUT,
        outputTokensRemaining: tokens.outputRemaining ?? DEFAULT_OUTPUT,
        totalTokensRemaining: tokens.totalRemaining ?? DEFAULT_LIMIT,
        percentUsed: tokens.percentUsed ?? 0,
        quotaPeriodStart:
          tokens.quotaPeriodStart ?? new Date().toISOString().slice(0, 10),
        emergencyTokensAvailable: Boolean(tokens.emergencyAvailable),
        emergencyTokensClaimedThisMonth: Boolean(tokens.emergencyClaimed),
        totalLimit: tokens.totalLimit ?? DEFAULT_LIMIT,
      },
      planTier: billing?.planTier ?? null,
      planName: billing?.planName ?? null,
    };
  }

  // Legacy actions API shape (pre-token migration)
  const actions = s.actions;
  if (actions && typeof actions.remaining === 'number') {
    const total = actions.total ?? actions.remaining + (actions.used ?? 0);
    const remaining = actions.remaining;
    const used = actions.used ?? Math.max(0, total - remaining);
    const percentUsed = total > 0 ? Math.round((used / total) * 100) : 0;
    return {
      usage: {
        inputTokensUsed: Math.round(used * 0.67),
        outputTokensUsed: Math.round(used * 0.33),
        totalTokensUsed: used,
        inputTokensRemaining: Math.round(remaining * 0.67),
        outputTokensRemaining: Math.round(remaining * 0.33),
        totalTokensRemaining: remaining,
        percentUsed,
        quotaPeriodStart:
          actions.resetDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
        emergencyTokensAvailable: false,
        emergencyTokensClaimedThisMonth: false,
        totalLimit: total,
      },
      planTier: null,
      planName: null,
    };
  }

  return { usage: null, planTier: null, planName: null };
}

export const DEFAULT_TOKEN_USAGE: TokenUsage = {
  inputTokensUsed: 0,
  outputTokensUsed: 0,
  totalTokensUsed: 0,
  inputTokensRemaining: DEFAULT_INPUT,
  outputTokensRemaining: DEFAULT_OUTPUT,
  totalTokensRemaining: DEFAULT_LIMIT,
  percentUsed: 0,
  quotaPeriodStart: new Date().toISOString().slice(0, 10),
  emergencyTokensAvailable: false,
  emergencyTokensClaimedThisMonth: false,
  totalLimit: DEFAULT_LIMIT,
};
