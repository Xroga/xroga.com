import type { Request, Response, NextFunction } from 'express';
import { getSupabaseAdmin } from '../config/supabase.js';
import { verifySupabaseAccessToken } from '../lib/verifyJwt.js';

export interface AuthRequest extends Request {
  userId?: string;
  accessToken?: string;
}

async function resolveUserId(token: string): Promise<string> {
  // Primary: JWKS verify — only needs SUPABASE_URL
  if (process.env.SUPABASE_URL) {
    try {
      const verified = await verifySupabaseAccessToken(token);
      return verified.userId;
    } catch (jwksErr) {
      console.warn('[auth] JWKS verify failed:', (jwksErr as Error).message);
    }
  }

  // Fallback: Supabase admin API
  const supabase = getSupabaseAdmin();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    throw new Error(error?.message ?? 'Invalid or expired token');
  }
  return user.id;
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    req.userId = await resolveUserId(token);
    req.accessToken = token;
    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Authentication failed';
    console.error('[auth]', message);

    if (message.includes('SUPABASE_URL') || message.includes('SUPABASE_SERVICE_ROLE_KEY')) {
      res.status(503).json({
        error: 'API auth not configured. Set SUPABASE_URL on Fly.io (same project as Vercel).',
        code: 'AUTH_NOT_CONFIGURED',
      });
      return;
    }

    if (message.toLowerCase().includes('expired') || message.toLowerCase().includes('invalid')) {
      res.status(401).json({ error: message, code: 'TOKEN_INVALID' });
      return;
    }

    res.status(401).json({ error: message, code: 'AUTH_FAILED' });
  }
}
