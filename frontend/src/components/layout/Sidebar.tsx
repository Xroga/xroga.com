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
  Sparkles,
  LogIn,
  UserPlus,
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
import { useProjectWorkspaceStore } from '@/store/useProjectWorkspaceStore';
import { suspendProjectWorkspacePersistence } from '@/lib/projectWorkspaceStorage';
import { useWorkspaceIdentity } from '@/components/layout/WorkspaceIdentityContext';
import { useWorkspaceAuthGate, type WorkspaceAuthGateReason } from '@/components/workspace/WorkspaceAuthGate';
import { rememberGuestAuthIntent } from '@/lib/guestWorkspace';

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
    label: 'Projects',
    icon: FolderGit2,
    animated: FolderOpenIcon,
    tip: 'Open connected repositories, projects, and their durable Xroga workspaces.',
  },
  {
    href: '/dashboard/integrations',
    motion: 'pulse' as const,
    label: 'Plugins',
    icon: Link2,
    animated: ConnectIcon,
    tip: 'Connect apps, developer tools, and services Xroga can work with.',
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

function guestGateReasonForHref(href: string): WorkspaceAuthGateReason | null {
  const path = href.split('?')[0];
  if (path === '/workspace' || path === '/showcase' || path === '/community' || path === '/pricing') {
    return null;
  }
  if (path === '/dashboard/integrations') return 'integration';
  if (path === '/dashboard/projects') return 'project';
  if (path === '/dashboard/publish') return 'deploy';
  if (path === '/settings') return 'settings';
  if (path === '/dashboard') return 'dashboard';
  return path.startsWith('/dashboard/') ? 'dashboard' : null;
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

export function Sidebar({ displayName }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const workspaceIdentity = useWorkspaceIdentity();
  const isGuest = workspaceIdentity.status === 'guest';
  const { requestAuthGate } = useWorkspaceAuthGate();
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
      : 'var(--xv-boot-sidebar-width, 248px)'
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

  const toggleGroup = (id: string) =>
    setOpenGroups((current) => ({ ...current, [id]: !(current[id] ?? false) }));

  const isActive = (href: string) => {
    if (href === '/workspace') return pathname === '/workspace';
    if (href === '/dashboard') return pathname === '/dashboard' || pathname === '/dashboard/';
    const [path] = href.split('?');
    if (pathname !== path && !pathname.startsWith(`${path}/`)) return false;
    return true;
  };
