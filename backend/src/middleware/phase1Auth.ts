import type { Response, NextFunction } from 'express';
import { authMiddleware, type AuthRequest } from './auth.js';

/**
 * Phase 1 optional auth — uses Bearer token when present,
 * otherwise allows userId in body/header for development.
 */
export async function phase1AuthMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authMiddleware(req, res, next);
  }
  next();
}
