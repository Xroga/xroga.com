import type {
  NextFunction,
  Response,
} from 'express';

import {
  authMiddleware,
  type AuthRequest,
} from './auth.js';

/**
 * Phase 1 uses the same authenticated Xroga identity
 * boundary as the rest of the production API.
 *
 * Browser/body/header supplied user IDs are never accepted
 * as authentication.
 */
export async function phase1AuthMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  return authMiddleware(
    req,
    res,
    next,
  );
}
