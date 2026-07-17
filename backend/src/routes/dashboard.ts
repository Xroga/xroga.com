import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { GALACTIC_PLANS, planDisplayName } from '../config/galacticPlans.js';

const router = Router();

/**
 * Dashboard summary without legacy token/XRG/provider usage meters.
 * Cleared for the next AI backend.
 */
router.get('/summary', async (req: AuthRequest, res) => {
  const userId = req.userId!;

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

  res.json({
    now: new Date().toISOString(),
    tokens: null,
    xrg: null,
    billing: {
      planTier,
      planName,
      planPrice,
      nextBilling,
    },
    recentActivity,
    legacyAiRetired: true,
  });
});

router.post('/emergency-tokens', (_req, res) => {
  res.status(410).json({
    success: false,
    message: 'Emergency tokens and legacy token pools have been removed.',
    code: 'AI_BACKEND_RETIRED',
    retired: true,
  });
});

export default router;
