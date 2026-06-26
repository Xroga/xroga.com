import type { Request, Response, NextFunction } from 'express';
import { getSupabaseAdmin } from '../config/supabase.js';
import { verifySupabaseAccessToken } from '../lib/verifyJwt.js';
import { ensureUserRecords } from '../services/ensureUserRecords.js';

export interface AuthRequest extends Request {
  userId?: string;
  accessToken?: string;
  userEmail?: string;
}

async function resolveUser(token: string): Promise<{ userId: string; email?: string }> {
  if (process.env.SUPABASE_URL) {
    try {
      const verified = await verifySupabaseAccessToken(token);
      return { userId: verified.userId, email: verified.email };
    } catch (jwksErr) {
      console.warn('[auth] JWKS verify failed:', (jwksErr as Error).message);
    }
  }

  const supabase = getSupabaseAdmin();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    throw new Error(error?.message ?? 'Invalid or expired token');
  }
  return { userId: user.id, email: user.email };
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header', code: 'NO_TOKEN' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const { userId, email } = await resolveUser(token);
    req.userId = userId;
    req.accessToken = token;
    req.userEmail = email;

    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      await ensureUserRecords(userId, email);
    }

    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Authentication failed';
    console.error('[auth]', message);

    if (message.includes('SUPABASE_URL') || message.includes('SUPABASE_SERVICE_ROLE_KEY')) {
      res.status(503).json({
        error: 'API auth not configured. Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY on Fly.io.',
        code: 'AUTH_NOT_CONFIGURED',
      });
      return;
    }

    if (message.toLowerCase().includes('expired') || message.toLowerCase().includes('invalid')) {
      res.status(401).json({ error: 'Session expired — sign out and sign in again.', code: 'TOKEN_INVALID' });
      return;
    }

    res.status(401).json({ error: message, code: 'AUTH_FAILED' });
  }
}
