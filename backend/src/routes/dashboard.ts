import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { getProviderEntitlementStatus } from '../ai/providerBudget.js';
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

  const entitlement = await getProviderEntitlementStatus(userId).catch(() => ({
    state: 'billing_unavailable' as const,
    pacing: null,
    startsAt: null,
    endsAt: null,
    nextUnlockAt: null,
    capacityRemainingPercent: null,
    availableNowPercent: null,
    promotionActivationDeadline: '2026-08-31T00:00:00.000Z',
    requiresCard: false,
    autoChargesAtPromotionEnd: false,
  }));
  const promotion = entitlement.state.startsWith('promotional_') || entitlement.state === 'billing_unavailable';

  res.json({
    now: new Date().toISOString(),
    billing: {
      planTier: promotion ? 'unpaid' : 'spark',
      planName: promotion ? 'Launch Promotion' : 'Xroga AI',
      planPrice: promotion ? '$0 for 30 days' : '$19 per 30 days',
      nextBilling: entitlement.endsAt,
    },
    entitlement,
    recentActivity,
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
