import type { Request, Response, NextFunction } from 'express';
import { ensureUserRecords } from '../services/ensureUserRecords.js';
import { resolveIdentity } from '../lib/resolveIdentity.js';

export interface AuthRequest extends Request {
  userId?: string;
  accessToken?: string;
  userEmail?: string;
}

async function resolveUser(token: string): Promise<{ userId: string; email?: string }> {
  const identity = await resolveIdentity(token);
  return { userId: identity.userId, email: identity.email };
}

export async function verifyAccessToken(token: string): Promise<{ userId: string; email?: string }> {
  return resolveUser(token);
}

/**
 * Provision on demand rather than on every request.
 *
 * `ensureUserRecords` returns without touching Supabase once a user's rows are known
 * to exist, so calling it here is now cheap for all but a user's first request to this
 * instance. It stays awaited (not fire-and-forget) because routes immediately after
 * this middleware read the rows it creates, and it stays non-fatal because a
 * provisioning hiccup must not lock a signed-in user out of read-only surfaces.
 */
async function provisionIfNeeded(userId: string, email?: string): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    await ensureUserRecords(userId, email);
  } catch (provisionErr) {
    console.warn('[auth] ensureUserRecords failed (non-fatal):', (provisionErr as Error).message);
  }
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Missing authorization header. Sign in and retry.',
      code: 'NO_TOKEN',
    });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const { userId, email } = await resolveUser(token);
    req.userId = userId;
    req.accessToken = token;
    req.userEmail = email;

    await provisionIfNeeded(userId, email);

    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Authentication failed';
    console.error('[auth]', message);

    if (
      message.includes('SUPABASE_URL') ||
      message.includes('SUPABASE_SERVICE_ROLE_KEY') ||
      message.includes('SUPABASE_JWT_SECRET')
    ) {
      res.status(503).json({
        error: 'API auth not configured on Fly.io. Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.',
        code: 'AUTH_NOT_CONFIGURED',
      });
      return;
    }

    res.status(401).json({
      error: message,
      code: 'AUTH_FAILED',
    });
  }
}

/** Resolve a viewer for public routes when a bearer token is present. */
export async function optionalAuthMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    next();
    return;
  }
  if (!authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Invalid authorization header.', code: 'AUTH_FAILED' });
    return;
  }

  try {
    const token = authHeader.slice(7);
    const { userId, email } = await resolveUser(token);
    req.userId = userId;
    req.accessToken = token;
    req.userEmail = email;
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      await provisionIfNeeded(userId, email);
    }
    next();
  } catch {
    res.status(401).json({
      error: 'Your session is invalid or expired. Sign in again and retry.',
      code: 'AUTH_FAILED',
    });
  }
}
