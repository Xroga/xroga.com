'use client';

import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ChevronDown,
  Compass,
  LayoutDashboard,
  MessageSquarePlus,
  Link2,
  Settings,
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from './Logo';
import { SidebarSearchModal } from './SidebarSearchModal';
import { SidebarProjectHistory } from './SidebarProjectHistory';
import { HoverTip } from '@/components/ui/HoverTip';
import { SidebarTip } from '@/components/ui/SidebarTip';
import { ProfileQuickMenu } from '@/components/ui/ProfileQuickMenu';
import {
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  useThemeStore,
} from '@/store/useThemeStore';
import { useAppStore } from '@/store/useAppStore';
import { clearUserScopedCaches } from '@/lib/userScopedCache';
import { createClient } from '@/lib/supabase/client';
import { AvatarPickerModal } from '@/components/profile/AvatarPickerModal';
import { UserProfileBox } from '@/components/profile/UserProfileBox';
import { useAvatarUpdate } from '@/hooks/useAvatarUpdate';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { usePrivacyStore } from '@/store/usePrivacyStore';
import { useHydrated } from '@/hooks/useHydrated';
import { IncognitoProfileBox } from '@/components/incognito/IncognitoProfileBox';
import { ModalCloseButton } from '@/components/ui/ConfirmDeleteModal';
import { AnimatedNavIcon, type NavIconMotion } from './AnimatedNavIcon';
import { SidebarNavScroller } from './SidebarNavScroller';
import { ThemeToggle } from './ThemeToggle';

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
  motion?: NavIconMotion;
};

type NavGroup = {
  id: string;
  label: string;
  icon: typeof LayoutDashboard;
  tip: string;
  motion?: NavIconMotion;
  children: NavLink[];
};

type NavEntry = NavLink | NavGroup;

function isGroup(entry: NavEntry): entry is NavGroup {
  return 'children' in entry;
}

const navItems: NavEntry[] = [
  {
    href: '/workspace',
    motion: 'blink' as const,
    label: 'Workspace',
    icon: Terminal,
    tip: 'Main workspace — build and chat with Xroga AI.',
  },
  {
    href: '/dashboard',
    motion: 'pulse' as const,
    label: 'Dashboard',
    icon: LayoutDashboard,
    tip: 'Recent activity, billing, plan, and usage.',
  },
  
  {
    href: '/dashboard/projects',
    motion: 'flip' as const,
    label: 'Repositories',
    icon: FolderGit2,
    tip: 'Open connected repositories and their durable Xroga workspaces.',
  },
  {
    href: '/dashboard/integrations',
    motion: 'pulse' as const,
    label: 'Integrations',
    icon: Link2,
    tip: 'Connect GitHub, Slack, databases, and tools.',
  },
  {
    id: 'launch',
    label: 'Launch & Growth',
    motion: 'launch' as const,
    icon: Rocket,
    tip: 'Operations, growth, and publishing.',
    children: [
      {
        href: '/dashboard/publish',
        motion: 'launch' as const,
        label: 'Publish',
        icon: Rocket,
        tip: 'Ship web (Vercel), Chrome extension, desktop installers, or mobile (Expo) on your accounts.',
      },
      {
        href: '/dashboard/operations',
        motion: 'pulse' as const,
        label: 'Operations',
        icon: Activity,
        tip: 'Inspect real product health, releases, incidents, approvals, and operational evidence.',
      },
      {
        href: '/dashboard/growth',
        motion: 'grow' as const,
        label: 'Growth',
        icon: TrendingUp,
        tip: 'Evidence-backed activation, recommendations, campaigns, messaging, referrals, experiments, and attribution.',
      },
    ],
  },
  {
    id: 'explore',
    label: 'Explore',
    motion: 'sweep' as const,
    icon: Compass,
    tip: 'Showcase templates, the community, and feedback.',
    children: [
      {
        href: '/showcase',
        motion: 'flip' as const,
        label: 'Showcase',
        icon: LayoutTemplate,
        tip: 'Reusable Xroga templates — preview a complete product, then customise it into your own project.',
      },
      {
        href: '/community',
        motion: 'pulse' as const,
        label: 'Community',
        icon: MessageCirclePlus,
        tip: 'Share feedback, report bugs, request features, and help other Xroga builders.',
      },
      {
        href: '/community?compose=feedback',
        motion: 'pulse' as const,
        label: 'Share Feedback',
        icon: MessageSquarePlus,
        tip: 'Tell us what is working and what is not.',
      },
    ],
  },
  {
    href: '/settings',
    motion: 'shake' as const,
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
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
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
  const terminalFullscreenRaw = useThemeStore((s) => s.terminalFullscreen);
  const planTier = useAppStore((s) => s.planTier);
  const profile = useAppStore((s) => s.profile);
  const incognitoRaw = usePrivacyStore((s) => s.incognito);
  const incognito = hydrated && incognitoRaw;
  const terminalFullscreen = hydrated && terminalFullscreenRaw;
  const isMobile = useIsMobile();
  const avatarUrl = profile?.avatar_url;
  const nameInitial = (profile?.display_name ?? displayName ?? 'U').charAt(0).toUpperCase();
  const userName = incognito ? 'Incognito' : (profile?.display_name ?? displayName ?? 'User');
  const userPlan = incognito ? 'Temporary session' : planLabel(planTier);

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

  function startResize(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWidth;
    document.body.classList.add('xv-sidebar-resizing');

    function onMove(ev: PointerEvent) {
      setSidebarWidth(startW + (ev.clientX - startX));
    }
    function onUp() {
      document.body.classList.remove('xv-sidebar-resizing');
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp, { once: true });
    document.addEventListener('pointercancel', onUp, { once: true });
  }

  function resizeWithKeyboard(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setSidebarWidth(sidebarWidth - 12);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setSidebarWidth(sidebarWidth + 12);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setSidebarWidth(SIDEBAR_MIN_WIDTH);
    } else if (e.key === 'End') {
      e.preventDefault();
      setSidebarWidth(SIDEBAR_MAX_WIDTH);
    }
  }

  const effectiveSidebarOpen = hydrated ? sidebarOpen : true;
  const asideWidth: number | string = effectiveSidebarOpen
    ? hydrated
      ? sidebarWidth
      : 'var(--xv-boot-sidebar-width, 248px)'
    : 64;
  const navExpanded = isMobile ? mobileOpen : effectiveSidebarOpen;

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
    const [path] = href.split('?');
    if (pathname !== path && !pathname.startsWith(`${path}/`)) return false;
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
    clearUserScopedCaches();
    useAppStore.getState().setProfile(null);
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
    </div>
  );

  const sidebarInner = (
    <>
      <div
        className={cn(
          'xv-sidebar-brand shrink-0',
          navExpanded ? 'px-2 py-2' : 'flex flex-col items-center gap-2 px-2 py-2',
        )}
      >
        {/* Collapsed, the rail is 64px wide and the logo alone is 34 of them. Laid out
            as a row the three controls had nowhere to go but sideways, so they spilled
            out of the rail and sat on top of the workspace. Stacked under the logo they
            stay inside the column at any height. */}
        <div className={cn('flex items-center', navExpanded ? 'w-full gap-2' : 'flex-col gap-2')}>
          {/* Not `block`: that makes the tip wrapper `w-full`, so the logo claimed the
              whole brand row and the utility card — which is `ml-auto` and cannot
              shrink — was laid on top of it. The mark showed through behind the first
              icon. Sized to its content, the logo gives way instead. */}
          <HoverTip label="Xroga AI" description="Workspace home" className={navExpanded ? 'shrink min-w-0' : 'shrink-0'}>
            <Logo
              href={logoHref}
              height={navExpanded ? 50 : 34}
              variant={navExpanded ? 'sidebarFull' : 'sidebar'}
              className={cn(navExpanded ? 'max-w-[100px]' : '!h-[34px] !w-[34px]')}
              onClick={handleNavClick}
            />
          </HoverTip>
          {navExpanded ? (
            <div className="xv-sidebar-header-actions ml-auto flex shrink-0 items-center">
              <HoverTip label="New terminal" description="Start a fresh workspace terminal.">
                <button
                  type="button"
                  onClick={handleNewChat}
                  className="xv-new-terminal-compact"
                  aria-label="New Terminal"
                >
                  <MessageCirclePlus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>New</span>
                </button>
              </HoverTip>
              {/* Decorative only. The three controls, their order and their handlers are
                  untouched; these hairlines just divide them the way a segmented control
                  divides its segments. */}
              <span className="xv-toolbar-sep" aria-hidden="true" />
              <HoverTip label="Search" description="Search projects, chats, and commands.">
                <button
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  className="xv-sidebar-head-icon"
                  aria-label="Search"
                >
                  <Search className="w-3.5 h-3.5" />
                </button>
              </HoverTip>
              <span className="xv-toolbar-sep" aria-hidden="true" />
              <HoverTip label="Theme" description="Choose the workspace theme.">
                <ThemeToggle />
              </HoverTip>
              {isMobile && mobileOpen ? <ModalCloseButton onClick={closeMobile} /> : null}
            </div>
          ) : (
            <div className="xv-sidebar-collapsed-actions" aria-label="Workspace shortcuts">
              <HoverTip label="Open sidebar" description="Show workspace navigation.">
                <button
                  type="button"
                  onClick={() => toggleSidebar()}
                  aria-label="Open sidebar"
                >
                  <PanelLeft className="h-4 w-4" aria-hidden="true" />
                </button>
              </HoverTip>
              <HoverTip label="Search" description="Search projects, chats, and commands.">
                <button type="button" onClick={() => setSearchOpen(true)} aria-label="Search">
                  <Search className="h-4 w-4" aria-hidden="true" />
                </button>
              </HoverTip>
              <HoverTip label="New terminal" description="Start a fresh workspace terminal.">
                <button type="button" onClick={handleNewChat} aria-label="New Terminal">
                  <MessageCirclePlus className="h-4 w-4" aria-hidden="true" />
                </button>
              </HoverTip>
            </div>
          )}
        </div>

      </div>

      {navExpanded ? <SidebarNavScroller targetRef={navScrollRef} className="flex-1 min-h-0">
        <nav
          ref={navScrollRef}
          className="xv-sidebar-nav-scroll h-full p-2 overflow-y-auto overflow-x-hidden min-h-0"
        >
          <div className="xv-sidebar-menu">
              {navItems.map((entry) =>
                isGroup(entry) ? (
                  <div key={entry.id} className="xv-nav-group">
                    {/* The two group headers were the only rows in the nav without a
                        styled tip — they carried a native `title`, which appears after
                        a much longer delay, in the browser's own chrome, and looks
                        like nothing else in the sidebar. Every row explains itself the
                        same way now. */}
                    <SidebarTip label={entry.label} description={entry.tip}>
                      <button
                        type="button"
                        onClick={() => toggleGroup(entry.id)}
                        className={cn('xv-nav-group__trigger', groupHasActive(entry) && 'xv-active')}
                        aria-expanded={isGroupOpen(entry)}
                      >
                        <AnimatedNavIcon Icon={entry.icon} motion={entry.motion} className="shrink-0" />
                        <span>{entry.label}</span>
                        <ChevronDown
                          className={cn('xv-nav-group__chev h-3.5 w-3.5', isGroupOpen(entry) && 'is-open')}
                          aria-hidden="true"
                        />
                      </button>
                    </SidebarTip>
                    {isGroupOpen(entry) && (
                      <div className="xv-nav-group__items">
                        {entry.children.map((child) => (
                          <SidebarTip key={child.href} label={child.label} description={child.tip}>
                            <Link
                              href={child.href}
                              onClick={handleNavClick}
                              className={cn(isActive(child.href) && 'xv-active')}
                            >
                              <AnimatedNavIcon Icon={child.icon} motion={child.motion} className="shrink-0" />
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
                      <AnimatedNavIcon Icon={entry.icon} motion={entry.motion} className="shrink-0" />
                      <span>{entry.label}</span>
                    </Link>
                  </SidebarTip>
                ),
              )}
          </div>
          <SidebarProjectHistory expanded={navExpanded} />
        </nav>
      </SidebarNavScroller> : <div className="flex-1" aria-hidden="true" />}

      {navExpanded ? bottomSection : null}
    </>
  );

  return (
    <>
      <SidebarSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />

      <header
        className={cn(
          'xv-mobile-workspace-header lg:hidden',
          mobileOpen && 'is-drawer-open',
          terminalFullscreen && 'hidden',
        )}
        aria-label="Workspace header"
      >
        <Logo
          href={logoHref}
          height={40}
          variant="sidebarFull"
          className="xv-mobile-workspace-logo"
        />
        <div className="xv-mobile-workspace-actions" aria-label="Workspace shortcuts">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open sidebar"
            aria-expanded={mobileOpen}
          >
            <PanelLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => setSearchOpen(true)} aria-label="Search">
            <Search className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" onClick={handleNewChat} aria-label="New Terminal">
            <MessageCirclePlus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </header>

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

      <div
        className={cn('xv-sidebar-root relative hidden lg:block shrink-0', !effectiveSidebarOpen && 'is-collapsed')}
        style={{ width: asideWidth }}
      >
        <aside
          className={cn(
            'xv-sidebar-floating xv-sidebar-hover relative z-40 flex flex-col shrink-0 overflow-hidden transition-[width,opacity] duration-200 opacity-100'
          )}
        >
          {sidebarInner}
        </aside>
        {effectiveSidebarOpen ? (
          <div
            role="separator"
            aria-label="Resize sidebar"
            aria-orientation="vertical"
            aria-valuemin={SIDEBAR_MIN_WIDTH}
            aria-valuemax={SIDEBAR_MAX_WIDTH}
            aria-valuenow={sidebarWidth}
            tabIndex={0}
            onPointerDown={startResize}
            onKeyDown={resizeWithKeyboard}
            className="xv-sidebar-resize-handle hidden lg:flex"
          >
            <span aria-hidden="true" />
          </div>
        ) : null}
        {effectiveSidebarOpen ? <button
          type="button"
          onClick={() => {
            toggleSidebar();
            setMobileOpen(false);
          }}
          className={cn('xv-sidebar-edge-toggle hidden lg:flex', terminalFullscreen && '!hidden')}
          aria-label={effectiveSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
        >
          <PanelLeftClose className="w-3.5 h-3.5" />
        </button> : null}
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
