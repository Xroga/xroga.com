'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck, Settings2, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { api, type Notification as XrogaNotification } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';
import { notificationStatus, notificationTone } from '@/lib/notificationExperience';

const toneClass = { success: 'bg-emerald-400', warning: 'bg-amber-400', error: 'bg-rose-500', info: 'bg-sky-400' };

interface Props { open: boolean; onToggle: () => void; onClose: () => void; compact?: boolean; }

export function SidebarNotificationButton({ open, onToggle, compact = false }: Pick<Props, 'open' | 'onToggle' | 'compact'>) {
  const unread = useAppStore((s) => s.unreadCount);
  return <button type="button" onClick={onToggle} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={open} className={compact ? 'relative grid h-9 w-9 place-items-center rounded-lg text-[var(--foreground)] hover:bg-[var(--foreground)]/[.08]' : 'xv-sidebar-head-icon relative'} title="Notifications">
    <Bell className="h-4 w-4" aria-hidden="true" />
    {unread > 0 && <span className="absolute right-0 top-0 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-[var(--card)]" aria-hidden="true" />}
  </button>;
}

export function SidebarNotificationCenter({ open, onClose }: Pick<Props, 'open' | 'onClose'>) {
  const router = useRouter();
  const notifications = useAppStore((s) => s.notifications);
  const unread = useAppStore((s) => s.unreadCount);
  const [busy, setBusy] = useState(false);

  const openNotification = useCallback(async (n: XrogaNotification) => {
    if (!n.read) {
      try { await api.notifications.markRead(n.id); } catch { /* navigation still works */ }
      useAppStore.setState((state) => ({ notifications: state.notifications.map((item) => item.id === n.id ? { ...item, read: true } : item), unreadCount: Math.max(0, state.unreadCount - 1) }));
    }
    onClose();
    const link = typeof n.link === 'string' && n.link.startsWith('/') && !n.link.startsWith('//') ? n.link : '/workspace';
    router.push(link === '/dashboard' ? '/workspace' : link);
  }, [onClose, router]);

  async function markAllRead() {
    if (busy || unread === 0) return;
    setBusy(true);
    try {
      await api.notifications.markAllRead();
      useAppStore.setState((state) => ({ notifications: state.notifications.map((n) => ({ ...n, read: true })), unreadCount: 0 }));
    } finally { setBusy(false); }
  }

  if (!open) return null;
  return <section className="flex min-h-0 flex-1 flex-col text-[var(--foreground)]" aria-label="Notifications">
    <div className="flex items-center gap-2 border-b border-[var(--card-border)] px-3 py-3">
      <Bell className="h-4 w-4 text-sky-400" aria-hidden="true" />
      <h2 className="flex-1 text-sm font-semibold">Notifications</h2>
      {unread > 0 && <span className="rounded-full bg-rose-500/15 px-1.5 text-[10px] font-semibold text-rose-400">{unread}</span>}
      <button type="button" onClick={onClose} aria-label="Close notifications" className="rounded-md p-1 text-[var(--muted)] hover:bg-[var(--foreground)]/[.08]"><X className="h-4 w-4" /></button>
    </div>
    <div className="flex items-center justify-between border-b border-[var(--card-border)] px-3 py-2">
      <span className="text-[10px] uppercase tracking-[.12em] text-[var(--muted)]">Recent activity</span>
      <button type="button" onClick={() => void markAllRead()} disabled={busy || unread === 0} className="inline-flex items-center gap-1 text-[10px] text-sky-400 hover:underline disabled:opacity-40"><CheckCheck className="h-3 w-3" /> Mark all read</button>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto p-2">
      {notifications.length === 0 ? <div className="px-3 py-10 text-center text-xs text-[var(--muted)]">No notifications yet. Real task updates will appear here.</div> : notifications.map((n) => <button key={n.id} type="button" onClick={() => void openNotification(n)} className={`mb-1 flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2.5 text-left transition hover:bg-[var(--foreground)]/[.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${n.read ? '' : 'bg-[var(--foreground)]/[.045]'}`}>
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${toneClass[notificationTone(n)]}`} aria-hidden="true" />
        <span className="min-w-0 flex-1"><span className="block text-xs font-semibold leading-snug">{n.title}</span><span className="mt-1 block text-[11px] leading-relaxed text-[var(--muted)] line-clamp-3">{n.message}</span><span className="mt-1.5 flex gap-2 text-[10px] text-[var(--muted)]"><span>{notificationStatus(n)}</span><span>·</span><span>{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</span></span></span>
      </button>)}
    </div>
    <Link href="/settings?tab=notifications" onClick={onClose} className="flex items-center gap-2 border-t border-[var(--card-border)] px-3 py-3 text-xs text-[var(--muted)] hover:bg-[var(--foreground)]/[.05]"><Settings2 className="h-3.5 w-3.5" /> Notification settings</Link>
  </section>;
}
