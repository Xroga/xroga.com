import { Router } from 'express';
import { getTenantSupabaseAdmin } from '../security/serviceRoleGuard.js';
import { requireTenantContext } from '../security/tenantContext.js';
import type { AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use((req: AuthRequest, res, next) => {
  try { req.userId = requireTenantContext(req.tenantContext).userId; next(); }
  catch { res.status(401).json({ error: 'Sign in again and retry.' }); }
});

router.get('/', async (req: AuthRequest, res) => {
  const supabase = getTenantSupabaseAdmin(requireTenantContext(req.tenantContext));
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', req.userId!)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    res.status(503).json({ error: 'Notifications could not be loaded. Retry shortly.' });
    return;
  }
  res.json(data);
});

router.get('/unread-count', async (req: AuthRequest, res) => {
  const supabase = getTenantSupabaseAdmin(requireTenantContext(req.tenantContext));
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', req.userId!)
    .eq('read', false);

  if (error) {
    res.status(503).json({ error: 'Notifications could not be loaded. Retry shortly.' });
    return;
  }
  res.json({ count: count ?? 0 });
});

router.patch('/:id/read', async (req: AuthRequest, res) => {
  const supabase = getTenantSupabaseAdmin(requireTenantContext(req.tenantContext));
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', String(req.params.id))
    .eq('user_id', req.userId!);

  if (error) {
    res.status(503).json({ error: 'Notifications could not be updated. Retry shortly.' });
    return;
  }
  res.json({ success: true });
});

router.patch('/read-all', async (req: AuthRequest, res) => {
  const supabase = getTenantSupabaseAdmin(requireTenantContext(req.tenantContext));
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', req.userId!)
    .eq('read', false);

  if (error) {
    res.status(503).json({ error: 'Notifications could not be updated. Retry shortly.' });
    return;
  }
  res.json({ success: true });
});

router.delete('/:id', async (req: AuthRequest, res) => {
  const supabase = getTenantSupabaseAdmin(requireTenantContext(req.tenantContext));
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', String(req.params.id))
    .eq('user_id', req.userId!);

  if (error) {
    res.status(503).json({ error: 'Notification could not be removed. Retry shortly.' });
    return;
  }
  res.json({ success: true });
});

export default router;
