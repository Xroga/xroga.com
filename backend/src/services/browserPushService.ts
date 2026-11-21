import webPush from 'web-push';
import { getTenantSupabaseAdmin } from '../security/serviceRoleGuard.js';
import { requireTenantContext, type TenantContext } from '../security/tenantContext.js';

export interface BrowserPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

const allowedPushHosts = new Set([
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com',
]);

export function validBrowserPushSubscription(value: unknown): value is BrowserPushSubscription {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<BrowserPushSubscription>;
  if (typeof candidate.endpoint !== 'string' || candidate.endpoint.length < 32 || candidate.endpoint.length > 2048) return false;
  if (!candidate.keys || typeof candidate.keys.p256dh !== 'string' || typeof candidate.keys.auth !== 'string') return false;
  if (!/^[A-Za-z0-9_-]{40,256}$/.test(candidate.keys.p256dh) || !/^[A-Za-z0-9_-]{8,256}$/.test(candidate.keys.auth)) return false;
  try {
    const url = new URL(candidate.endpoint);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      (allowedPushHosts.has(url.hostname) || /^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname));
  } catch { return false; }
}

export function browserPushPublicKey(): string | null {
  return process.env.XROGA_VAPID_PUBLIC_KEY || null;
}

function configureWebPush(): boolean {
  const publicKey = browserPushPublicKey();
  const privateKey = process.env.XROGA_VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webPush.setVapidDetails('mailto:support@xroga.com', publicKey, privateKey);
  return true;
}

export async function sendBrowserPush(context: TenantContext, notification: {
  id: string;
  type: string;
  link?: string;
}): Promise<void> {
  if (!configureWebPush()) return;
  const { userId } = requireTenantContext(context);
  const supabase = getTenantSupabaseAdmin(context);
  const { data, error } = await supabase.from('notification_push_subscriptions')
    .select('endpoint,p256dh,auth_secret').eq('user_id', userId).limit(10);
  if (error) {
    console.warn('[BrowserPush] subscriptions unavailable');
    return;
  }
  const link = notification.link?.startsWith('/') && !notification.link.startsWith('//') ? notification.link : '/workspace';
  // No task text or private metadata is sent to the OS lock screen.
  const payload = JSON.stringify({
    id: notification.id,
    title: notification.type === 'error' ? 'Xroga task needs attention' : 'Your Xroga task has an update',
    body: 'Open Xroga to see the details.',
    link,
  });
  await Promise.all((data ?? []).map(async (row) => {
    if (!validBrowserPushSubscription({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth_secret } })) return;
    try {
      await webPush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth_secret } }, payload, { TTL: 3600, urgency: 'normal', timeout: 5000 });
    } catch (cause) {
      const status = typeof cause === 'object' && cause !== null && 'statusCode' in cause ? Number(cause.statusCode) : 0;
      if (status === 404 || status === 410) {
        await supabase.from('notification_push_subscriptions').delete().eq('endpoint', row.endpoint).eq('user_id', userId);
      } else {
        console.warn('[BrowserPush] delivery failed', status || 'network');
      }
    }
  }));
}
