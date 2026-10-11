import type { Response, NextFunction } from 'express';
import { getSupabaseAdmin } from '../config/supabase.js';
import type { AuthRequest } from './auth.js';

export function canReadAdminOperations(role: unknown): boolean {
  return role === 'admin' || role === 'owner';
}

export async function adminMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, id')
      .eq('id', req.userId)
      .maybeSingle();

    if (canReadAdminOperations(profile?.role)) {
      next();
      return;
    }
  } catch {
    /* fall through */
  }

  res.status(403).json({ error: 'Admin access required' });
}
