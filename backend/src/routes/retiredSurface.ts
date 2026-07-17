import { Router, type Request, type Response } from 'express';

/**
 * Shared retired-surface responses for legacy AI / token / community routes.
 */
export const RETIRED_AI_CODE = 'AI_BACKEND_RETIRED';
export const RETIRED_AI_MESSAGE =
  'This legacy surface has been retired. Use /api/phase1/chat and /api/swarm/execute for the new AI Swarm.';

export function retiredJson(res: Response, status = 410) {
  return res.status(status).json({
    error: RETIRED_AI_MESSAGE,
    code: RETIRED_AI_CODE,
    retired: true,
  });
}

/** Catch-all router that retires every method/path under a mount point. */
export function createRetiredRouter(surface: string): Router {
  const router = Router();
  // Use middleware (no path) — Express path-to-regexp rejects bare "*".
  router.use((req: Request, res: Response) => {
    res.status(410).json({
      error: RETIRED_AI_MESSAGE,
      code: RETIRED_AI_CODE,
      surface,
      path: req.path,
      retired: true,
    });
  });
  return router;
}
