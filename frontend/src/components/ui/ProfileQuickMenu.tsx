'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { WandSparkles, Users, MessageCircleHeart, Sparkles } from 'lucide-react';
import { FeedbackModal } from '@/components/feedback/FeedbackModal';
import { LogoutButton } from '@/components/ui/Uiverse';

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

const MENU_WIDTH = 272;
const VIEWPORT_PAD = 16;

interface ProfileQuickMenuProps {
  onLogout?: () => void;
  anchorRef?: React.RefObject<HTMLElement | null>;
}

export function ProfileQuickMenu({ onLogout, anchorRef }: ProfileQuickMenuProps) {
  const [open, setOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useLayoutEffect(() => {
    if (!open) return;

    function placeMenu() {
      const trigger = anchorRef?.current?.getBoundingClientRect() ?? btnRef.current?.getBoundingClientRect();
      const menu = menuRef.current;
      if (!trigger || !menu) return;

      const menuW = menu.offsetWidth || MENU_WIDTH;
      const menuH = menu.offsetHeight || 300;
      const gap = 12;

      let left = trigger.left;
      let top = trigger.top - menuH - gap;

      if (top < VIEWPORT_PAD) {
        top = trigger.bottom + gap;
      }

      if (left + menuW > window.innerWidth - VIEWPORT_PAD) {
        left = window.innerWidth - menuW - VIEWPORT_PAD;
      }
      left = Math.max(VIEWPORT_PAD, left);

      top = Math.max(VIEWPORT_PAD, Math.min(top, window.innerHeight - menuH - VIEWPORT_PAD));

      setPos({ top, left });
    }

    placeMenu();
    window.addEventListener('resize', placeMenu);
    return () => window.removeEventListener('resize', placeMenu);
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
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

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(!open)}
        className="xv-profile-quick-trigger p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors shrink-0"
        aria-label="Quick links"
        title="Quick links"
        aria-expanded={open}
      >
        <WandSparkles className="w-4 h-4" />
      </button>

      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[298]" onClick={() => setOpen(false)} aria-hidden />
            <div
              ref={menuRef}
              id="xv-profile-quick-menu"
              className="fixed z-[300] w-[min(272px,calc(100vw-32px))] animate-in fade-in slide-in-from-bottom-2 duration-200"
              style={{ top: pos.top, left: pos.left }}
            >
              <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card)] backdrop-blur-xl shadow-2xl overflow-visible">
                <p className="text-[9px] uppercase tracking-widest text-[var(--muted)] px-3 pt-2.5 pb-1 font-semibold">
                  Quick links
                </p>
                <ul className="p-1.5 space-y-0.5">
                  {ITEMS.map((item) => {
                    const Icon = item.icon;
                    return (
                      <li key={item.key}>
                        <button
                          type="button"
                          onClick={() => handleItem(item)}
                          className="w-full flex items-start gap-2.5 px-2.5 py-2 rounded-xl text-left hover:bg-[var(--accent)]/10 transition-all"
                        >
                          <Icon className="w-4 h-4 shrink-0 mt-0.5 text-[var(--accent)]" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold leading-snug">{item.label}</p>
                            <p className="text-[10px] text-[var(--muted)] leading-snug">{item.desc}</p>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {onLogout && (
                  <div className="p-2.5 border-t border-[var(--card-border)]/50">
                    <LogoutButton onClick={() => { setOpen(false); onLogout(); }} />
                  </div>
                )}
              </div>
            </div>
          </>,
          document.body
        )}

      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </>
  );
}
