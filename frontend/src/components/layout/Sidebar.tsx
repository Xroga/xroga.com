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
import { AnimatedIcon, type AnimatedIconComponent } from '@/components/icons/animated/AnimatedIcon';
import { TerminalIcon } from '@/components/icons/animated/TerminalIcon';
import { NewTerminalIcon } from '@/components/icons/animated/NewTerminalIcon';
import { LocateFixedIcon } from '@/components/icons/animated/LocateFixedIcon';
import { RocketIcon } from '@/components/icons/animated/RocketIcon';
import { LayoutGridIcon } from '@/components/icons/animated/LayoutGridIcon';
import { CogIcon } from '@/components/icons/animated/CogIcon';
import { TelescopeIcon } from '@/components/icons/animated/TelescopeIcon';
import { ConnectIcon } from '@/components/icons/animated/ConnectIcon';
import { FolderOpenIcon } from '@/components/icons/animated/FolderOpenIcon';
import { AirplayIcon } from '@/components/icons/animated/AirplayIcon';
import { UsersRoundIcon } from '@/components/icons/animated/UsersRoundIcon';
import { SmileIcon } from '@/components/icons/animated/SmileIcon';
import { ChartColumnIncreasingIcon } from '@/components/icons/animated/ChartColumnIncreasingIcon';
import { HeartPulseIcon } from '@/components/icons/animated/HeartPulseIcon';
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
/*
 * A row can carry either kind of icon.
 *
 * `icon` is a lucide glyph animated as a whole by `AnimatedNavIcon` — it tilts,
 * lifts or blinks, but its interior never changes. `animated` is a purpose-built
 * component that animates its own paths: the terminal's chevron advances, the
 * dashboard's tiles trade places, the cog turns. Where a row has both, `animated`
 * wins; `icon` stays because it is still the mobile nav's glyph and the type that
 * the rest of the nav is written against.
 */
type NavLink = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  animated?: AnimatedIconComponent;
  tip: string;
  motion?: NavIconMotion;
};

type NavGroup = {
  id: string;
  label: string;
  icon: typeof LayoutDashboard;
  animated?: AnimatedIconComponent;
  tip: string;
  motion?: NavIconMotion;
  children: NavLink[];
};

type NavEntry = NavLink | NavGroup;

function isGroup(entry: NavEntry): entry is NavGroup {
  return 'children' in entry;
}

/** A row's icon: the purpose-built animated one where it has it, the lucide glyph otherwise. */
function NavIcon({ entry }: { entry: NavEntry }) {
  if (entry.animated) {
    return <AnimatedIcon icon={entry.animated} className="shrink-0" />;
  }
  return <AnimatedNavIcon Icon={entry.icon} motion={entry.motion} className="shrink-0" />;
}

const navItems: NavEntry[] = [
  {
    href: '/workspace',
    motion: 'blink' as const,
    label: 'Workspace',
    icon: Terminal,
    animated: TerminalIcon,
    tip: 'Main workspace — build and chat with Xroga AI.',
  },
  {
    href: '/dashboard',
    motion: 'pulse' as const,
    label: 'Dashboard',
    icon: LayoutDashboard,
    animated: LayoutGridIcon,
    tip: 'Recent activity, billing, plan, and usage.',
  },
  
  {
    href: '/dashboard/projects',
    motion: 'flip' as const,
    label: 'Repositories',
    icon: FolderGit2,
    animated: FolderOpenIcon,
    tip: 'Open connected repositories and their durable Xroga workspaces.',
  },
  {
    href: '/dashboard/integrations',
    motion: 'pulse' as const,
    label: 'Integrations',
    icon: Link2,
    animated: ConnectIcon,
    tip: 'Connect GitHub, Slack, databases, and tools.',
  },
  {
    id: 'launch',
    label: 'Launch & Growth',
    motion: 'launch' as const,
    icon: Rocket,
    animated: RocketIcon,
    tip: 'Operations, growth, and publishing.',
    children: [
      {
        href: '/dashboard/publish',
        motion: 'launch' as const,
        label: 'Publish',
        icon: Rocket,
        animated: RocketIcon,
        tip: 'Ship web (Vercel), Chrome extension, desktop installers, or mobile (Expo) on your accounts.',
      },
      {
        href: '/dashboard/operations',
        motion: 'pulse' as const,
        label: 'Operations',
        icon: Activity,
        animated: HeartPulseIcon,
        tip: 'Inspect real product health, releases, incidents, approvals, and operational evidence.',
      },
      {
        href: '/dashboard/growth',
        motion: 'grow' as const,
        label: 'Growth',
        icon: TrendingUp,
        animated: ChartColumnIncreasingIcon,
        tip: 'Evidence-backed activation, recommendations, campaigns, messaging, referrals, experiments, and attribution.',
      },
    ],
  },
  {
    id: 'explore',
    label: 'Explore',
    motion: 'sweep' as const,
    icon: Compass,
    animated: TelescopeIcon,
    tip: 'Showcase templates, the community, and feedback.',
    children: [
      {
        href: '/showcase',
        motion: 'flip' as const,
        label: 'Showcase',
        icon: LayoutTemplate,
        animated: AirplayIcon,
        tip: 'Reusable Xroga templates — preview a complete product, then customise it into your own project.',
      },
      {
        href: '/community',
        motion: 'pulse' as const,
        label: 'Community',
        icon: MessageCirclePlus,
        animated: UsersRoundIcon,
        tip: 'Share feedback, report bugs, request features, and help other Xroga builders.',
      },
      {
        href: '/community?compose=feedback',
        motion: 'pulse' as const,
        label: 'Share Feedback',
        icon: MessageSquarePlus,
        animated: SmileIcon,
        tip: 'Tell us what is working and what is not.',
      },
    ],
  },
  {
    href: '/settings',
    motion: 'shake' as const,
    label: 'Settings',
    icon: Settings,
    animated: CogIcon,
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

/**
 * How far a press on the edge toggle may travel before it counts as a resize.
 *
 * Small enough that a deliberate drag is picked up immediately, large enough that
 * the few pixels of jitter in an ordinary click do not turn a collapse into one.
 */
const EDGE_DRAG_THRESHOLD_PX = 4;

/**
 * How long the pointer must rest on the collapsed mark before the sidebar opens.
 *
 * Long enough that crossing the rail on the way elsewhere does not shove the workspace
 * sideways, short enough that a deliberate hover does not feel stuck.
 */
const HOVER_OPEN_DELAY_MS = 220;

export function Sidebar({ displayName }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const navScrollRef = useRef<HTMLDivElement>(null);
  const profileRowRef = useRef<HTMLDivElement>(null);
  /** Set when a press on the edge toggle became a resize, so the click is ignored. */
  const edgeToggleDraggedRef = useRef(false);
  /** Pending hover-to-open, so leaving the mark before the delay cancels it. */
  const hoverOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  // A pending hover-to-open must not fire into a sidebar that is no longer mounted —
  // navigating away mid-hover would otherwise leave the timer to run and set state on
  // a dead component.
  useEffect(() => () => {
    if (hoverOpenTimerRef.current !== null) clearTimeout(hoverOpenTimerRef.current);
  }, []);

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

  function cancelSidebarHover() {
    if (hoverOpenTimerRef.current === null) return;
    clearTimeout(hoverOpenTimerRef.current);
    hoverOpenTimerRef.current = null;
  }

  /**
   * Open the sidebar after a short, cancellable pause over the mark.
   *
   * Opening on the first pixel of hover would fire whenever the pointer crossed the
   * mark on its way somewhere else, and a sidebar that expands under a passing cursor
   * shoves the workspace sideways. The delay makes it a deliberate act; leaving before
   * it elapses cancels it.
   */
  function openSidebarOnHover() {
    if (effectiveSidebarOpen || terminalFullscreen) return;
    cancelSidebarHover();
    hoverOpenTimerRef.current = setTimeout(() => {
      hoverOpenTimerRef.current = null;
      toggleSidebar();
    }, HOVER_OPEN_DELAY_MS);
  }

  function beginResize(startX: number) {
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

  function startResize(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    beginResize(e.clientX);
  }

  /**
   * A drag that starts on the edge toggle resizes rather than doing nothing.
   *
   * The toggle is centred on the same edge the resize handle runs down, and sits
   * above it, so it swallowed pointerdown at the midpoint — the most natural place
   * to grab an edge. The drag then never reached the handle and the pointerup
   * landed away from the button, so no click fired either: the sidebar simply
   * refused to resize from its middle.
   *
   * Past the threshold this hands off to the same resize the handle uses, and marks
   * the gesture so the click that may follow does not also toggle the sidebar shut.
   */
  function startEdgeToggleDrag(e: React.PointerEvent<HTMLButtonElement>) {
    if (!effectiveSidebarOpen) return; // A collapsed rail has no width to drag.
    const startX = e.clientX;
    edgeToggleDraggedRef.current = false;

    function stop() {
      document.removeEventListener('pointermove', onMove);
    }
    function onMove(ev: PointerEvent) {
      if (Math.abs(ev.clientX - startX) <= EDGE_DRAG_THRESHOLD_PX) return;
      stop();
      edgeToggleDraggedRef.current = true;
      beginResize(startX);
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', stop, { once: true });
    document.addEventListener('pointercancel', stop, { once: true });
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

  /**
   * Fullscreen collapses the sidebar to its rail rather than hiding it.
   *
   * It used to be hidden with `visibility: hidden`, which stops it painting but
   * leaves its width in the layout — this element is a flex sibling of the stage,
   * so the terminal went on starting after a band of empty page as wide as
   * whatever the user had dragged the sidebar to. That was the "fullscreen does
   * not fill the screen" symptom: nothing was oversized, the space was reserved
   * for something invisible.
   *
   * Collapsing gives the width back and keeps the rail — the logo, the sidebar
   * toggle, search and a new terminal — reachable without leaving fullscreen.
   * `sidebarOpen` itself is untouched, so exiting fullscreen restores the width
   * the user had chosen.
   */
  const effectiveSidebarOpen = (hydrated ? sidebarOpen : true) && !terminalFullscreen;
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

  /**
   * The rail's footer: the avatar and the control that opens its menu, nothing else.
   *
   * It briefly carried standalone plan and settings buttons too. That was three
   * separate targets stacked in a 64px column for destinations the menu already
   * lists — the rail is meant to be the quiet version of the sidebar, and a column
   * of buttons is not quieter than a row of them. Plan and Settings live in the
   * account menu, one tap away, where the expanded sidebar also keeps them.
   *
   * Only one of the two footers renders at a time, so the profile anchor is shared.
   */
  const railBottom = (
    <div className="xv-sidebar-rail-bottom mt-auto">
      {displayName ? (
        <div ref={profileRowRef} className="xv-sidebar-rail-profile">
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
          <ProfileQuickMenu onLogout={handleLogout} anchorRef={profileRowRef} />
        </div>
      ) : null}
    </div>
  );

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
          {/*
            Collapsed, the mark is what reopens the sidebar. The rail used to carry a
            PanelLeft button for that, and the edge toggle sat beside it — two controls,
            side by side, for one job.

            Hover only reaches a mouse, so the same handler runs on focus: the mark is a
            link and therefore already in the tab order, and opening on focus keeps the
            rail usable from the keyboard with nothing extra to find.
          */}
          <HoverTip
            label="Xroga AI"
            description={navExpanded ? 'Workspace home' : 'Hover to open the sidebar'}
            className={navExpanded ? 'shrink min-w-0' : 'shrink-0'}
          >
            <span
              onMouseEnter={openSidebarOnHover}
              onMouseLeave={cancelSidebarHover}
              onFocus={openSidebarOnHover}
              onBlur={cancelSidebarHover}
            >
              <Logo
                href={logoHref}
                height={navExpanded ? 50 : 34}
                variant={navExpanded ? 'sidebarFull' : 'sidebar'}
                className={cn(navExpanded ? 'max-w-[100px]' : '!h-[34px] !w-[34px]')}
                onClick={handleNavClick}
              />
            </span>
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
                  {/* A terminal window with a plus badge, rather than a chat bubble
                      with one — what this opens is a terminal, and the rail beside it
                      already says so with the same window. */}
                  <AnimatedIcon icon={NewTerminalIcon} size={14} intro={false} />
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
                  <AnimatedIcon icon={LocateFixedIcon} size={14} />
                </button>
              </HoverTip>
              <span className="xv-toolbar-sep" aria-hidden="true" />
              <HoverTip label="Theme" description="Choose the workspace theme.">
                <ThemeToggle />
              </HoverTip>
              {isMobile && mobileOpen ? (
                /* The same 28px borderless square as New, Search and Theme beside it.
                   Its own default is a 36px outlined button, which is right in a
                   modal and wrong in a toolbar of three smaller siblings — it sat a
                   head taller than them with a box drawn round it. */
                <ModalCloseButton onClick={closeMobile} className="xv-sidebar-head-icon" />
              ) : null}
            </div>
          ) : (
            <div className="xv-sidebar-collapsed-actions" aria-label="Workspace shortcuts">
              {/*
                Actions first, then destinations. Searching and starting a terminal are
                what the rail is reached for while working; Dashboard and Repositories
                are places to leave for, and reading them last keeps that separation.

                The two destinations carry a lighter stroke than the actions. They are
                the denser glyphs of the four — a grid and a branching tree against a
                reticle and a chevron — so at a shared weight they read as the heavy
                end of the column rather than as its equals. Dashboard's stroke now
                comes from `.xv-sidebar-collapsed-actions a` in globals.css rather than
                an attribute, because its glyph animates its own tiles and is not a
                lucide component to pass `strokeWidth` to.
              */}
              <HoverTip label="Search" description="Search projects, chats, and commands.">
                <button type="button" onClick={() => setSearchOpen(true)} aria-label="Search">
                  <AnimatedIcon icon={LocateFixedIcon} />
                </button>
              </HoverTip>
              <HoverTip label="New terminal" description="Start a fresh workspace terminal.">
                <button type="button" onClick={handleNewChat} aria-label="New Terminal">
                  <AnimatedIcon icon={NewTerminalIcon} />
                </button>
              </HoverTip>
              <HoverTip label="Dashboard" description="Recent activity, billing, plan, and usage.">
                <Link href="/dashboard" aria-label="Dashboard" onClick={handleNavClick}>
                  <AnimatedIcon icon={LayoutGridIcon} />
                </Link>
              </HoverTip>
              <HoverTip label="Repositories" description="Open connected repositories and their workspaces.">
                <Link href="/dashboard/projects" aria-label="Repositories" onClick={handleNavClick}>
                  <AnimatedIcon icon={FolderOpenIcon} />
                </Link>
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
                        <NavIcon entry={entry} />
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
                              <NavIcon entry={child} />
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
                      <NavIcon entry={entry} />
                      <span>{entry.label}</span>
                    </Link>
                  </SidebarTip>
                ),
              )}
          </div>
          <SidebarProjectHistory expanded={navExpanded} />
        </nav>
      </SidebarNavScroller> : <div className="flex-1" aria-hidden="true" />}

      {navExpanded ? bottomSection : railBottom}
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
        {/* One surface, not two. The logo and the shortcuts were separate floating
            elements at opposite ends of the screen, which read as two unrelated
            things stuck to the page rather than as the page's header. They share a
            frosted pill now — the mark on the left, the controls on the right, one
            edge around both. */}
        <div className="xv-mobile-workspace-pill">
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
            <AnimatedIcon icon={LocateFixedIcon} />
          </button>
          <button type="button" onClick={handleNewChat} aria-label="New Terminal">
            <AnimatedIcon icon={NewTerminalIcon} size={16} intro={false} />
          </button>
          {/* Theme belongs on this bar too. It lives in the sidebar's toolbar, which on
              a phone is behind the drawer — so changing the theme meant opening the
              drawer, changing it, and closing the drawer again to see the result. */}
            <ThemeToggle />
          </div>
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
        {/*
          Closing only. Reopening is the mark's job now: hovering it expands the rail,
          which is why this no longer renders while collapsed. It briefly did — the
          rail then showed this toggle beside its own PanelLeft button, two controls a
          few pixels apart doing the same thing.

          Fullscreen still hides it — there the rail is collapsed by the terminal
          rather than by the user, and leaving the sidebar is what exits fullscreen.
        */}
        {effectiveSidebarOpen ? <button
          type="button"
          onPointerDown={startEdgeToggleDrag}
          onClick={() => {
            // Swallowed when the gesture turned into a resize, so widening the
            // sidebar from its midpoint does not also collapse it on release.
            if (edgeToggleDraggedRef.current) {
              edgeToggleDraggedRef.current = false;
              return;
            }
            toggleSidebar();
            setMobileOpen(false);
          }}
          className={cn('xv-sidebar-edge-toggle hidden lg:flex', terminalFullscreen && '!hidden')}
          aria-label="Close sidebar"
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
