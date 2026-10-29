import engineeringOperatorRouter from './engineeringOperator.js';
import { Router } from 'express';
import { getGlobalSupabaseAdmin } from '../security/serviceRoleGuard.js';
import type { AuthRequest } from '../middleware/auth.js';
import { computePlatformReady } from '../lib/platformReady.js';
import { redactOperationsValue } from '../operations/operationsEngine.js';

const router = Router();

// Operator-only engineering diagnostics and per-tenant caps. This router is mounted behind authMiddleware and adminMiddleware, so they are inherited.
router.use('/engineering', engineeringOperatorRouter);

function boundedLimit(value: unknown, fallback: number, maximum: number): number | null {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const limit = Number(value);
  return Number.isSafeInteger(limit) ? Math.min(limit, maximum) : null;
}

router.get('/platform-ready', (_req, res) => {
  res.json(computePlatformReady());
});

router.get('/errors', async (req: AuthRequest, res) => {
  const limit = boundedLimit(req.query.limit, 100, 200);
  const api = req.query.api;
  const severity = req.query.severity;
  if (limit === null || (api !== undefined && (typeof api !== 'string' || api.length > 100)) ||
      (severity !== undefined && (typeof severity !== 'string' || !['info', 'warning', 'error', 'critical'].includes(severity)))) {
    res.status(400).json({ error: 'Invalid log query' }); return;
  }

  try {
    const supabase = getGlobalSupabaseAdmin('authorized_platform_errors');
    let query = supabase
      .from('system_errors')
      .select('id, timestamp, api, error_message, fallback_used, severity')
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (api) query = query.ilike('api', `%${api}%`);
    if (severity) query = query.eq('severity', severity);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ errors: redactOperationsValue(data ?? []), count: data?.length ?? 0 });
  } catch {
    res.status(503).json({ error: 'System error records unavailable' });
  }
});

router.get('/deployments', async (req: AuthRequest, res) => {
  const limit = boundedLimit(req.query.limit, 50, 100);
  if (limit === null) { res.status(400).json({ error: 'Invalid deployment query' }); return; }
  try {
    const supabase = getGlobalSupabaseAdmin('authorized_deployment_history');
    const { data, error } = await supabase
      .from('deployment_status')
      .select('id, user_id, run_id, target, status, method, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    res.json({ deployments: redactOperationsValue(data ?? []) });
  } catch {
    res.status(503).json({ error: 'Deployment records unavailable' });
  }
});

export default router;
