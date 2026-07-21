import { Router } from 'express';
import { getSupabaseAdmin } from '../config/supabase.js';
import type { AuthRequest } from '../middleware/auth.js';
import { computePlatformReady } from '../lib/platformReady.js';

const router = Router();

router.get('/platform-ready', (_req, res) => {
  res.json(computePlatformReady());
});

router.get('/errors', async (req: AuthRequest, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 200);
  const api = req.query.api ? String(req.query.api) : undefined;
  const severity = req.query.severity ? String(req.query.severity) : undefined;

  try {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('system_errors')
      .select('id, timestamp, api, error_message, fallback_used, severity, user_id, run_id, metadata')
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (api) query = query.ilike('api', `%${api}%`);
    if (severity) query = query.eq('severity', severity);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ errors: data ?? [], count: data?.length ?? 0 });
  } catch {
    res.json({ errors: [], count: 0 });
  }
});

router.get('/deployments', async (req: AuthRequest, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('deployment_status')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    res.json({ deployments: data ?? [] });
  } catch {
    res.json({ deployments: [] });
  }
});

export default router;
