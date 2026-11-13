import { api } from '@/lib/api';

export const XROGA_PUSH_ENABLED_KEY = 'xroga_browser_push_enabled';
const workerPath = '/xroga-notifications-sw.js';

export function browserPushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator &&
    'PushManager' in window && 'Notification' in window;
}

function decodeVapidKey(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.padEnd(Math.ceil(value.length / 4) * 4, '=');
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

export async function hasBrowserPushSubscription(): Promise<boolean> {
  if (!browserPushSupported() || Notification.permission !== 'granted' || localStorage.getItem(XROGA_PUSH_ENABLED_KEY) !== '1') return false;
  const registration = await navigator.serviceWorker.getRegistration('/');
  return Boolean(await registration?.pushManager.getSubscription());
}

/** Rebinds an already-consented device to the current authenticated account. */
export async function refreshBrowserPushAccount(): Promise<void> {
  if (!browserPushSupported() || localStorage.getItem(XROGA_PUSH_ENABLED_KEY) !== '1') return;
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) { localStorage.setItem(XROGA_PUSH_ENABLED_KEY, '0'); return; }
  try {
    await api.notifications.subscribePush(subscription.toJSON());
  } catch (error) {
    localStorage.setItem(XROGA_PUSH_ENABLED_KEY, '0');
    throw error;
  }
}

/** Must be called from a user gesture; no browser permission prompt on page load. */
export async function enableBrowserPush(): Promise<boolean> {
  if (!browserPushSupported()) return false;
  // Request while the click/tap activation is still live, before any network await.
  const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
  if (permission !== 'granted') return false;
  const { publicKey } = await api.notifications.pushKey();
  const registration = await navigator.serviceWorker.register(workerPath, { scope: '/' });
  const ready = await navigator.serviceWorker.ready;
  const subscription = await (await registration.pushManager.getSubscription()) ?? await ready.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodeVapidKey(publicKey),
  });
  try {
    await api.notifications.subscribePush(subscription.toJSON());
  } catch (error) {
    await subscription.unsubscribe();
    throw error;
  }
  localStorage.setItem(XROGA_PUSH_ENABLED_KEY, '1');
  return true;
}

export async function disableBrowserPush(): Promise<void> {
  if (!browserPushSupported()) { localStorage.setItem(XROGA_PUSH_ENABLED_KEY, '0'); return; }
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await api.notifications.unsubscribePush(subscription.endpoint);
    await subscription.unsubscribe();
  }
  localStorage.setItem(XROGA_PUSH_ENABLED_KEY, '0');
}
