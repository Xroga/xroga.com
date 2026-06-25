import type { Request, Response, NextFunction } from 'express';
import { getSupabaseAdmin } from '../config/supabase.js';

export interface AuthRequest extends Request {
  userId?: string;
  accessToken?: string;
}

/**
 * Validates Supabase JWT using the service role client (no SUPABASE_ANON_KEY required on server).
 */
export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const supabase = getSupabaseAdmin();
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({ error: error?.message ?? 'Invalid or expired token' });
      return;
    }

    req.userId = user.id;
    req.accessToken = token;
    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Authentication failed';
    console.error('[auth]', message);

    if (message.includes('SUPABASE_URL') || message.includes('SUPABASE_SERVICE_ROLE_KEY')) {
      res.status(503).json({
        error: 'Server auth not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on Fly.io.',
      });
      return;
    }

    res.status(401).json({ error: 'Authentication failed' });
  }
}
