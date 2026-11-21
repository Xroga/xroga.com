'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, BellOff, X } from 'lucide-react';
import { api, type Notification as XrogaNotification } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';
import { useWorkspaceIdentity } from '@/components/layout/WorkspaceIdentityContext';
import { showBuildBrowserNotification } from '@/lib/buildBrowserNotify';
import { refreshBrowserPushAccount, XROGA_PUSH_ENABLED_KEY } from '@/lib/browserPush';
import {
  NOTIFICATION_PREFERENCES_EVENT, NOTIFICATION_STACK_KEY, notificationPreference,
  notificationStatus, notificationTone, playNotificationChime, readSeenNotifications,
  rememberSeenNotifications, setNotificationPreference, primeNotificationAudio,
} from '@/lib/notificationExperience';
import { formatDistanceToNow } from 'date-fns';

const toneClass = { success: 'bg-emerald-400', warning: 'bg-amber-400', error: 'bg-rose-500', info: 'bg-sky-400' };

export function NotificationExperience() {
  const identity = useWorkspaceIdentity();
  const router = useRouter();
  const [alerts, setAlerts] = useState<XrogaNotification[]>([]);
  const [expanded, setExpanded] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const suppressClick = useRef(false);
  const [stackEnabled, setStackEnabled] = useState(false);
  const setNotifications = useAppStore((s) => s.setNotifications);
  const setUnreadCount = useAppStore((s) => s.setUnreadCount);

  useEffect(() => {
    const sync = () => { setStackEnabled(notificationPreference(NOTIFICATION_STACK_KEY)); };
    sync();
    window.addEventListener(NOTIFICATION_PREFERENCES_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener(NOTIFICATION_PREFERENCES_EVENT, sync); window.removeEventListener('storage', sync); };
  }, []);

  useEffect(() => {
    const prime = () => primeNotificationAudio();
    window.addEventListener('pointerdown', prime, { once: true });
    return () => window.removeEventListener('pointerdown', prime);
  }, []);

  useEffect(() => {
    if (identity.status !== 'authenticated' || !identity.userId) return;
    const userId = identity.userId;
    void refreshBrowserPushAccount().catch(() => { /* preserve in-app notifications */ });
    let disposed = false;
    let polling = false;
    async function poll() {
      if (polling) return;
      polling = true;
      try {
        const [list, count] = await Promise.all([api.notifications.list(), api.notifications.unreadCount()]);
        if (disposed) return;
        setNotifications(list);
        setUnreadCount(count.count);
        const seen = readSeenNotifications(userId);
        const fresh = list.filter((n) => !n.read && !seen.has(n.id)).slice(0, 6);
        if (fresh.length) {
          for (const n of fresh) seen.add(n.id);
          rememberSeenNotifications(userId, seen);
          // Old unread items stay in the inbox without replaying a stale popup or chime.
          const recent = fresh.filter((n) => Date.now() - Date.parse(n.created_at) < 120_000);
          if (recent.length && notificationPreference(NOTIFICATION_STACK_KEY)) {
            setAlerts((previous) => [...recent, ...previous].filter((n, index, all) => all.findIndex((item) => item.id === n.id) === index).slice(0, 6));
          }
          if (recent.some((n) => n.type === 'success')) {
            playNotificationChime();
          }
          if (document.visibilityState === 'hidden' && localStorage.getItem(XROGA_PUSH_ENABLED_KEY) !== '1') {
            // Native browser notifications are permission-gated and shown outside the page.
            for (const n of recent.slice(0, 2)) showBuildBrowserNotification({ title: n.title, body: n.message, tag: `xroga-notification-${n.id}` });
          }
        }
      } catch { /* preserve the last successful state while offline */ }
      finally { polling = false; }
    }
    void poll();
    const timer = window.setInterval(() => void poll(), 15000);
    const onFocus = () => void poll();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => { disposed = true; window.clearInterval(timer); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
  }, [identity.status, identity.userId, setNotifications, setUnreadCount]);

  const openAlert = useCallback(async (n: XrogaNotification) => {
    if (suppressClick.current) { suppressClick.current = false; return; }
    if (!n.read) {
      try { await api.notifications.markRead(n.id); } catch { /* keep navigating */ }
      useAppStore.setState((state) => ({
        notifications: state.notifications.map((item) => item.id === n.id ? { ...item, read: true } : item),
        unreadCount: Math.max(0, state.unreadCount - 1),
      }));
    }
    setAlerts((items) => items.filter((item) => item.id !== n.id));
    const link = typeof n.link === 'string' && n.link.startsWith('/') && !n.link.startsWith('//') ? n.link : '/workspace';
    router.push(link === '/dashboard' ? '/workspace' : link);
  }, [router]);

  if (!stackEnabled || alerts.length === 0) return null;
  return (
    <section className="fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] right-3 z-[180] w-[min(360px,calc(100vw-1.5rem))] text-[var(--foreground)] sm:right-4 sm:w-[min(360px,calc(100vw-2rem))]" aria-label="Recent notifications" onMouseEnter={() => setExpanded(true)} onMouseLeave={() => setExpanded(false)} onFocus={() => setExpanded(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setExpanded(false); }}>
      <div className="relative rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-2 shadow-[0_12px_36px_rgba(0,0,0,.22)] before:absolute before:inset-x-3 before:top-full before:h-2 before:rounded-b-xl before:border before:border-t-0 before:border-[var(--card-border)] before:bg-[var(--card)] after:absolute after:inset-x-6 after:top-[calc(100%+7px)] after:h-1.5 after:rounded-b-xl after:border after:border-t-0 after:border-[var(--card-border)] after:bg-[var(--card)]">
        <div className="relative z-10 flex items-center gap-2 px-2 py-1.5">
          <Bell className="h-4 w-4 text-[var(--muted)]" aria-hidden="true" />
          <button type="button" className="flex-1 text-left text-xs font-semibold focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{alerts.length} recent {alerts.length === 1 ? 'update' : 'updates'} <span className="sm:hidden">· {expanded ? 'Collapse' : 'Expand'}</span></button>
          <button type="button" className="rounded p-1 text-[var(--muted)] hover:bg-[var(--foreground)]/10" onClick={() => setAlerts([])} aria-label="Dismiss all notifications" title="Dismiss all"><X className="h-4 w-4" /></button>
        </div>
        <div className="relative z-10 max-h-[min(60dvh,420px)] space-y-1 overflow-y-auto overscroll-contain">
          {(expanded ? alerts : alerts.slice(0, 1)).map((n) => <button key={n.id} type="button" onClick={() => void openAlert(n)} onTouchStart={(event) => { touchStartX.current = event.touches[0]?.clientX ?? null; }} onTouchEnd={(event) => { if (touchStartX.current !== null && Math.abs((event.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current) > 72) { suppressClick.current = true; setAlerts((items) => items.filter((item) => item.id !== n.id)); window.setTimeout(() => { suppressClick.current = false; }, 350); } touchStartX.current = null; }} className="flex w-full touch-pan-y items-start gap-3 rounded-xl border border-[var(--card-border)] bg-[var(--foreground)]/[.025] px-3 py-2.5 text-left transition hover:bg-[var(--foreground)]/[.065] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 motion-reduce:transition-none">
            <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${toneClass[notificationTone(n)]}`} aria-hidden="true" />
            <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><span className="truncate text-xs font-semibold">{n.title}</span><span className="ml-auto shrink-0 text-[10px] text-[var(--muted)]">{notificationStatus(n)}</span></span><span className={`mt-0.5 block text-[11px] leading-relaxed text-[var(--muted)] ${expanded ? 'line-clamp-2' : 'truncate'}`}>{n.message}</span><span className="mt-1 block text-[10px] text-[var(--muted)]">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</span></span>
          </button>)}
        </div>
        {expanded && <button type="button" onClick={() => { setNotificationPreference(NOTIFICATION_STACK_KEY, false); setAlerts([]); }} className="relative z-10 mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] text-[var(--muted)] hover:bg-[var(--foreground)]/[.06]"><BellOff className="h-3 w-3" /> Don&apos;t show pop-ups again</button>}
      </div>
    </section>
  );
}
