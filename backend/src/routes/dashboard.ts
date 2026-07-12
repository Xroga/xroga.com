import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { getUsage, claimEmergencyTokens, getUserQuotaLimit } from '../phase1/tokenTracker.js';
import { getModelUsageBreakdown } from '../phase1/modelQuotaTracker.js';
import { getXrgBalance } from '../services/xrgBalance.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { GALACTIC_PLANS, planDisplayName } from '../config/galacticPlans.js';
import { inputLimitForPlan, outputLimitForPlan } from '../config/modelRegistry.js';

const router = Router();

function daysRemainingInMonth(): number {
  const now = new Date();
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return Math.max(0, last.getUTCDate() - now.getUTCDate());
}

router.get('/summary', async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const usage = await getUsage(userId);
  const xrg = await getXrgBalance(userId);
  const modelBreakdown = await getModelUsageBreakdown(userId);

  const baseLimit = await getUserQuotaLimit(userId);
  const totalLimit = baseLimit + xrg.tokenBoostTotal;
  const inputLimit = inputLimitForPlan(totalLimit);
  const outputLimit = outputLimitForPlan(totalLimit);

  let planTier = 'spark';
  let planName = 'Basic';
  let planPrice = '$19/month';
  let nextBilling = '';

  try {
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = getSupabaseAdmin();
      const { data: actions } = await supabase
        .from('user_actions')
        .select('plan_tier, reset_date')
        .eq('user_id', userId)
        .maybeSingle();

      if (actions?.plan_tier) {
        planTier = actions.plan_tier;
        const plan = GALACTIC_PLANS.find((p) => p.tier === planTier);
        planName = planDisplayName(planTier);
        planPrice = plan ? `${plan.priceLabel}/month` : '$19/month';
      }
      if (actions?.reset_date) {
        nextBilling = new Date(actions.reset_date).toISOString().slice(0, 10);
      }
    }
  } catch {
    // defaults ok
  }

  if (!nextBilling) {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() + 1);
    d.setUTCDate(1);
    nextBilling = d.toISOString().slice(0, 10);
  }

  let recentActivity: Array<{ action: string; created_at: string; projectName?: string }> = [];
  try {
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = getSupabaseAdmin();
      const { data } = await supabase
        .from('activity_logs')
        .select('action, created_at, projects(name)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(8);
      recentActivity =
        data?.map((row) => ({
          action: row.action,
          created_at: row.created_at,
          projectName: (row.projects as { name?: string } | null)?.name,
        })) ?? [];
    }
  } catch {
    // empty ok
  }

  const daysLeft = daysRemainingInMonth();
  const dailyUsage =
    daysLeft > 0
      ? Math.round(usage.totalTokensUsed / Math.max(1, new Date().getUTCDate()))
      : 0;

  res.json({
    now: new Date().toISOString(),
    tokens: {
      totalLimit,
      totalUsed: usage.totalTokensUsed,
      totalRemaining: usage.totalTokensRemaining,
      percentUsed: usage.percentUsed,
      inputUsed: usage.inputTokensUsed,
      inputLimit,
      inputRemaining: usage.inputTokensRemaining,
      outputUsed: usage.outputTokensUsed,
      outputLimit,
      outputRemaining: usage.outputTokensRemaining,
      emergencyAvailable: usage.emergencyTokensAvailable,
      emergencyClaimed: usage.emergencyTokensClaimedThisMonth,
      daysRemaining: daysLeft,
      estimatedDailyUsage: dailyUsage,
      quotaPeriodStart: usage.quotaPeriodStart,
      byModel: modelBreakdown,
    },
    xrg,
    billing: {
      planTier,
      planName,
      planPrice,
      nextBilling,
      tokensIncluded: totalLimit,
      tokensUsed: usage.totalTokensUsed,
      tokensRemaining: usage.totalTokensRemaining,
    },
    recentActivity,
  });
});

router.post('/emergency-tokens', async (req: AuthRequest, res) => {
  const result = await claimEmergencyTokens(req.userId!);
  res.status(result.success ? 200 : 400).json(result);
});

export default router;
