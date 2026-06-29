import type { Response, NextFunction } from 'express';
import { getSupabaseAdmin } from '../config/supabase.js';
import type { AuthRequest } from './auth.js';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? 'ceo@xroga.com,admin@xroga.com')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

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

    if (profile?.role === 'admin') {
      next();
      return;
    }

    const { data: user } = await supabase.auth.admin.getUserById(req.userId);
    const email = user?.user?.email?.toLowerCase();
    if (email && ADMIN_EMAILS.includes(email)) {
      next();
      return;
    }
  } catch {
    /* fall through */
  }

  res.status(403).json({ error: 'Admin access required' });
}
