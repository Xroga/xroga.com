'use client';

import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ChevronDown,
  Compass,
  LayoutDashboard,
  MessageSquarePlus,
  Link2,
  Settings,
  Menu,
  PanelLeftClose,
  PanelLeft,
  Search,
  Zap,
  MessageCirclePlus,
  Terminal,
  Rocket,
  Activity,
  TrendingUp,
  FolderGit2,
  LayoutTemplate,
  Bitcoin,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from './Logo';
import { SidebarSearchModal } from './SidebarSearchModal';
import { SidebarProjectHistory } from './SidebarProjectHistory';
import { HoverTip } from '@/components/ui/HoverTip';
import { SidebarTip } from '@/components/ui/SidebarTip';
import { ProfileQuickMenu } from '@/components/ui/ProfileQuickMenu';
import { useThemeStore } from '@/store/useThemeStore';
import { useAppStore } from '@/store/useAppStore';
import { createClient } from '@/lib/supabase/client';
import { api } from '@/lib/api';
import { AvatarPickerModal } from '@/components/profile/AvatarPickerModal';
import { UserProfileBox } from '@/components/profile/UserProfileBox';
import { useAvatarUpdate } from '@/hooks/useAvatarUpdate';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { usePrivacyStore } from '@/store/usePrivacyStore';
import { useHydrated } from '@/hooks/useHydrated';
import { IncognitoProfileBox } from '@/components/incognito/IncognitoProfileBox';
import { ModalCloseButton } from '@/components/ui/ConfirmDeleteModal';
import { AnimatedNavIcon } from './AnimatedNavIcon';
import { SidebarNavScroller } from './SidebarNavScroller';

/**
 * The sidebar nav, as a mix of links and groups.
 *
 * Twelve flat rows outgrew the column: the list scrolled on a laptop, which is what
 * put a scrollbar in the middle of the chrome and pushed half the destinations out
 * of sight. Related destinations are grouped now, so the resting list is short and
 * nothing is buried more than one click deep.
 *
 * Plan & Usage is deliberately absent — it lives on the Dashboard, next to the
 * billing and activity it belongs with, rather than being a nav row of its own.
 */
type NavLink = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  tip: string;
};

type NavGroup = {
  id: string;
  label: string;
  icon: typeof LayoutDashboard;
  tip: string;
  children: NavLink[];
};

type NavEntry = NavLink | NavGroup;

function isGroup(entry: NavEntry): entry is NavGroup {
  return 'children' in entry;
}

const navItems: NavEntry[] = [
  {
    href: '/workspace',
    label: 'Workspace',
    icon: Terminal,
    tip: 'Main workspace — build and chat with Xroga AI.',
  },
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    tip: 'Recent activity, billing, plan, and usage.',
  },
  {
    href: '/crypto-builder',
    label: 'Crypto Builder',
    icon: Bitcoin,
    tip: 'Build crypto agents, Web3 apps, DeFi and DAO tools, on-chain monitoring, and hackathon projects.',
  },
  {
    href: '/dashboard/projects',
    label: 'Repositories',
    icon: FolderGit2,
    tip: 'Open connected repositories and their durable Xroga workspaces.',
  },
  {
    href: '/dashboard/integrations',
    label: 'Integrations',
    icon: Link2,
    tip: 'Connect GitHub, Slack, databases, and tools.',
  },
  {
    id: 'launch',
    label: 'Launch & Growth',
    icon: Rocket,
    tip: 'Operations, growth, and publishing.',
    children: [
      {
        href: '/dashboard/operations',
        label: 'Operations',
        icon: Activity,
        tip: 'Inspect real product health, releases, incidents, approvals, and operational evidence.',
      },
      {
        href: '/dashboard/growth',
        label: 'Growth',
        icon: TrendingUp,
        tip: 'Evidence-backed activation, recommendations, campaigns, messaging, referrals, experiments, and attribution.',
      },
      {
        href: '/dashboard/publish',
        label: 'Publish',
        icon: Rocket,
        tip: 'Ship web (Vercel), Chrome extension, desktop installers, or mobile (Expo) on your accounts.',
      },
    ],
  },
  {
    id: 'explore',
    label: 'Explore',
    icon: Compass,
    tip: 'Showcase templates, the community, and feedback.',
    children: [
      {
        href: '/showcase',
        label: 'Showcase',
        icon: LayoutTemplate,
        tip: 'Reusable Xroga templates — preview a complete product, then customise it into your own project.',
      },
      {
        href: '/community',
        label: 'Community',
        icon: MessageCirclePlus,
        tip: 'Share feedback, report bugs, request features, and help other Xroga builders.',
      },
      {
        href: '/community?compose=feedback',
        label: 'Share Feedback',
        icon: MessageSquarePlus,
        tip: 'Tell us what is working and what is not.',
      },
    ],
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: Settings,
    tip: 'Theme, terminal skin, account, and preferences.',
  },
];

interface SidebarProps {
  displayName?: string;
  email?: string;
}

function planLabel(tier?: string | null) {
  if (!tier || tier === 'unpaid') return 'Launch Promotion';
  return 'Xroga AI Plan';
}

export function Sidebar({ displayName }: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  /* Must sit with the other hooks: this component returns early for the collapsed
     case, and a hook declared past that point runs conditionally. */
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const navScrollRef = useRef<HTMLDivElement>(null);
  const profileRowRef = useRef<HTMLDivElement>(null);
  const { setAvatarUrl, uploadAvatarFile } = useAvatarUpdate();
  const { startNewChat } = useTerminalChat();
  const hydrated = useHydrated();
  const sidebarOpen = useThemeStore((s) => s.sidebarOpen);
  const toggleSidebar = useThemeStore((s) => s.toggleSidebar);
  const closeBrowser = useThemeStore((s) => s.closeBrowser);
  const sidebarWidth = useThemeStore((s) => s.sidebarWidth);
  const setSidebarWidth = useThemeStore((s) => s.setSidebarWidth);
  const terminalFullscreen = useThemeStore((s) => s.terminalFullscreen);
  const planTier = useAppStore((s) => s.planTier);
  const profile = useAppStore((s) => s.profile);
  const setProfile = useAppStore((s) => s.setProfile);
  const incognitoRaw = usePrivacyStore((s) => s.incognito);
  const incognito = hydrated && incognitoRaw;
  const isMobile = useIsMobile();
  const avatarUrl = profile?.avatar_url;
  const nameInitial = (profile?.display_name ?? displayName ?? 'U').charAt(0).toUpperCase();
  const userName = incognito ? 'Incognito' : (profile?.display_name ?? displayName ?? 'User');
  const userPlan = incognito ? 'Temporary session' : planLabel(planTier);

  useEffect(() => {
    api.profile
      .get()
      .then((p) => setProfile(p))
      .catch(() => {});
  }, [setProfile]);

  useEffect(() => {
    document.body.classList.toggle('mobile-sidebar-open', mobileOpen);
    if (mobileOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      navScrollRef.current?.scrollTo({ top: 0 });
      return () => {
        document.body.style.overflow = prev;
        document.body.classList.remove('mobile-sidebar-open');
      };
    }
    return () => document.body.classList.remove('mobile-sidebar-open');
  }, [mobileOpen]);

  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWidth;
    function onMove(ev: MouseEvent) {
      setSidebarWidth(startW + (ev.clientX - startX));
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  const asideWidth = (hydrated ? sidebarOpen : true) ? (hydrated ? sidebarWidth : 256) : 0;
  const navExpanded = isMobile ? mobileOpen : (hydrated ? sidebarOpen : true);

  function closeMobile() {
    setMobileOpen(false);
  }

  if (incognito) {
    return (
      <>
        <SidebarSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
        <AvatarPickerModal
          open={avatarPickerOpen}
          onClose={() => setAvatarPickerOpen(false)}
          currentUrl={avatarUrl}
          onSelect={setAvatarUrl}
          onUpload={async (file) => {
            await uploadAvatarFile(file);
            setAvatarPickerOpen(false);
          }}
        />
      </>
    );
  }

  const toggleGroup = (id: string) =>
    setOpenGroups((current) => ({ ...current, [id]: !(current[id] ?? false) }));

  const isActive = (href: string) => {
    if (href === '/workspace') return pathname === '/workspace';
    if (href === '/dashboard') return pathname === '/dashboard' || pathname === '/dashboard/';
    const [path, query] = href.split('?');
    if (pathname !== path && !pathname.startsWith(`${path}/`)) return false;
    if (query?.includes('tab=plan')) return searchParams.get('tab') === 'plan';
    if (path === '/settings') return searchParams.get('tab') !== 'plan';
    return true;
  };

  const groupHasActive = (group: NavGroup) => group.children.some((c) => isActive(c.href));
  /* A group holding the current route opens by default — otherwise the user lands on
     a page whose own nav entry is hidden inside a collapsed row. An explicit toggle
     always wins over that default. */
  const isGroupOpen = (group: NavGroup) => openGroups[group.id] ?? groupHasActive(group);

  function handleNavClick() {
    closeMobile();
    closeBrowser();
  }

  function handleNewChat() {
    // Fresh blank workspace; prior #N is flushed to permanent storage inside startNewChat.
    startNewChat();
    handleNavClick();
    router.push('/workspace');
    // Clear repo + open chatbar "Select repository" — never auto-pick for the user.
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('xroga-request-new-terminal'));
    }, 80);
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    // Hard navigation: router.refresh() would re-render the current shell route, whose
    // layout now sees no user and redirects to /auth/login, racing ahead of the push.
    window.location.assign('/');
  }

  const logoHref = pathname.startsWith('/dashboard') ? '/dashboard' : '/workspace';

  const bottomSection = (
    <div className="p-2 mt-auto space-y-2 xv-sidebar-bottom">
      {/* The plan link used to be a full-width button of its own above the profile,
          which cost a whole row. It now rides in the profile line as a compact icon,
          so the nav keeps every item while taking less height. */}
      {!navExpanded && !isMobile && (
        <div className="flex flex-col items-center gap-1">
          <HoverTip label="Xroga AI plan" description="View plans and upgrade your subscription.">
            <Link
              href="/pricing"
              onClick={() => setMobileOpen(false)}
              className="flex items-center justify-center p-2 mx-auto w-9 h-9 rounded-lg bg-[var(--foreground)] text-[var(--background)]"
            >
              <Zap className="w-4 h-4" />
            </Link>
          </HoverTip>
        </div>
      )}
      {displayName && navExpanded && (
        <div ref={profileRowRef} className="xv-sidebar-profile-row flex items-center gap-2 px-2 py-1.5 rounded-xl">
          {incognito ? (
            <IncognitoProfileBox size="sidebar" />
          ) : (
          <UserProfileBox
            url={avatarUrl}
            initial={nameInitial}
            size="sidebar"
            onClick={() => setAvatarPickerOpen(true)}
          />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium xv-sidebar-profile-name truncate leading-tight">{userName}</p>
            <p className="text-[11px] xv-sidebar-profile-plan truncate">{userPlan}</p>
          </div>
          <HoverTip label="Xroga AI plan" description="View plans and upgrade your subscription.">
            <Link
              href="/pricing"
              onClick={() => setMobileOpen(false)}
              aria-label="View Xroga AI plan"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--foreground)] text-[var(--background)] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
            >
              <Zap className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </HoverTip>
          <ProfileQuickMenu onLogout={handleLogout} anchorRef={profileRowRef} />
        </div>
      )}
      {displayName && !sidebarOpen && !isMobile && (
        <div className="flex flex-col items-center gap-1 py-1">
          {incognito ? (
            <IncognitoProfileBox size="sidebarCompact" />
          ) : (
          <UserProfileBox
            url={avatarUrl}
            initial={nameInitial}
            size="sidebarCompact"
            onClick={() => setAvatarPickerOpen(true)}
          />
          )}
          <ProfileQuickMenu onLogout={handleLogout} />
        </div>
      )}
    </div>
  );

  const sidebarInner = (
    <>
      <div className="px-2 py-1.5 sm:py-2 border-b border-[var(--card-border)] flex items-center gap-1 min-h-[44px] sm:min-h-[48px] shrink-0">
        <HoverTip label="Xroga AI" description="Dashboard home" block className="shrink min-w-0">
          <Logo href={logoHref} height={navExpanded ? 28 : 22} variant="sidebar" onClick={handleNavClick} />
        </HoverTip>
        {navExpanded ? (
          <button
            type="button"
            onClick={handleNewChat}
            className="xv-new-chat-btn flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold shrink-0"
            title="New Terminal"
          >
            <MessageCirclePlus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New Terminal</span>
          </button>
        ) : (
          <SidebarTip label="New Terminal" description="Start a fresh workspace session.">
            <button type="button" onClick={handleNewChat} className="xv-sidebar-icon-link !w-8 !h-8 !mx-0">
              <MessageCirclePlus className="w-4 h-4" />
            </button>
          </SidebarTip>
        )}
        <div className={cn('flex items-center gap-0.5 shrink-0 ml-auto', !navExpanded && 'flex-col ml-0')}>
          <HoverTip label="Search" description="Search projects, chats, and commands.">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-white/5 transition-colors"
              aria-label="Search"
            >
              <Search className="w-3.5 h-3.5" />
            </button>
          </HoverTip>
          {isMobile && mobileOpen && <ModalCloseButton onClick={closeMobile} />}
        </div>
      </div>

      <SidebarNavScroller targetRef={navScrollRef} className="flex-1 min-h-0">
        <nav
          ref={navScrollRef}
          className="xv-sidebar-nav-scroll h-full p-2 overflow-y-auto overflow-x-hidden min-h-0"
        >
          {navExpanded ? (
            <div className="xv-sidebar-menu">
              {navItems.map((entry) =>
                isGroup(entry) ? (
                  <div key={entry.id} className="xv-nav-group">
                    <button
                      type="button"
                      onClick={() => toggleGroup(entry.id)}
                      className={cn('xv-nav-group__trigger', groupHasActive(entry) && 'xv-active')}
                      aria-expanded={isGroupOpen(entry)}
                      title={entry.tip}
                    >
                      <AnimatedNavIcon Icon={entry.icon} className="shrink-0" />
                      <span>{entry.label}</span>
                      <ChevronDown
                        className={cn('xv-nav-group__chev h-3.5 w-3.5', isGroupOpen(entry) && 'is-open')}
                        aria-hidden="true"
                      />
                    </button>
                    {isGroupOpen(entry) && (
                      <div className="xv-nav-group__items">
                        {entry.children.map((child) => (
                          <SidebarTip key={child.href} label={child.label} description={child.tip}>
                            <Link
                              href={child.href}
                              onClick={handleNavClick}
                              className={cn(isActive(child.href) && 'xv-active')}
                            >
                              <AnimatedNavIcon Icon={child.icon} className="shrink-0" />
                              <span>{child.label}</span>
                            </Link>
                          </SidebarTip>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <SidebarTip key={entry.href} label={entry.label} description={entry.tip}>
                    <Link
                      href={entry.href}
                      onClick={handleNavClick}
                      className={cn(isActive(entry.href) && 'xv-active')}
                    >
                      <AnimatedNavIcon Icon={entry.icon} className="shrink-0" />
                      <span>{entry.label}</span>
                    </Link>
                  </SidebarTip>
                ),
              )}
            </div>
          ) : (
            /* Collapsed to icons there is no room for a disclosure, so groups flatten
               back into their children — every destination stays one click away
               rather than becoming unreachable. */
            <div className="xv-sidebar-collapsed-nav space-y-1">
              {navItems
                .flatMap((entry) => (isGroup(entry) ? entry.children : [entry]))
                .map(({ href, label, icon: Icon, tip }) => (
                  <SidebarTip key={href} label={label} description={tip}>
                    <Link
                      href={href}
                      onClick={handleNavClick}
                      className={cn('xv-sidebar-icon-link', isActive(href) && 'xv-active')}
                    >
                      <AnimatedNavIcon Icon={Icon} className="shrink-0" />
                    </Link>
                  </SidebarTip>
                ))}
            </div>
          )}
          <SidebarProjectHistory expanded={navExpanded} />
        </nav>
      </SidebarNavScroller>

      {bottomSection}
      {sidebarOpen && (
        <div
          role="separator"
          aria-orientation="vertical"
          onMouseDown={startResize}
          className="hidden lg:block absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-[var(--accent)]/30 z-50"
        />
      )}
    </>
  );

  return (
    <>
      <SidebarSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />

      <button
        type="button"
        className={cn(
          'xv-mobile-menu-btn lg:hidden fixed top-[max(0.75rem,env(safe-area-inset-top))] left-3 p-2.5 rounded-xl glass-panel shadow-lg z-[80]',
          mobileOpen && 'opacity-0 pointer-events-none',
          terminalFullscreen && 'hidden',
        )}
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
        aria-expanded={mobileOpen}
      >
        <Menu className="w-5 h-5" />
      </button>

      {isMobile &&
        mobileOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[98] bg-black/70 backdrop-blur-sm"
              onClick={closeMobile}
              aria-hidden
            />
            <aside className="xv-sidebar-mobile-open xv-sidebar-floating--mobile fixed z-[100] flex flex-col w-[min(86vw,312px)] max-w-[312px] overflow-hidden">
              <div className="flex flex-col flex-1 min-h-0 overflow-hidden">{sidebarInner}</div>
            </aside>
          </>,
          document.body,
        )}

      <button
        type="button"
        onClick={() => {
          toggleSidebar();
          setMobileOpen(false);
        }}
        className={cn('xv-sidebar-edge-toggle hidden lg:flex', terminalFullscreen && '!hidden')}
        aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
        // Track the inset panel's right edge, not the reserved column's edge.
        style={{ left: sidebarOpen ? `calc(${asideWidth}px - var(--xv-sidebar-inset))` : 0 }}
      >
        {sidebarOpen ? (
          <PanelLeftClose className="w-3.5 h-3.5" />
        ) : (
          <PanelLeft className="w-3.5 h-3.5" />
        )}
      </button>

      <div className="xv-sidebar-root hidden lg:block shrink-0" style={{ width: asideWidth }}>
        <aside
          className={cn(
            'xv-sidebar-floating xv-sidebar-hover relative z-40 shrink-0 overflow-hidden transition-[opacity] duration-200',
            sidebarOpen ? 'flex flex-col opacity-100' : 'pointer-events-none opacity-0'
          )}
        >
          {sidebarInner}
        </aside>
      </div>

      <AvatarPickerModal
        open={avatarPickerOpen}
        onClose={() => setAvatarPickerOpen(false)}
        currentUrl={avatarUrl}
        onSelect={setAvatarUrl}
        onUpload={async (file) => {
          await uploadAvatarFile(file);
          setAvatarPickerOpen(false);
        }}
      />
    </>
  );
}
