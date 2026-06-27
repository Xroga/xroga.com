'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { api, type Notification } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const notifications = useAppStore((s) => s.notifications);
  const unreadCount = useAppStore((s) => s.unreadCount);
  const setNotifications = useAppStore((s) => s.setNotifications);
  const setUnreadCount = useAppStore((s) => s.setUnreadCount);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function handleMarkRead(n: Notification) {
    if (!n.read) {
      await api.notifications.markRead(n.id);
      setUnreadCount(Math.max(0, unreadCount - 1));
      setNotifications(notifications.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-white/5 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full ring-2 ring-[var(--card)]" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 rounded-xl border border-[var(--card-border)] bg-[var(--card)] shadow-xl z-[250] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--card-border)] flex items-center justify-between">
            <span className="font-medium text-sm">Notifications</span>
            {unreadCount > 0 && (
              <span className="text-xs text-violet-400">{unreadCount} unread</span>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="p-4 text-sm text-[var(--muted)] text-center">No notifications yet</p>
            ) : (
              notifications.slice(0, 5).map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleMarkRead(n)}
                  className={cn(
                    'w-full text-left px-4 py-3 border-b border-[var(--card-border)] hover:bg-white/5 transition-colors',
                    !n.read && 'bg-violet-500/5'
                  )}
                >
                  <p className="text-sm font-medium">{n.title}</p>
                  <p className="text-xs text-[var(--muted)] mt-0.5 line-clamp-2">{n.message}</p>
                  <p className="text-xs text-[var(--muted)] mt-1">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
