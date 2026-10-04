'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { AnimatedIcon, type AnimatedIconComponent } from '@/components/icons/animated/AnimatedIcon';
import { AtomIcon } from '@/components/icons/animated/AtomIcon';
import { LogoutIcon } from '@/components/icons/animated/LogoutIcon';
import { SlidersHorizontalIcon } from '@/components/icons/animated/SlidersHorizontalIcon';
import { PaletteIcon } from '@/components/icons/animated/PaletteIcon';
import { CogIcon } from '@/components/icons/animated/CogIcon';
import { UserRoundPenIcon } from '@/components/icons/animated/UserRoundPenIcon';
import { UsersRoundIcon } from '@/components/icons/animated/UsersRoundIcon';
import { SmileIcon } from '@/components/icons/animated/SmileIcon';
import { UserStarIcon } from '@/components/icons/animated/UserStarIcon';
import { FileTextIcon } from '@/components/icons/animated/FileTextIcon';
import { LightbulbIcon } from '@/components/icons/animated/LightbulbIcon';
import { GlobeLockIcon } from '@/components/icons/animated/GlobeLockIcon';
import { FeedbackModal } from '@/components/feedback/FeedbackModal';
import { createClient } from '@/lib/supabase/client';

type MenuItem = {
  key: string;
  label: string;
  desc: string;
  animated: AnimatedIconComponent;
  href?: string;
  action?: 'feedback';
};

const GROUPS: Array<{
  key: 'account' | 'discover' | 'company';
  label: string;
  desc: string;
  animated: AnimatedIconComponent;
  items: MenuItem[];
}> = [
  {
    key: 'account', label: 'Account', desc: 'Profile and preferences', animated: UserRoundPenIcon,
    items: [
      { key: 'profile', label: 'Profile', desc: 'Name, avatar, and account details', animated: UserRoundPenIcon, href: '/settings?tab=profile' },
      { key: 'personalization', label: 'Personalization', desc: 'Theme, terminal skin, and companion', animated: PaletteIcon, href: '/settings?tab=personalization' },
      { key: 'settings', label: 'Settings', desc: 'Workspace and account preferences', animated: CogIcon, href: '/settings' },
    ],
  },
  {
    key: 'discover', label: 'Discover', desc: 'Community and product updates', animated: UsersRoundIcon,
    items: [
      { key: 'community', label: 'Community', desc: 'Ideas, questions, and solutions', animated: UsersRoundIcon, href: '/community' },
      { key: 'feedback', label: 'Feedback', desc: 'Share your Xroga experience', animated: SmileIcon, action: 'feedback' },
      { key: 'blog', label: 'Blog', desc: 'Product updates, guides, and ideas', animated: FileTextIcon, href: '/blog' },
    ],
  },
  {
    key: 'company', label: 'Xroga', desc: 'Company, help, and privacy', animated: UserStarIcon,
    items: [
      { key: 'about', label: 'Xroga AI & CEO', desc: 'Our story and mission', animated: UserStarIcon, href: '/about' },
      { key: 'help', label: 'Help', desc: 'Documentation and answers', animated: LightbulbIcon, href: '/docs' },
      { key: 'privacy', label: 'Privacy', desc: 'How Xroga handles your information', animated: GlobeLockIcon, href: '/privacy' },
    ],
  },
];

const MENU_WIDTH = 244;
const SUBMENU_WIDTH = 254;
const VIEWPORT_PAD = 12;

interface ProfileQuickMenuProps {
  onLogout?: () => void;
  anchorRef?: React.RefObject<HTMLElement | null>;
  children?: ReactNode;
  triggerClassName?: string;
  displayName?: string;
  email?: string;
}

export function ProfileQuickMenu({ onLogout, anchorRef, children, triggerClassName, displayName, email }: ProfileQuickMenuProps) {
  const [open, setOpen] = useState(false);
  const [activeGroup, setActiveGroup] = useState<(typeof GROUPS)[number]['key'] | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [provider, setProvider] = useState('Xroga');
  const [pos, setPos] = useState({ top: 0, left: 0, submenuSide: 'right' as 'left' | 'right' });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuCloseTimer = useRef<number | null>(null);
  const router = useRouter();

  function cancelSubmenuClose() {
    if (submenuCloseTimer.current) window.clearTimeout(submenuCloseTimer.current);
    submenuCloseTimer.current = null;
  }

  function scheduleSubmenuClose() {
    cancelSubmenuClose();
    submenuCloseTimer.current = window.setTimeout(() => setActiveGroup(null), 180);
  }

  useEffect(() => {
    if (!open || provider !== 'Xroga') return;
    let live = true;
    void createClient().auth.getUser().then(({ data }) => {
      if (!live) return;
      const value = data.user?.app_metadata?.provider;
      if (typeof value === 'string' && value.trim()) {
        setProvider(value === 'github' ? 'GitHub' : value[0]!.toUpperCase() + value.slice(1));
      }
    }).catch(() => undefined);
    return () => { live = false; };
  }, [open, provider]);

  useEffect(() => () => {
    if (submenuCloseTimer.current) window.clearTimeout(submenuCloseTimer.current);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    function placeMenu() {
      const trigger = anchorRef?.current?.getBoundingClientRect() ?? btnRef.current?.getBoundingClientRect();
      const menu = menuRef.current;
      if (!trigger || !menu) return;
      const menuW = menu.offsetWidth || MENU_WIDTH;
      const menuH = menu.offsetHeight || 300;
      const gap = 10;
      let left = trigger.right + gap;
      let submenuSide: 'left' | 'right' = 'right';
      if (left + menuW + SUBMENU_WIDTH + gap > window.innerWidth - VIEWPORT_PAD) {
        left = trigger.left - menuW - gap;
        submenuSide = 'left';
      }
      if (window.innerWidth < 700) {
        left = Math.max(VIEWPORT_PAD, Math.min(trigger.left, window.innerWidth - menuW - VIEWPORT_PAD));
        submenuSide = 'left';
      }
      const top = Math.max(VIEWPORT_PAD, Math.min(trigger.bottom - menuH, window.innerHeight - menuH - VIEWPORT_PAD));
      setPos({ top, left: Math.max(VIEWPORT_PAD, left), submenuSide });
    }
    placeMenu();
    window.addEventListener('resize', placeMenu);
    return () => window.removeEventListener('resize', placeMenu);
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    function closeOutside(event: PointerEvent) {
      const target = event.target as Node;
      if (btnRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
      setActiveGroup(null);
    }
    function closeWithEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpen(false);
      setActiveGroup(null);
    }
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeWithEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeWithEscape);
    };
  }, [open]);

  function handleItem(item: MenuItem) {
    setOpen(false);
    setActiveGroup(null);
    if (item.action === 'feedback') setFeedbackOpen(true);
    else if (item.href) router.push(item.href);
  }

  const selectedGroup = GROUPS.find((group) => group.key === activeGroup);
  const accountName = displayName?.trim() || email?.split('@')[0] || 'Xroga user';

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={children
          ? `xv-profile-quick-trigger xv-profile-row-trigger ${triggerClassName ?? ''}`
          : `xv-profile-quick-trigger p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] ${triggerClassName ?? ''}`}
        aria-label="Account menu"
        aria-expanded={open}
      >
        {children ?? <AnimatedIcon icon={SlidersHorizontalIcon} size={15} intro={false} />}
      </button>

      {open && typeof document !== 'undefined' ? createPortal(
        <div ref={menuRef} id="xv-profile-quick-menu" className="xv-pqm-shell fixed z-[330]" style={{ top: pos.top, left: pos.left }} onMouseLeave={scheduleSubmenuClose}>
          <div className="xv-pqm-card" onMouseEnter={cancelSubmenuClose}>
            <div className="xv-pqm-identity">
              <span className="xv-pqm-avatar" aria-hidden="true">{accountName.charAt(0).toUpperCase()}</span>
              <span className="min-w-0"><strong>{accountName}</strong>{email ? <small>{email}</small> : null}<em>{provider} account</em></span>
            </div>
            <button type="button" data-menu-key="plan" className="xv-pqm-premium" onClick={() => { setOpen(false); router.push('/pricing'); }}>
              <AnimatedIcon icon={AtomIcon} size={15} intro={false} /><span><strong>Premium</strong><small>Compare plans and upgrade</small></span>
            </button>
            <div className="xv-pqm-primary" role="menu" aria-label="Account options">
              {GROUPS.map((group) => {
                const GroupIcon = group.animated;
                return (
                  <button key={group.key} type="button" role="menuitem" className={activeGroup === group.key ? 'is-active' : undefined}
                    onMouseEnter={() => { cancelSubmenuClose(); setActiveGroup(group.key); }} onFocus={() => setActiveGroup(group.key)} onClick={() => setActiveGroup(group.key)}
                    aria-haspopup="menu" aria-expanded={activeGroup === group.key}>
                    <span className="xv-pqm-tile"><AnimatedIcon icon={GroupIcon} size={14} intro={false} /></span>
                    <span><strong>{group.label}</strong><small>{group.desc}</small></span>
                    <span className="xv-pqm-chevron" aria-hidden="true">›</span>
                  </button>
                );
              })}
              {onLogout ? (
                <button type="button" role="menuitem" className="xv-pqm-logout" onClick={() => { setOpen(false); onLogout(); }}>
                  <span className="xv-pqm-tile"><AnimatedIcon icon={LogoutIcon} size={14} intro={false} /></span><span><strong>Logout</strong><small>Sign out of this account</small></span>
                </button>
              ) : null}
            </div>
          </div>

          {selectedGroup ? (
            <div className={`xv-pqm-submenu is-${pos.submenuSide}`} role="menu" aria-label={`${selectedGroup.label} options`}
              onMouseEnter={() => { cancelSubmenuClose(); setActiveGroup(selectedGroup.key); }} onMouseLeave={scheduleSubmenuClose}>
              <p>{selectedGroup.label}</p>
              {selectedGroup.items.map((item) => {
                const ItemIcon = item.animated;
                return (
                  <button key={item.key} type="button" role="menuitem" onClick={() => handleItem(item)}>
                    <span className="xv-pqm-tile"><AnimatedIcon icon={ItemIcon} size={14} intro={false} /></span>
                    <span><strong>{item.label}</strong><small>{item.desc}</small></span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>, document.body,
      ) : null}

      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </>
  );
}
