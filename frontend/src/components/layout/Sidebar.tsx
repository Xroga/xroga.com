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
  Ellipsis,
  MessageCirclePlus,
  Terminal,
  Rocket,
  Activity,
  TrendingUp,
  FolderGit2,
  LayoutTemplate,
  Sparkles,
  LogIn,
  UserPlus,
  Workflow,
  Library,
  CalendarClock,
  Bot,
  Package,
  History,
  Files,
  FileText,
  BookOpen,
  HardDrive,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from './Logo';
import { SidebarSearchModal } from './SidebarSearchModal';
import { SidebarProjectHistory } from './SidebarProjectHistory';
import { HoverTip } from '@/components/ui/HoverTip';
import { SidebarTip } from '@/components/ui/SidebarTip';
import { SidebarHoverMenu } from '@/components/ui/SidebarHoverMenu';
import { ProfileQuickMenu } from '@/components/ui/ProfileQuickMenu';
import { UpgradeActionButton } from '@/components/ui/UpgradeActionButton';
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
import { useProjectWorkspaceStore } from '@/store/useProjectWorkspaceStore';
import { suspendProjectWorkspacePersistence } from '@/lib/projectWorkspaceStorage';
import { useWorkspaceIdentity } from '@/components/layout/WorkspaceIdentityContext';
import { useWorkspaceAuthGate, type WorkspaceAuthGateReason } from '@/components/workspace/WorkspaceAuthGate';
import { rememberGuestAuthIntent } from '@/lib/guestWorkspace';
import { SidebarNotificationButton, SidebarNotificationCenter } from '@/components/notifications/SidebarNotificationCenter';

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
  planned?: boolean;
};

type NavGroup = {
  id: string;
  label: string;
  icon: typeof LayoutDashboard;
  animated?: AnimatedIconComponent;
  tip: string;
  motion?: NavIconMotion;
  children: NavLink[];
  newSection?: boolean;
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
  { href: '/workspace', motion: 'blink' as const, label: 'Workspace', icon: Terminal, animated: TerminalIcon, tip: 'Main workspace — build and chat with Xroga AI.' },
  { href: '/dashboard', motion: 'pulse' as const, label: 'Dashboard', icon: LayoutDashboard, animated: LayoutGridIcon, tip: 'Recent activity, billing, plan, and usage.' },
  { href: '/dashboard/projects', motion: 'flip' as const, label: 'Projects', icon: FolderGit2, animated: FolderOpenIcon, tip: 'Open connected repositories and their workspaces.' },
  { href: '/dashboard/integrations', motion: 'pulse' as const, label: 'Plugins', icon: Link2, animated: ConnectIcon, tip: 'Connect GitHub, Slack, databases, and tools.' },
  {
    id: 'automations', label: 'Automations', icon: Workflow, newSection: true,
    tip: 'Workflows, scheduling, AI Employees, and work packs are coming soon.',
    children: [
      { href: '#', label: 'Workflows', icon: Workflow, tip: 'Coming soon · Connected workflows', planned: true },
      { href: '#', label: 'Scheduled Tasks', icon: CalendarClock, tip: 'Coming soon · Repeated work', planned: true },
      { href: '#', label: 'AI Employees', icon: Bot, tip: 'Coming soon · Specialist workers', planned: true },
      { href: '#', label: 'Work Packs', icon: Package, tip: 'Coming soon · Reusable work', planned: true },
      { href: '#', label: 'Run History', icon: History, tip: 'Coming soon · Unified automation history', planned: true },
    ],
  },
  {
    id: 'library', label: 'Library', icon: Library, newSection: true,
    tip: 'Files, artifacts, skills and Xroga Drive will arrive here.',
    children: [
      { href: '#', label: 'My Files', icon: Files, tip: 'Coming soon · Stored files', planned: true },
      { href: '#', label: 'Artifacts', icon: FileText, tip: 'Coming soon · Saved deliverables', planned: true },
      { href: '/showcase', label: 'Templates', icon: LayoutTemplate, tip: 'Browse existing Xroga templates.' },
      { href: '#', label: 'Skills', icon: BookOpen, tip: 'Coming soon · Reusable capabilities', planned: true },
      { href: '#', label: 'Xroga Drive', icon: HardDrive, tip: 'Coming soon · Persistent personal storage', planned: true },
    ],
  },
  { href: '/dashboard/publish', motion: 'launch' as const, label: 'Publish', icon: Rocket, animated: RocketIcon, tip: 'Ship web, extensions, desktop and mobile through your accounts.' },
  {
    id: 'more', label: 'More', icon: Ellipsis, tip: 'Operations, growth, settings and community.',
    children: [
      { href: '/dashboard/operations', label: 'Operations', icon: Activity, animated: HeartPulseIcon, tip: 'Releases, health and approvals.' },
      { href: '/dashboard/growth', label: 'Growth', icon: TrendingUp, animated: ChartColumnIncreasingIcon, tip: 'Campaigns, experiments and attribution.' },
      { href: '/settings', label: 'Settings', icon: Settings, animated: CogIcon, tip: 'Theme, account and preferences.' },
      { href: '/features', label: 'Explore', icon: Compass, animated: TelescopeIcon, tip: 'Explore what Xroga can do.' },
      { href: '/showcase', label: 'Showcase', icon: LayoutTemplate, animated: AirplayIcon, tip: 'Explore reusable product templates.' },
      { href: '/community', label: 'Community', icon: MessageCirclePlus, animated: UsersRoundIcon, tip: 'Connect with other builders.' },
      { href: '/community?compose=feedback', label: 'Share Feedback', icon: MessageSquarePlus, animated: SmileIcon, tip: 'Tell us what can improve.' },
    ],
  },
];

interface SidebarProps {
  displayName?: string;
  email?: string;
}

function guestGateReasonForHref(href: string): WorkspaceAuthGateReason | null {
  // Navigation is intentionally public: guests can inspect every product area.
  // Account-bound actions inside those destinations own their own auth gates.
  // Keeping this helper makes that policy explicit at the single navigation seam.
  void href;
  return null;
}

function planLabel(tier?: string | null) {
  if (!tier || tier === 'unpaid' || tier === 'free') return 'Free';
  return 'Xroga Pro';
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

export function Sidebar({ displayName, email }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const workspaceIdentity = useWorkspaceIdentity();
  const isGuest = workspaceIdentity.status === 'guest';
  const { requestAuthGate } = useWorkspaceAuthGate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
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
  const userName = incognito
    ? 'Incognito'
    : isGuest
      ? 'Guest workspace'
      : (profile?.display_name ?? displayName ?? 'User');
  const userPlan = incognito
    ? 'Temporary session'
    : isGuest
      ? 'Preview session'
      : planLabel(planTier);

  // A pending hover-to-open must not fire into a sidebar that is no longer mounted —
  // navigating away mid-hover would otherwise leave the timer to run and set state on
  // a dead component.
  useEffect(() => () => {
    if (hoverOpenTimerRef.current !== null) clearTimeout(hoverOpenTimerRef.current);
  }, []);

  useEffect(() => {
    if (!isGuest || !searchOpen) return;
    setSearchOpen(false);
    requestAuthGate('history');
  }, [isGuest, searchOpen, requestAuthGate]);

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
      : 'var(--xv-boot-sidebar-width, 232px)'
    : 64;
  const navExpanded = isMobile ? mobileOpen : effectiveSidebarOpen;

  function closeMobile() {
    setMobileOpen(false);
  }

  if (incognito) {
    return (
      <>
        <SidebarSearchModal open={searchOpen && !isGuest} onClose={() => setSearchOpen(false)} />
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

  const isActive = (href: string) => {
    if (href === '/workspace') return pathname === '/workspace';
    if (href === '/dashboard') return pathname === '/dashboard' || pathname === '/dashboard/';
    const [path] = href.split('?');
    if (pathname !== path && !pathname.startsWith(`${path}/`)) return false;
    return true;
  };

  const groupHasActive = (group: NavGroup) => group.children.some((c) => !c.planned && isActive(c.href));
  function handleNavClick() {
    closeMobile();
    closeBrowser();
  }

  function handleNavEntryClick(
    event: React.MouseEvent<HTMLAnchorElement>,
    href: string,
  ) {
    const gateReason = guestGateReasonForHref(href);
    if (isGuest && gateReason) {
      event.preventDefault();
      event.stopPropagation();
      handleNavClick();
      requestAuthGate(gateReason);
      return;
    }
    handleNavClick();
  }

  /** Planned capabilities are information, not links to fictional services. */
  function renderMenuChild(child: NavLink) {
    if (child.planned) return (
      <div role="menuitem" aria-disabled="true" className="xv-sidebar-hover-menu__item xv-sidebar-hover-menu__planned">
        <span className="xv-sidebar-hover-menu__icon"><NavIcon entry={child} /></span>
        <span className="min-w-0 flex-1"><strong>{child.label}</strong><small>{child.tip}</small></span>
        <span className="xv-sidebar-soon">Soon</span>
      </div>
    );
    return (
      <Link href={child.href} role="menuitem"
        onClick={(event) => handleNavEntryClick(event, child.href)}
        className={cn('xv-sidebar-hover-menu__item', isActive(child.href) && 'is-active')}>
        <span className="xv-sidebar-hover-menu__icon"><NavIcon entry={child} /></span>
        <span className="min-w-0"><strong>{child.label}</strong><small>{child.tip}</small></span>
      </Link>
    );
  }

  function handleNewChat() {
    if (isGuest) {
      handleNavClick();
      requestAuthGate('history');
      return;
    }
    // Fresh blank workspace; prior #N is flushed to permanent storage inside startNewChat.
    startNewChat();
    // A new terminal is a clean composition state, not a blank transcript squeezed
    // beside the previous project's editor. Closing Project edits also releases its
    // resize seam before the centered starter composer appears.
    useProjectWorkspaceStore.getState().setWorkspaceOpen(false);
    handleNavClick();
    router.push('/workspace');
    // Signal the composer after the task reset. The canonical project stays selected;
    // users clear it only through the separate "New product" control.
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('xroga-request-new-terminal'));
    }, 80);
  }

  async function handleLogout() {
    const supabase = createClient();
    // Stop the async persisted workspace from writing the previous account back after
    // cache deletion. Clear both memory and storage before the auth boundary changes.
    suspendProjectWorkspacePersistence();
    useProjectWorkspaceStore.getState().resetForAccountBoundary();
    await useProjectWorkspaceStore.persist.clearStorage();
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
      {isGuest ? (
        <div className="flex flex-col items-center gap-1.5">
          <HoverTip label="Create account" description="Save this guest conversation and unlock the full workspace.">
            <Link
              href="/auth/signup?next=%2Fworkspace"
              onClick={() => rememberGuestAuthIntent('history')}
              aria-label="Create free account"
              className="grid h-9 w-9 place-items-center rounded-xl bg-[linear-gradient(135deg,#006aff,#68a7ff)] text-white shadow-[0_8px_20px_rgba(0,106,255,0.22)] transition hover:-translate-y-0.5"
            >
              <UserPlus className="h-4 w-4" aria-hidden="true" />
            </Link>
          </HoverTip>
          <HoverTip label="Sign in" description="Sign in and keep this guest conversation.">
            <Link
              href="/auth/login?next=%2Fworkspace"
              onClick={() => rememberGuestAuthIntent('history')}
              aria-label="Sign in"
              className="grid h-9 w-9 place-items-center rounded-xl border border-[var(--card-border)] bg-[var(--foreground)]/[0.035] text-[var(--foreground)] transition hover:bg-[var(--foreground)]/[0.08]"
            >
              <LogIn className="h-4 w-4" aria-hidden="true" />
            </Link>
          </HoverTip>
        </div>
      ) : displayName ? (
        <div ref={profileRowRef} className="xv-sidebar-rail-profile">
          {incognito ? (
            <IncognitoProfileBox size="sidebar" />
          ) : (
            <UserProfileBox
              url={avatarUrl}
              initial={nameInitial}
              size="sidebarCompact"
              onClick={() => setAvatarPickerOpen(true)}
            />
          )}
          <ProfileQuickMenu onLogout={handleLogout} anchorRef={profileRowRef} displayName={userName} email={email} />
        </div>
      ) : null}
    </div>
  );

  const bottomSection = (
    <div className="p-2 mt-auto space-y-2 xv-sidebar-bottom">
      {isGuest && navExpanded ? (
        <div className="rounded-[16px] border border-[var(--card-border)] bg-[var(--foreground)]/[0.025] p-2.5 shadow-[0_10px_28px_rgba(0,0,0,0.05)]">
          <button
            type="button"
            onClick={() => requestAuthGate('history')}
            className="group flex w-full items-center gap-2.5 rounded-[12px] px-1 py-1 text-left transition hover:bg-[var(--foreground)]/[0.045] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006aff]/45"
            aria-label="Open guest account options"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#006aff]/10 text-[#006aff] transition group-hover:bg-[#006aff]/15">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold text-[var(--foreground)]">Guest preview</span>
              <span className="block truncate text-[9px] text-[var(--muted)]">Click to save this chat and unlock Xroga.</span>
            </span>
            <span className="text-[14px] leading-none text-[#006aff] transition-transform group-hover:translate-x-0.5" aria-hidden="true">›</span>
          </button>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <Link
              href="/auth/login?next=%2Fworkspace"
              onClick={() => rememberGuestAuthIntent('history')}
              className="flex min-h-10 items-center justify-center gap-1.5 rounded-[11px] border border-[var(--card-border)] bg-[var(--foreground)]/[0.025] px-2 text-[11px] font-semibold text-[var(--foreground)] transition hover:bg-[var(--foreground)]/[0.07]"
            >
              <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
              Sign in
            </Link>
            <Link
              href="/auth/signup?next=%2Fworkspace"
              onClick={() => rememberGuestAuthIntent('history')}
              className="flex min-h-10 items-center justify-center gap-1.5 rounded-[11px] bg-[linear-gradient(135deg,#006aff,#68a7ff)] px-2 text-[11px] font-bold text-white shadow-[0_8px_20px_rgba(0,106,255,0.2)] transition hover:-translate-y-px"
            >
              <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
              Sign up
            </Link>
          </div>
        </div>
      ) : displayName && navExpanded ? (
        <div ref={profileRowRef} className="xv-sidebar-profile-row flex items-center gap-2 px-2 py-1.5 rounded-xl">
          {incognito ? (
            <IncognitoProfileBox size="sidebar" />
          ) : (
          <UserProfileBox
            url={avatarUrl}
            initial={nameInitial}
            size="sidebarCompact"
            onClick={() => setAvatarPickerOpen(true)}
          />
          )}
          <ProfileQuickMenu onLogout={handleLogout} anchorRef={profileRowRef} displayName={userName} email={email}>
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-[12px] font-medium leading-tight xv-sidebar-profile-name">{userName}</span>
              {userPlan === 'Free' ? (
                <UpgradeActionButton compact />
              ) : (
                <span className="block truncate text-[10px] xv-sidebar-profile-plan">{userPlan}</span>
              )}
            </span>
            <span className="xv-profile-menu-caret" aria-hidden="true">›</span>
          </ProfileQuickMenu>
        </div>
      ) : null}
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
              {navExpanded ? (
                <Logo
                  href={logoHref}
                  height={42}
                  variant="sidebarFull"
                  className="!h-[42px] !w-[112px]"
                  onClick={handleNavClick}
                />
              ) : (
                <Logo
                  href={logoHref}
                  height={44}
                  variant="sidebar"
                  className="!h-11 !w-11"
                  onClick={handleNavClick}
                />
              )}
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
                  {/* The label carries a class of its own because the rules that hide
                      it target a span, and `AnimatedIcon` wraps its glyph in one too. */}
<span className="xv-new-terminal-compact__label">
  New terminal
</span>                </button>
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
              {isMobile && mobileOpen && !isGuest && !incognito ? (
                /* Keep the bell directly beside the drawer close control on phones. */
                <SidebarNotificationButton open={notificationsOpen} onToggle={() => setNotificationsOpen((value) => !value)} />
              ) : null}
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
              <HoverTip label="Workspace" description="Return to the active workspace terminal.">
                <Link
                  href="/workspace"
                  aria-label="Workspace"
                  onClick={handleNavClick}
                  className={cn(isActive('/workspace') && 'is-active')}
                >
                  <AnimatedIcon icon={TerminalIcon} />
                </Link>
              </HoverTip>
              <HoverTip label="New terminal" description="Start a fresh workspace terminal.">
                <button type="button" onClick={handleNewChat} aria-label="New Terminal">
                  <AnimatedIcon icon={NewTerminalIcon} />
                </button>
              </HoverTip>
              <HoverTip label="Search" description="Search projects, chats, and commands.">
                <button type="button" onClick={() => setSearchOpen(true)} aria-label="Search">
                  <AnimatedIcon icon={LocateFixedIcon} />
                </button>
              </HoverTip>
              <HoverTip label="Dashboard" description="Recent activity, billing, plan, and usage.">
                <Link
                  href="/dashboard"
                  aria-label="Dashboard"
                  onClick={(event) => handleNavEntryClick(event, '/dashboard')}
                  className={cn(isActive('/dashboard') && 'is-active')}
                >
                  <AnimatedIcon icon={LayoutGridIcon} />
                </Link>
              </HoverTip>
              <HoverTip label="Projects" description="Open connected repositories and their workspaces.">
                <Link
                  href="/dashboard/projects"
                  aria-label="Projects"
                  onClick={(event) => handleNavEntryClick(event, '/dashboard/projects')}
                  className={cn(isActive('/dashboard/projects') && 'is-active')}
                >
                  <AnimatedIcon icon={FolderOpenIcon} />
                </Link>
              </HoverTip>
              <HoverTip label="Integrations" description="Connect GitHub, Vercel, and other tools.">
                <Link
                  href="/dashboard/integrations"
                  aria-label="Integrations"
                  onClick={(event) => handleNavEntryClick(event, '/dashboard/integrations')}
                  className={cn(isActive('/dashboard/integrations') && 'is-active')}
                >
                  <AnimatedIcon icon={ConnectIcon} />
                </Link>
              </HoverTip>
              <HoverTip label="Theme" description="Choose the workspace theme.">
                <ThemeToggle placement="right-start" />
              </HoverTip>
              {!isGuest && !incognito && <SidebarNotificationButton open={notificationsOpen} onToggle={() => { if (!effectiveSidebarOpen) toggleSidebar(); setNotificationsOpen((value) => !value); }} compact />}
            </div>
          )}
        </div>

      </div>

      {navExpanded && notificationsOpen ? <SidebarNotificationCenter open onClose={() => setNotificationsOpen(false)} /> : navExpanded ? <SidebarNavScroller targetRef={navScrollRef} className="flex-1 min-h-0">
        <nav
          ref={navScrollRef}
          className="xv-sidebar-nav-scroll h-full p-2 overflow-y-auto overflow-x-hidden min-h-0"
        >
          <div className="xv-sidebar-menu xv-sidebar-nav-v2">
              {navItems.map((entry) =>
                isGroup(entry) && entry.id === 'more' ? (
                  <SidebarHoverMenu
                    key={entry.id}
                    trigger={
                      <button type="button" className={cn('xv-nav-group__trigger xv-explore-trigger', groupHasActive(entry) && 'xv-active')} aria-label="More">
                        <Ellipsis className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>More</span>
                      </button>
                    }
                  >
                    <div className="xv-sidebar-hover-menu__card xv-sidebar-compact-flyout">
                      {entry.children.map((child, index) => (
                        <div key={child.label}>
                          {index === 0 ? <p className="xv-sidebar-hover-menu__eyebrow">OPERATIONS &amp; GROWTH</p> : null}
                          {index === 3 ? <p className="xv-sidebar-hover-menu__eyebrow xv-sidebar-menu-divider">DISCOVER</p> : null}
                          {renderMenuChild(child)}
                        </div>
                      ))}
                    </div>
                  </SidebarHoverMenu>
                ) : isGroup(entry) ? (
                  <SidebarHoverMenu
                    key={entry.id}
                    trigger={
                      <button type="button" className={cn('xv-nav-group__trigger', groupHasActive(entry) && 'xv-active')} aria-label={entry.label}>
                        <NavIcon entry={entry} />
                        <span>{entry.label}</span>
                        {entry.newSection ? <span className="xv-sidebar-new-badge">NEW</span> : null}
                        <ChevronDown className="xv-nav-group__chev h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    }
                  >
                    <div className="xv-sidebar-hover-menu__card xv-sidebar-compact-flyout">
                      <p className="xv-sidebar-hover-menu__eyebrow">{entry.label} · {entry.newSection ? 'COMING SOON' : 'MENU'}</p>
                      {entry.children.map((child) => <div key={child.label}>{renderMenuChild(child)}</div>)}
                    </div>
                  </SidebarHoverMenu>
                ) : (
                  <SidebarTip key={entry.href} label={entry.label} description={entry.tip}>
                    <Link href={entry.href}
                      onClick={(event) => handleNavEntryClick(event, entry.href)}
                      className={cn(isActive(entry.href) && 'xv-active')}>
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
  style={{ width: asideWidth }}
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
        {effectiveSidebarOpen && !isGuest && !incognito && !terminalFullscreen ? (
          <div className="xv-sidebar-notification-edge hidden lg:flex">
            <SidebarNotificationButton open={notificationsOpen} onToggle={() => setNotificationsOpen((value) => !value)} compact />
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
