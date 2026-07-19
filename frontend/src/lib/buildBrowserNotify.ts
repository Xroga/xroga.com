/** Browser notifications for build completion (works when user returns to the app). */

export const BROWSER_NOTIFY_PROJECT_READY_KEY = 'xroga_browser_notify_project_ready';

export function browserProjectNotifyEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  // Default on once permission granted; Settings can force off with "0"
  const pref = localStorage.getItem(BROWSER_NOTIFY_PROJECT_READY_KEY);
  if (pref === '0') return false;
  return true;
}

export async function requestBuildNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    const result = await Notification.requestPermission();
    return result === 'granted';
  } catch {
    return false;
  }
}

export function showBuildBrowserNotification(opts: {
  title: string;
  body: string;
  tag?: string;
}) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (!browserProjectNotifyEnabled()) return;
  if (Notification.permission !== 'granted') return;
  try {
    const notification = new Notification(opts.title, {
      body: opts.body,
      tag: opts.tag ?? 'xroga-build',
      icon: '/favicon-32.png',
      requireInteraction: true,
      silent: false,
    });
    notification.onclick = () => {
      window.focus();
      if (window.location.pathname !== '/workspace') {
        window.location.href = '/workspace';
      }
      notification.close();
    };
  } catch {
    /* ignore */
  }
}
