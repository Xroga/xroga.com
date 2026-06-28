'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, Users, MessageCircleHeart, Sparkles } from 'lucide-react';
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
  anchorRef?: React.RefObject<HTMLElement | null>;
}

export function ProfileQuickMenu({ anchorRef }: ProfileQuickMenuProps) {
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

  function getPosition() {
    const el = anchorRef?.current ?? btnRef.current;
    if (!el) return { left: 80, bottom: 120 };
    const r = el.getBoundingClientRect();
    return {
      left: r.left + r.width / 2,
      bottom: window.innerHeight - r.top + 8,
    };
  }

  const pos = open ? getPosition() : { left: 0, bottom: 0 };

  function handleItem(item: (typeof ITEMS)[number]) {
    setOpen(false);
    if (item.action === 'feedback') {
      setFeedbackOpen(true);
      return;
    }
    if (item.href) router.push(item.href);
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(!open)}
        className="xv-profile-quick-trigger p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-white/5 transition-colors shrink-0"
        aria-label="More options"
        title="Community, Feedback, About"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {open && (
        <div
          id="xv-profile-quick-menu"
          className="fixed z-[300] w-[min(220px,calc(100vw-24px))] -translate-x-1/2 animate-in fade-in slide-in-from-bottom-2 duration-200"
          style={{ left: pos.left, bottom: pos.bottom }}
        >
          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)]/98 backdrop-blur-xl shadow-2xl overflow-hidden">
            <p className="text-[9px] uppercase tracking-widest text-[var(--muted)] px-3 pt-2.5 pb-1 font-semibold">
              Quick links
            </p>
            <ul className="p-1.5 space-y-0.5">
              {ITEMS.map((item, i) => {
                const Icon = item.icon;
                const active = i === highlight;
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => handleItem(item)}
                      className={cn(
                        'w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all',
                        active
                          ? 'bg-[var(--accent)]/15 ring-1 ring-[var(--accent)]/30'
                          : 'hover:bg-white/5'
                      )}
                    >
                      <Icon className={cn('w-4 h-4 shrink-0 mt-0.5', active ? 'text-[var(--accent)]' : 'text-[var(--muted)]')} />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold">{item.label}</p>
                        <p className="text-[10px] text-[var(--muted)] line-clamp-1">{item.desc}</p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </>
  );
}
