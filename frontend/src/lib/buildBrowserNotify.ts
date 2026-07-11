/** Browser notifications for build completion (works when user returns to the app). */

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
  if (Notification.permission !== 'granted') return;
  try {
    const notification = new Notification(opts.title, {
      body: opts.body,
      tag: opts.tag ?? 'xroga-build',
      icon: '/icon.png',
      requireInteraction: true,
      silent: false,
    });
    notification.onclick = () => {
      window.focus();
      if (window.location.pathname !== '/dashboard') {
        window.location.href = '/dashboard';
      }
      notification.close();
    };
  } catch {
    /* ignore */
  }
}
