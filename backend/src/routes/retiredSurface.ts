import { Router, type Request, type Response } from 'express';

/**
 * Shared retired-surface responses for legacy AI / token / community routes.
 * Cleared so the next AI backend can mount cleanly.
 */
export const RETIRED_AI_CODE = 'AI_BACKEND_RETIRED';
export const RETIRED_AI_MESSAGE =
  'Legacy AI backend (DeepSeek/Claude/Grok/Groq, token meters, swarm negotiation) has been removed. Awaiting the new AI backend.';

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
  router.all('*', (req: Request, res: Response) => {
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
