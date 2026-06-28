'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronsUpDown, Users, MessageCircleHeart, Sparkles, LogOut } from 'lucide-react';
import { FeedbackModal } from '@/components/feedback/FeedbackModal';
import { cn } from '@/lib/utils';

const ITEMS = [
  {
    key: 'community',
    label: 'Community',
    desc: 'Discover builder creations — coming soon',
    icon: Users,
    href: '/dashboard/community',
  },
  {
    key: 'feedback',
    label: 'Feedback',
    desc: 'Share your Xroga experience',
    icon: MessageCircleHeart,
    action: 'feedback' as const,
  },
  {
    key: 'about',
    label: 'Xroga AI & CEO',
    desc: 'Our story and mission',
    icon: Sparkles,
    href: '/about',
  },
];

interface ProfileQuickMenuProps {
  onLogout?: () => void;
}

export function ProfileQuickMenu({ onLogout }: ProfileQuickMenuProps) {
  const [open, setOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const btnRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setHighlight((h) => (h + 1) % ITEMS.length), 2800);
    return () => clearInterval(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      const pop = document.getElementById('xv-profile-quick-menu');
      if (pop?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function handleItem(item: (typeof ITEMS)[number]) {
    setOpen(false);
    if (item.action === 'feedback') {
      setFeedbackOpen(true);
      return;
    }
    if (item.href) router.push(item.href);
  }

  function handleLogout() {
    setOpen(false);
    onLogout?.();
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(!open)}
        className="xv-profile-quick-trigger p-1 rounded-md text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors shrink-0"
        aria-label="Quick links"
        title="Community, Feedback, About"
      >
        <ChevronsUpDown className="w-4 h-4" />
      </button>

      {open && (
        <div
          id="xv-profile-quick-menu"
          className="fixed z-[300] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(300px,calc(100vw-32px))] animate-in fade-in zoom-in-95 duration-200"
        >
          <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)]/98 backdrop-blur-xl shadow-2xl overflow-hidden">
            <p className="text-[9px] uppercase tracking-widest text-[var(--muted)] px-4 pt-3 pb-1 font-semibold">
              Quick links
            </p>
            <ul className="p-2 space-y-0.5">
              {ITEMS.map((item, i) => {
                const Icon = item.icon;
                const active = i === highlight;
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => handleItem(item)}
                      className={cn(
                        'w-full flex items-start gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all',
                        active
                          ? 'bg-[var(--accent)]/15 ring-1 ring-[var(--accent)]/30'
                          : 'hover:bg-white/5'
                      )}
                    >
                      <Icon className={cn('w-4 h-4 shrink-0 mt-0.5', active ? 'text-[var(--accent)]' : 'text-[var(--muted)]')} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{item.label}</p>
                        <p className="text-[11px] text-[var(--muted)]">{item.desc}</p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
            {onLogout && (
              <div className="p-2 pt-0 border-t border-[var(--card-border)]/50">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="xv-sidebar-logout-menu w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {open && (
        <div
          className="fixed inset-0 z-[299] bg-black/40 backdrop-blur-[2px]"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </>
  );
}
