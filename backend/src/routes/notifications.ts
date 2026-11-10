import { Router } from 'express';
import { getTenantSupabaseAdmin } from '../security/serviceRoleGuard.js';
import { requireTenantContext } from '../security/tenantContext.js';
import type { AuthRequest } from '../middleware/auth.js';
import { browserPushPublicKey, validBrowserPushSubscription } from '../services/browserPushService.js';

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

router.get('/push-key', (_req: AuthRequest, res) => {
  const publicKey = browserPushPublicKey();
  if (!publicKey || !process.env.XROGA_VAPID_PRIVATE_KEY) {
    res.status(503).json({ error: 'Push notifications are not configured yet.' });
    return;
  }
  res.json({ publicKey });
});

router.post('/push-subscription', async (req: AuthRequest, res) => {
  if (!browserPushPublicKey() || !process.env.XROGA_VAPID_PRIVATE_KEY) {
    res.status(503).json({ error: 'Push notifications are not configured yet.' });
    return;
  }
  if (!validBrowserPushSubscription(req.body)) {
    res.status(400).json({ error: 'This browser returned an unsupported push subscription.' });
    return;
  }
  const supabase = getTenantSupabaseAdmin(requireTenantContext(req.tenantContext));
  const { data: existing, error: lookupError } = await supabase.from('notification_push_subscriptions')
    .select('endpoint').eq('user_id', req.userId!).limit(11);
  if (lookupError) {
    res.status(503).json({ error: 'Push subscriptions could not be checked.' });
    return;
  }
  if ((existing?.length ?? 0) >= 10 && !existing?.some((item) => item.endpoint === req.body.endpoint)) {
    res.status(429).json({ error: 'This account has reached its device notification limit.' });
    return;
  }
  const owned = existing?.some((item) => item.endpoint === req.body.endpoint) ?? false;
  const values = {
    p256dh: req.body.keys.p256dh,
    auth_secret: req.body.keys.auth,
    updated_at: new Date().toISOString(),
  };
  const { error } = owned
    ? await supabase.from('notification_push_subscriptions').update(values)
      .eq('endpoint', req.body.endpoint).eq('user_id', req.userId!)
    : await supabase.from('notification_push_subscriptions').insert({
      endpoint: req.body.endpoint,
      user_id: req.userId!,
      ...values,
    });
  if (error) {
    res.status(503).json({ error: 'Push subscription could not be saved.' });
    return;
  }
  res.json({ subscribed: true });
});

router.delete('/push-subscription', async (req: AuthRequest, res) => {
  const endpoint = req.body?.endpoint;
  if (typeof endpoint !== 'string' || endpoint.length > 2048) {
    res.status(400).json({ error: 'A valid subscription endpoint is required.' });
    return;
  }
  const supabase = getTenantSupabaseAdmin(requireTenantContext(req.tenantContext));
  const { error } = await supabase.from('notification_push_subscriptions').delete()
    .eq('endpoint', endpoint).eq('user_id', req.userId!);
  if (error) {
    res.status(503).json({ error: 'Push subscription could not be removed.' });
    return;
  }
  res.json({ subscribed: false });
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
