import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import {
  OperatorError, clearTenantLimit, getEngineeringDiagnostics, listTenantLimits, setTenantLimit,
} from '../ai/engineeringOperator.js';

/**
 * Operator-only engineering routes. Mounted under the admin router, which is itself behind authMiddleware and the database admin/owner middleware, so
 * none of this is reachable by an ordinary user or a guessed URL. Responses are counts, ages and identifiers only.
 */
export interface EngineeringOperatorDeps {
  readonly diagnostics: typeof getEngineeringDiagnostics;
  readonly list: typeof listTenantLimits;
  readonly set: typeof setTenantLimit;
  readonly clear: typeof clearTenantLimit;
  readonly audit: (event: string, detail: Record<string, unknown>) => void;
}

const defaults: EngineeringOperatorDeps = {
  diagnostics: getEngineeringDiagnostics, list: listTenantLimits, set: setTenantLimit, clear: clearTenantLimit,
  audit: (event, detail) => console.info(`[engineering-operator] ${event}`, JSON.stringify(detail)),
};

export function createEngineeringOperatorRouter(deps: EngineeringOperatorDeps = defaults): Router {
  const router = Router();
  const fail = (res: import('express').Response, error: unknown) => {
    if (error instanceof OperatorError && error.code === 'INVALID') { res.status(400).json({ error: error.message }); return; }
    // anything else, including a database error, is reported without its text
    res.status(503).json({ error: 'Engineering records unavailable' });
  };

  router.get('/diagnostics', async (_req, res) => {
    try { res.json(await deps.diagnostics()); } catch (error) { fail(res, error); }
  });

  router.get('/limits/:userId', async (req, res) => {
    try { res.json({ limits: await deps.list(req.params.userId) }); } catch (error) { fail(res, error); }
  });

  router.put('/limits/:userId/:category', async (req: AuthRequest, res) => {
    try {
      const body = (req.body ?? {}) as { cap?: unknown };
      await deps.set(req.params.userId, req.params.category, body.cap);
      deps.audit('limit.set', { actor: req.userId ?? null, user: req.params.userId, category: req.params.category, cap: body.cap });
      res.json({ ok: true });
    } catch (error) { fail(res, error); }
  });

  router.delete('/limits/:userId/:category', async (req: AuthRequest, res) => {
    try {
      const state = await deps.clear(req.params.userId, req.params.category);
      deps.audit('limit.clear', { actor: req.userId ?? null, user: req.params.userId, category: req.params.category, state });
      res.json({ ok: true, state });
    } catch (error) { fail(res, error); }
  });

  return router;
}

export default createEngineeringOperatorRouter();
