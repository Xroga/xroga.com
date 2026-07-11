'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Bell, Download, Copy, Share2, Trash2, ExternalLink } from 'lucide-react';
import { api, type Notification } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { resumeToDashboard } from '@/lib/workspacePersistence';
import { hasPendingVideoJobs } from '@/lib/pendingVideoJobs';
import toast from 'react-hot-toast';

interface NotificationBellProps {
  className?: string;
  /** sidebar = compact icon in left nav */
  variant?: 'header' | 'sidebar';
}

function videoMeta(n: Notification) {
  const m = (n.metadata ?? {}) as Record<string, unknown>;
  return {
    kind: m.kind as string | undefined,
    assistantMessageId: m.assistantMessageId as string | undefined,
    streamingUrl: m.streamingUrl as string | undefined,
    title: m.title as string | undefined,
    prompt: m.prompt as string | undefined,
  };
}

export function NotificationBell({ className, variant = 'header' }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const notifications = useAppStore((s) => s.notifications);
  const unreadCount = useAppStore((s) => s.unreadCount);
  const setNotifications = useAppStore((s) => s.setNotifications);
  const setUnreadCount = useAppStore((s) => s.setUnreadCount);

  async function refreshNotifications() {
    try {
      const [count, list] = await Promise.all([
        api.notifications.unreadCount(),
        api.notifications.list(),
      ]);
      setUnreadCount(count.count);
      setNotifications(list.slice(0, 10));
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    void refreshNotifications();
    const fast = hasPendingVideoJobs() ? 15000 : 30000;
    const id = setInterval(() => {
      void refreshNotifications();
    }, fast);
    return () => clearInterval(id);
  }, []);

  async function handleMarkRead(n: Notification) {
    if (!n.read) {
      await api.notifications.markRead(n.id);
      setUnreadCount(Math.max(0, unreadCount - 1));
      setNotifications(notifications.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    }
  }

  function jumpToVideo(assistantMessageId: string) {
    resumeToDashboard({
      selectedId: assistantMessageId,
      selectedLabel: 'Your video',
      source: 'dashboard',
      jumpMessageId: assistantMessageId,
    });
    setOpen(false);
    if (pathname !== '/dashboard') {
      router.push('/dashboard');
    }
    window.dispatchEvent(new CustomEvent('xroga-resume-workspace'));
  }

  async function handleOpen(n: Notification) {
    await handleMarkRead(n);
    const meta = videoMeta(n);
    if (meta.assistantMessageId && (meta.kind === 'video_ready' || meta.kind === 'video_failed')) {
      jumpToVideo(meta.assistantMessageId);
      return;
    }
    if (meta.kind === 'build_ready' || meta.kind === 'build_failed') {
      setOpen(false);
      toast.success(n.title, { duration: 6000 });
      if (pathname !== '/dashboard') {
        router.push('/dashboard');
      }
      window.dispatchEvent(new CustomEvent('xroga-resume-workspace'));
      return;
    }
    if (n.link) {
      router.push(n.link);
      setOpen(false);
    }
  }

  async function handleDelete(e: React.MouseEvent, n: Notification) {
    e.stopPropagation();
    await api.notifications.delete(n.id);
    setNotifications(notifications.filter((x) => x.id !== n.id));
    if (!n.read) setUnreadCount(Math.max(0, unreadCount - 1));
    toast.success('Notification removed');
  }

  function handleDownload(e: React.MouseEvent, url: string, title: string) {
    e.stopPropagation();
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.slice(0, 30) || 'xroga-video'}.mp4`;
    a.click();
    toast.success('Download started');
  }

  async function handleCopy(e: React.MouseEvent, url: string) {
    e.stopPropagation();
    await navigator.clipboard.writeText(url);
    toast.success('Link copied');
  }

  async function handleShare(e: React.MouseEvent, n: Notification) {
    e.stopPropagation();
    const meta = videoMeta(n);
    const url = meta.streamingUrl ?? n.link ?? window.location.origin;
    if (navigator.share) {
      await navigator.share({ title: n.title, text: n.message, url });
    } else {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied to share');
    }
  }

  const showDot = unreadCount > 0 || hasPendingVideoJobs();

  return (
    <div className={cn('relative', className)} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'relative rounded-lg hover:bg-white/5 transition-colors',
          variant === 'sidebar' ? 'p-2.5 w-full flex items-center gap-2 text-sm' : 'p-2'
        )}
        aria-label="Notifications"
      >
        <Bell className={cn('shrink-0', variant === 'sidebar' ? 'w-4 h-4' : 'w-5 h-5')} />
        {variant === 'sidebar' && <span className="flex-1 text-left">Notifications</span>}
        {showDot && (
          <span
            className={cn(
              'bg-red-500 rounded-full ring-2 ring-[var(--card)]',
              variant === 'sidebar' ? 'w-2 h-2' : 'absolute top-1 right-1 w-2 h-2'
            )}
          />
        )}
        {variant === 'sidebar' && unreadCount > 0 && (
          <span className="text-[10px] font-bold text-red-400">{unreadCount}</span>
        )}
      </button>

      {open && (
        <div
          className={cn(
            'rounded-xl border border-[var(--card-border)] bg-[var(--card)] shadow-xl z-[250] overflow-hidden',
            variant === 'sidebar'
              ? 'fixed left-[4.5rem] bottom-24 w-[min(22rem,calc(100vw-2rem))] sm:left-56'
              : 'absolute right-0 mt-2 w-[min(22rem,calc(100vw-2rem))]'
          )}
        >
          <div className="px-4 py-3 border-b border-[var(--card-border)] flex items-center justify-between">
            <span className="font-medium text-sm">Notifications</span>
            {unreadCount > 0 && (
              <button
                type="button"
                className="text-[10px] text-violet-400 hover:underline"
                onClick={async () => {
                  await api.notifications.markAllRead();
                  setUnreadCount(0);
                  setNotifications(notifications.map((n) => ({ ...n, read: true })));
                }}
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="p-4 text-sm text-[var(--muted)] text-center">No notifications yet</p>
            ) : (
              notifications.map((n) => {
                const meta = videoMeta(n);
                const isVideo = meta.kind === 'video_ready' && meta.streamingUrl;
                return (
                  <div
                    key={n.id}
                    className={cn(
                      'border-b border-[var(--card-border)]',
                      !n.read && 'bg-violet-500/5'
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => handleOpen(n)}
                      className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium">{n.title}</p>
                        {!n.read && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 mt-1.5" />}
                      </div>
                      <p className="text-xs text-[var(--muted)] mt-0.5 line-clamp-2">{n.message}</p>
                      <p className="text-[10px] text-[var(--muted)] mt-1 flex items-center gap-1">
                        <ExternalLink className="h-3 w-3" />
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                        {meta.assistantMessageId ? ' · Tap to open in terminal' : ''}
                      </p>
                    </button>
                    {isVideo && (
                      <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => handleDownload(e, meta.streamingUrl!, meta.title ?? 'video')}
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--card-border)] px-2 py-1 text-[10px] hover:bg-white/5"
                        >
                          <Download className="h-3 w-3" /> Download
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleCopy(e, meta.streamingUrl!)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--card-border)] px-2 py-1 text-[10px] hover:bg-white/5"
                        >
                          <Copy className="h-3 w-3" /> Copy
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleShare(e, n)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--card-border)] px-2 py-1 text-[10px] hover:bg-white/5"
                        >
                          <Share2 className="h-3 w-3" /> Share
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDelete(e, n)}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 px-2 py-1 text-[10px] text-red-400 hover:bg-red-500/10"
                        >
                          <Trash2 className="h-3 w-3" /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
