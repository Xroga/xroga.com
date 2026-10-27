import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { executeBrowserRun, type ExecuteOutcome } from '../workers/browserCapability.js';
import { verifyBusinessAutomationSchedulerToken } from './businessAutomationScheduler.js';
import { productionBrowserRuntime, type BrowserRunRuntime } from './browserRuns.js';

/**
 * Internal endpoints that make a browser run durable across instances. Both are called by Google Cloud, never by a browser:
 *
 *   POST /execute  { runId }  Cloud Tasks delivers a dispatched run here. The request stays open until the run ends, so Cloud Run keeps
 *                             CPU allocated for exactly as long as the browser works, and the queue owns the retry and the deadline.
 *   POST /recover              Cloud Scheduler calls it every minute or two. Runs that are queued or running and untouched for a while
 *                             are dispatched again; the run's execution lease makes a duplicate harmless.
 *
 * Authentication is the same Google-signed ID token check as the automation tick, with a service account and audience PER endpoint, so
 * the scheduler's identity cannot execute a run and the queue's identity cannot trigger a sweep. Off unless
 * XROGA_BROWSER_INTERNAL_MODE=cloud. Responses carry run ids and counts only, never a goal, a URL, a tenant or evidence.
 */
export interface BrowserInternalDeps {
  readonly runtime: () => BrowserRunRuntime | null;
  readonly verify: typeof verifyBusinessAutomationSchedulerToken;
  readonly env: NodeJS.ProcessEnv;
}

/** How long a queued or running run may sit untouched before the sweep dispatches it again. */
const RECOVER_STALE_MS = 2 * 60_000;
const RECOVER_BATCH = 20;
const bodySchema = z.object({ runId: z.string().uuid() }).strict();

export function createBrowserRunInternalRouter(deps: BrowserInternalDeps = { runtime: productionBrowserRuntime, verify: verifyBusinessAutomationSchedulerToken, env: process.env }): Router {
  const router = Router();
  const authorised = (req: Request, which: 'EXECUTE' | 'RECOVER') => deps.verify(req.get('authorization'), {
    audience: deps.env[`XROGA_BROWSER_${which}_AUDIENCE`]?.trim() ?? '',
    serviceAccountEmail: deps.env[`XROGA_BROWSER_${which}_SERVICE_ACCOUNT`]?.trim() ?? '',
  });
  const gate = async (req: Request, res: Response, which: 'EXECUTE' | 'RECOVER'): Promise<BrowserRunRuntime | null> => {
    if (deps.env.XROGA_BROWSER_INTERNAL_MODE !== 'cloud') { res.status(503).json({ error: 'Scheduled browser execution is not enabled.' }); return null; }
    if (!(await authorised(req, which))) { res.status(401).json({ error: 'Unauthorized.' }); return null; }
    const runtime = deps.runtime();
    if (!runtime) { res.status(503).json({ error: 'Browser automation is not configured.' }); return null; }
    return runtime;
  };

  router.post('/execute', async (req: Request, res: Response) => {
    const runtime = await gate(req, res, 'EXECUTE');
    if (!runtime) return;
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid request.' });
    try {
      const outcome: ExecuteOutcome = await executeBrowserRun(parsed.data.runId, runtime);
      // 200 for every outcome that needs no retry (finished, already finished, someone else is on it, unknown run): the queue must
      // not retry those. A held run is picked up by the recovery sweep if its holder dies.
      return res.json({ outcome });
    } catch (error) {
      console.warn('[browser] execute failed:', parsed.data.runId, error instanceof Error ? error.message : 'unknown');
      // 503 asks the queue to retry; the run's own state decides whether there is anything left to do
      return res.status(503).json({ error: 'The run could not be executed.' });
    }
  });

  router.post('/recover', async (req: Request, res: Response) => {
    const runtime = await gate(req, res, 'RECOVER');
    if (!runtime) return;
    try {
      const stale = await runtime.runs.listRecoverable(RECOVER_STALE_MS, RECOVER_BATCH);
      let dispatched = 0; let failed = 0;
      for (const record of stale) {
        try { await runtime.dispatcher.dispatch(record.runId); await runtime.runs.markDispatched(record.runId); dispatched += 1; } catch { failed += 1; }
      }
      return res.json({ candidates: stale.length, dispatched, failed });
    } catch (error) {
      console.warn('[browser] recovery sweep failed:', error instanceof Error ? error.message : 'unknown');
      return res.status(503).json({ error: 'The recovery sweep could not be completed.' });
    }
  });
  return router;
}

export default createBrowserRunInternalRouter();
