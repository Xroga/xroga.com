import { Router } from 'express';
import { getSupabaseAdmin } from '../config/supabase.js';
import { isQueueSystemReady } from '../config/jobQueues.js';
import { computePlatformReady } from '../lib/platformReady.js';
import type { AuthRequest } from '../middleware/auth.js';
import { evaluateReadiness, safeConfigurationStatus, type ReadinessCheck } from '../operations/productionOperations.js';

const router = Router();

function currentChecks(): ReadinessCheck[] {
  const platform = computePlatformReady();
  const configured = new Map(safeConfigurationStatus([
    'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'FRONTEND_URL',
  ]).map((item) => [item.key, item.configured]));
  return [
    {
      id: 'platform_configuration', required: true,
      status: platform.ready ? 'verified' : 'blocked',
      blocker: platform.ready ? undefined : `${platform.requiredTotal - platform.requiredOk} required configuration checks are missing`,
    },
    {
      id: 'database_configuration', required: true,
      status: configured.get('SUPABASE_URL') && configured.get('SUPABASE_SERVICE_ROLE_KEY') ? 'verified' : 'blocked',
      blocker: 'database credentials are not configured',
    },
    {
      id: 'queue_runtime', required: false,
      status: isQueueSystemReady() ? 'verified' : 'unknown',
      blocker: 'queue provider is not configured',
    },
    {
      id: 'production_deployment', required: true, status: 'unknown',
      blocker: 'no current deployment evidence has been loaded',
    },
  ];
}

router.get('/readiness', async (_req, res) => {
  const checks = currentChecks();
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('production_evidence')
      .select('id, kind, status, summary, reference, observed_at')
      .order('observed_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    const deployment = data?.find((item) => item.kind === 'deployment_verification');
    if (deployment) {
      const index = checks.findIndex((check) => check.id === 'production_deployment');
      checks[index] = {
        id: 'production_deployment', required: true,
        status: deployment.status,
        evidenceId: deployment.id,
        blocker: deployment.status === 'verified' ? undefined : deployment.summary,
      };
    }
    res.json({ readiness: evaluateReadiness(checks), evidence: data ?? [] });
  } catch {
    res.status(503).json({
      readiness: evaluateReadiness(checks),
      evidence: [],
      blocker: 'Operational evidence store is unavailable or its migration is not applied',
    });
  }
});

router.get('/releases', async (_req, res) => {
  try {
    const { data, error } = await getSupabaseAdmin().from('production_releases')
      .select('id, commit_sha, artifact_digest, environment, state, created_at')
      .order('created_at', { ascending: false }).limit(20);
    if (error) throw error;
    res.json({ releases: data ?? [] });
  } catch {
    res.status(503).json({ error: 'Release store unavailable', code: 'OPERATIONS_STORE_UNAVAILABLE' });
  }
});

router.post('/audit', async (req: AuthRequest, res) => {
  const { action, targetType, targetId, outcome } = req.body as Record<string, unknown>;
  if (![action, targetType, outcome].every((value) => typeof value === 'string' && value.length > 0 && value.length <= 100)) {
    res.status(400).json({ error: 'Invalid audit event' }); return;
  }
  const { error } = await getSupabaseAdmin().from('production_audit_log').insert({
    actor_id: req.userId, action, target_type: targetType, target_id: typeof targetId === 'string' ? targetId.slice(0, 200) : null,
    outcome, metadata: {},
  });
  if (error) { res.status(503).json({ error: 'Audit store unavailable' }); return; }
  res.status(201).json({ recorded: true });
});

export default router;
