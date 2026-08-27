'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { AnimatedIcon } from '@/components/icons/animated/AnimatedIcon';
import { SlidersHorizontalIcon } from '@/components/icons/animated/SlidersHorizontalIcon';
import { PaletteIcon } from '@/components/icons/animated/PaletteIcon';
import { CogIcon } from '@/components/icons/animated/CogIcon';
import { AtomIcon } from '@/components/icons/animated/AtomIcon';
import { UserRoundPenIcon } from '@/components/icons/animated/UserRoundPenIcon';
import { UsersRoundIcon } from '@/components/icons/animated/UsersRoundIcon';
import { SmileIcon } from '@/components/icons/animated/SmileIcon';
import { UserStarIcon } from '@/components/icons/animated/UserStarIcon';
import { ShieldCheckIcon } from '@/components/icons/animated/ShieldCheckIcon';
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
    animated: AtomIcon,
    href: '/pricing',
  },
  {
    key: 'profile',
    label: 'Profile',
    desc: 'Your name, avatar, and account details',
    animated: UserRoundPenIcon,
    href: '/settings?tab=profile',
  },
  {
    key: 'personalization',
    label: 'Personalization',
    desc: 'Theme, terminal skin, and the companion',
    animated: PaletteIcon,
    href: '/settings?tab=companion',
  },
  {
    key: 'settings',
    label: 'Settings',
    desc: 'Account, workspace, and preferences',
    animated: CogIcon,
    href: '/settings',
  },
  {
    key: 'community',
    label: 'Community',
    desc: 'Share ideas, questions, and working solutions',
    animated: UsersRoundIcon,
    href: '/community',
  },
  {
    key: 'feedback',
    label: 'Feedback',
    desc: 'Share your Xroga experience',
    animated: SmileIcon,
    action: 'feedback' as const,
  },
  {
    key: 'about',
    label: 'Xroga AI & CEO',
    desc: 'Our story and mission',
    animated: UserStarIcon,
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
        {/* Sliders, not a chevron: a chevron points somewhere and this opens a panel
            of controls in place. It was a wand before that, which suggested an effect
            rather than a menu. The tracks slide apart when it is opened or hovered,
            which is the picture of a panel of controls being reached for. */}
        <AnimatedIcon icon={SlidersHorizontalIcon} />
      </button>

      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[298]" onClick={() => setOpen(false)} aria-hidden />
            <div
              ref={menuRef}
              id="xv-profile-quick-menu"
              className="fixed z-[300] w-[min(296px,calc(100vw-32px))] animate-in fade-in slide-in-from-bottom-2 duration-200"
              style={{ top: pos.top, left: pos.left }}
            >
              {/* The card carries its edge with a shadow and a hairline ring rather than
                  a drawn border: at 272px with a plain border and a flat shadow it read
                  as a dropdown from a decade ago. */}
              <div className="xv-pqm-card rounded-[18px] border border-[var(--card-border)]/70 bg-[var(--card)] backdrop-blur-xl overflow-visible">
                <p className="text-[9px] uppercase tracking-[0.14em] text-[var(--muted)] px-3.5 pt-3 pb-1.5 font-semibold">
                  Account
                </p>
                <ul className="p-1.5 space-y-0.5">
                  {ITEMS.map((item) => {
                    /* Every row is animated now — there is no static branch left to
                       fall back to, and keeping one invites the next icon to land in it
                       and quietly not move. */
                    const Animated = item.animated;
                    return (
                      <li key={item.key}>
                        <button
                          type="button"
                          onClick={() => handleItem(item)}
                          className="xv-pqm-row w-full flex items-center gap-3 px-2.5 py-2 rounded-[13px] text-left transition-colors"
                        >
                          {/* The glyph sits on its own tinted tile. Loose against the
                              text it left the labels starting at four different optical
                              positions as the icons changed width. */}
                          {/* Each one draws its own motion — the atom's shells turn, the
                              palette inks its dots in, the star is awarded — so they are
                              components rather than lucide glyphs and take no
                              `strokeWidth`. `intro={false}`: the menu is a popover, and
                              seven icons playing the moment it opens is a flinch. */}
                          <span className="xv-pqm-tile grid h-7 w-7 shrink-0 place-items-center rounded-[9px]">
                            <AnimatedIcon icon={Animated} size={15} intro={false} />
                          </span>
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
                      <span className="mt-0.5 shrink-0 text-[var(--accent)]"><AnimatedIcon icon={ShieldCheckIcon} size={16} intro={false} /></span>
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
