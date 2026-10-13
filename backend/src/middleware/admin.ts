import type { Response, NextFunction } from 'express';
import { getTenantSupabaseAdmin } from '../security/serviceRoleGuard.js';
import { requireTenantContext, type TenantContext } from '../security/tenantContext.js';
import type { AuthRequest } from './auth.js';

export function canReadAdminOperations(role: unknown): boolean {
  return role === 'admin' || role === 'owner';
}

export async function adminMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  let scope: TenantContext;
  try { scope = requireTenantContext(req.tenantContext); }
  catch {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const supabase = getTenantSupabaseAdmin(scope);
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, id')
      .eq('id', scope.userId)
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
