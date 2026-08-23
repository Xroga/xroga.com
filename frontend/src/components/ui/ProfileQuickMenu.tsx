'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  ChevronRight,
  MessageCircleHeart,
  Palette,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
} from 'lucide-react';
import { FeedbackModal } from '@/components/feedback/FeedbackModal';
import { LogoutButton } from '@/components/ui/Uiverse';
import { useAppStore } from '@/store/useAppStore';
import { communityApi } from '@/lib/community';

/**
 * The account items come first.
 *
 * This menu opened off the profile row but carried none of the things a profile menu
 * is opened for — the plan, the account, settings — so reaching any of them meant
 * leaving the sidebar and hunting for them elsewhere.
 */
const ITEMS = [
  {
    key: 'plan',
    label: 'Upgrade plan',
    desc: 'Compare plans and change your subscription',
    icon: Sparkles,
    href: '/pricing',
  },
  {
    key: 'profile',
    label: 'Profile',
    desc: 'Your name, avatar, and account details',
    icon: UserRound,
    href: '/settings?tab=profile',
  },
  {
    key: 'personalization',
    label: 'Personalization',
    desc: 'Theme, terminal skin, and the companion',
    icon: Palette,
    href: '/settings?tab=companion',
  },
  {
    key: 'settings',
    label: 'Settings',
    desc: 'Account, workspace, and preferences',
    icon: Settings,
    href: '/settings',
  },
  {
    key: 'community',
    label: 'Community',
    desc: 'Share ideas, questions, and working solutions',
    icon: Users,
    href: '/community',
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
  const [communityOpenCount, setCommunityOpenCount] = useState<number | null>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const role = useAppStore((state) => state.profile?.role);
  const canManageCommunity = role === 'moderator' || role === 'admin' || role === 'owner';

  useEffect(() => {
    if (!canManageCommunity) { setCommunityOpenCount(null); return; }
    void communityApi.summary().then((value) => setCommunityOpenCount(typeof value.open === 'number' ? value.open : null)).catch(() => setCommunityOpenCount(null));
  }, [canManageCommunity]);

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
        aria-label="Account menu"
        title="Account menu"
        aria-expanded={open}
      >
        {/* A chevron, not a wand: this opens the account menu, and the icon should
            say so rather than suggest an effect. */}
        <ChevronRight className="w-4 h-4" />
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
                  Account
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
                {canManageCommunity && (
                  <div className="border-t border-[var(--card-border)]/50 p-1.5">
                    <button type="button" onClick={() => { setOpen(false); router.push('/admin/community'); }} className="flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-[var(--accent)]/10">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
                      <div className="min-w-0 flex-1"><p className="flex items-center justify-between gap-2 text-xs font-semibold"><span>Admin Dashboard</span>{communityOpenCount !== null && <span className="rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[9px] text-white" aria-label={`${communityOpenCount} open community posts`}>{communityOpenCount}</span>}</p><p className="text-[10px] text-[var(--muted)]">Manage community and official replies</p></div>
                    </button>
                  </div>
                )}
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
