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
  if (!process.env.SUPABASE_URL) {
    throw new Error('SUPABASE_URL must be set on Fly.io');
  }

  if (!token || token.length < 20) {
    throw new Error('Invalid or expired token');
  }

  // Primary: verify via Supabase Admin (most reliable when service role key is set)
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const supabase = getSupabaseAdmin();
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (!error && user) {
      return { userId: user.id, email: user.email };
    }
    if (error) {
      console.warn('[auth] supabase.auth.getUser failed:', error.message);
    }
  }

  // Fallback: local JWT verification (HS256 secret or JWKS)
  try {
    const verified = await verifySupabaseAccessToken(token);
    return { userId: verified.userId, email: verified.email };
  } catch (jwksErr) {
    console.warn('[auth] JWT verify failed:', (jwksErr as Error).message);
  }

  throw new Error(
    'Invalid or expired token. Sign out and sign in again to refresh your session.'
  );
}

export async function verifyAccessToken(token: string): Promise<{ userId: string; email?: string }> {
  return resolveUser(token);
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

    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        await ensureUserRecords(userId, email);
      } catch (provisionErr) {
        console.warn('[auth] ensureUserRecords failed (non-fatal):', (provisionErr as Error).message);
      }
    }

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
