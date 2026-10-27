import { Router, type Request, type Response } from 'express';

import { getStorageService } from '../storage/runtime.js';
import type { ReconcileReport } from '../storage/storageService.js';
import { verifyBusinessAutomationSchedulerToken } from './businessAutomationScheduler.js';

/**
 * Scheduled Xroga Drive housekeeping: expire stale reservations, clean abandoned uploads, finish interrupted deletions and re-verify
 * objects left UPLOADING. Without a schedule, bytes reserved by abandoned uploads stay reserved until an operator runs the script.
 *
 * Same authentication as the Cloud Scheduler automation tick: a Google-signed ID token for one named service account and audience.
 * Off unless XROGA_STORAGE_RECONCILE_MODE=cloud. The response carries counts only, never an object, tenant or key.
 */
export interface StorageReconcileDeps {
  readonly drive: () => { reconcile(options: { limit?: number; scanOrphans?: boolean }): Promise<ReconcileReport> } | null;
  readonly verify: typeof verifyBusinessAutomationSchedulerToken;
  readonly env: NodeJS.ProcessEnv;
}

export function createStorageReconcileRouter(deps: StorageReconcileDeps = { drive: getStorageService, verify: verifyBusinessAutomationSchedulerToken, env: process.env }): Router {
  const router = Router();
  router.post('/reconcile', async (req: Request, res: Response) => {
    if (deps.env.XROGA_STORAGE_RECONCILE_MODE !== 'cloud') return res.status(503).json({ error: 'Scheduled storage reconciliation is not enabled.' });
    const authorized = await deps.verify(req.get('authorization'), {
      audience: deps.env.XROGA_STORAGE_RECONCILE_AUDIENCE?.trim() ?? '',
      serviceAccountEmail: deps.env.XROGA_STORAGE_RECONCILE_SERVICE_ACCOUNT?.trim() ?? '',
    });
    if (!authorized) return res.status(401).json({ error: 'Unauthorized.' });
    const drive = deps.drive();
    if (!drive) return res.status(503).json({ error: 'Xroga Drive is not configured.' });
    try {
      // Bounded per call; the scheduler calls again. Orphan scanning lists the whole bucket, so it stays an operator action.
      const report = await drive.reconcile({ limit: 200, scanOrphans: false });
      return res.json({
        expiredReservations: report.expiredReservations,
        abandonedCleaned: report.abandonedCleaned,
        reverified: report.reverified,
        deletionsFinished: report.deletionsFinished,
        missingObjects: report.missingObjects.length,
        usageDrift: report.usageDrift.length,
        errors: report.errors.length,
      });
    } catch (error) {
      console.warn('[storage] Scheduled reconcile failed:', error instanceof Error ? error.message : 'unknown');
      return res.status(503).json({ error: 'Storage reconciliation could not be completed.' });
    }
  });
  return router;
}

export default createStorageReconcileRouter();
