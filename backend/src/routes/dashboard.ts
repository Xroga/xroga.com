import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { GALACTIC_PLANS, planDisplayName } from '../config/galacticPlans.js';
import { MONTHLY_USER_PRICE_USD } from '../ai/models.js';
import { getApiBudgetUsd, getTokenPool } from '../config/plans.js';
import { getUsage, usageToDashboardTokens } from '../ai/quota.js';
import { computePlatformReady } from '../lib/platformReady.js';
import { listRunsForUserAsync } from '../ai/runStore.js';
import { isPromoFullAccessActive, promoFullAccessEndIso } from '../lib/promoAccess.js';

const router = Router();

router.get('/platform-ready', (_req, res) => {
  res.json(computePlatformReady());
});

/** Promotional product-feature window (does not bypass provider billing / quotas). */
router.get('/promo-access', (_req, res) => {
  res.json({
    active: isPromoFullAccessActive(),
    endsAt: promoFullAccessEndIso(),
    note: 'Unlocks Xroga product features only — provider billing and rate limits still apply.',
  });
});

router.get('/ship-analytics', async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const runs = await listRunsForUserAsync(userId, 40);
  let shipped = 0;
  let handoff = 0;
  let blocked = 0;
  let failed = 0;
  const byKind: Record<string, number> = {};
  const recent: Array<{
    id: string;
    prompt: string;
    status: string;
    ship: string;
    scaffoldKind?: string;
    created_at: string;
  }> = [];

  for (const run of runs) {
    const out = (run.output?.output ?? run.output) as
      | {
          fullyShipped?: boolean;
          handoffReady?: boolean;
          buildOk?: boolean;
          shipBlockers?: string[];
          scaffoldKind?: string;
          shipOutcome?: {
            fullyShipped?: boolean;
            handoffReady?: boolean;
            buildOk?: boolean;
            scaffoldKind?: string;
            blockers?: string[];
          };
        }
      | null
      | undefined;
    const fully = Boolean(out?.shipOutcome?.fullyShipped ?? out?.fullyShipped);
    const hand = Boolean(out?.shipOutcome?.handoffReady ?? out?.handoffReady);
    const buildOk = out?.shipOutcome?.buildOk ?? out?.buildOk;
    const blockers = out?.shipOutcome?.blockers ?? out?.shipBlockers ?? [];
    const kind = out?.shipOutcome?.scaffoldKind ?? out?.scaffoldKind ?? 'unknown';
    byKind[kind] = (byKind[kind] || 0) + 1;

    let ship = '—';
    if (fully) {
      shipped += 1;
      ship = 'shipped';
    } else if (hand) {
      handoff += 1;
      ship = 'handoff';
    } else if (buildOk === false || run.status === 'error') {
      failed += 1;
      ship = 'failed';
    } else if (blockers.length) {
      blocked += 1;
      ship = 'blocked';
    } else if (run.status === 'complete') {
      blocked += 1;
      ship = 'incomplete';
    }

    recent.push({
      id: run.id,
      prompt: run.prompt.slice(0, 80),
      status: run.status,
      ship,
      scaffoldKind: kind === 'unknown' ? undefined : kind,
      created_at: run.created_at,
    });
  }

  res.json({
    totals: {
      runs: runs.length,
      shipped,
      handoff,
      blocked,
      failed,
    },
    byKind,
    recent: recent.slice(0, 20),
  });
});

router.get('/summary', async (req: AuthRequest, res) => {
  const userId = req.userId!;

  let planTier = 'spark';
  let planName = 'Basic';
  let planPrice = `$${MONTHLY_USER_PRICE_USD}/month`;
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
        planPrice = plan ? `${plan.priceLabel}/month` : `$${MONTHLY_USER_PRICE_USD}/month`;
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

  const usage = await getUsage(userId);
  const tokens = usageToDashboardTokens(usage);
  const effectiveTier = usage.planTier || planTier;
  const tokensIncluded = getTokenPool(effectiveTier);

  res.json({
    now: new Date().toISOString(),
    tokens,
    xrg: {
      totalXrg: 0,
      availableXrg: 0,
      vestedXrg: 0,
      tokenBoostTotal: 0,
      consistencyStreakMonths: 0,
      consistencyBonusPercent: 0,
    },
    billing: {
      planTier: effectiveTier,
      planName,
      planPrice,
      nextBilling,
      tokensIncluded,
      tokensUsed: tokens.totalUsed,
      tokensRemaining: tokens.totalRemaining,
      apiBudgetUsd: usage.planBudgetUsd || getApiBudgetUsd(effectiveTier),
      creditRemainingUsd: usage.creditRemainingUsd,
      spentUsd: usage.spentUsd,
      rolloverUsd: usage.rolloverUsd,
    },
    recentActivity,
    aiBackend: 'kimi-glm-deepseek-grok',
  });
});

router.post('/emergency-tokens', (_req, res) => {
  res.status(410).json({
    success: false,
    message: 'Emergency tokens are not available on the current AI plan.',
    code: 'NOT_SUPPORTED',
  });
});

export default router;
