'use client';

import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from './Logo';
import { SidebarSearchModal } from './SidebarSearchModal';
import { SidebarProjectHistory } from './SidebarProjectHistory';
import { HoverTip } from '@/components/ui/HoverTip';
import { SidebarTip } from '@/components/ui/SidebarTip';
import { ProfileQuickMenu } from '@/components/ui/ProfileQuickMenu';
import { DownloadAppButton } from '@/components/ui/DownloadAppButton';
import { SidebarCommunityButton } from '@/components/layout/SidebarCommunityButton';
import { useThemeStore } from '@/store/useThemeStore';
import { useAppStore } from '@/store/useAppStore';
import { createClient } from '@/lib/supabase/client';
import { api } from '@/lib/api';
import { UpgradeProButton } from '@/components/ui/Uiverse';
import { AvatarPickerModal } from '@/components/profile/AvatarPickerModal';
import { UserProfileBox } from '@/components/profile/UserProfileBox';
import { useAvatarUpdate } from '@/hooks/useAvatarUpdate';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { usePrivacyStore } from '@/store/usePrivacyStore';
import { useHydrated } from '@/hooks/useHydrated';
import { IncognitoProfileBox } from '@/components/incognito/IncognitoProfileBox';
import { GALACTIC_PLANS } from '@/lib/plans';
import { ModalCloseButton } from '@/components/ui/ConfirmDeleteModal';

const navItems = [
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
    tip: 'Recent activity, billing, and plan overview.',
  },
  {
    href: '/dashboard/integrations',
    label: 'Integrations',
    icon: Link2,
    tip: 'Connect GitHub, Slack, databases, and tools.',
  },
  {
    href: '/dashboard/publish',
    label: 'Publish',
    icon: Rocket,
    tip: 'Ship web on your Vercel; mobile stores via your Expo/Apple/Google accounts.',
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
  if (!tier || tier === 'unpaid') return 'Free Trial';
  const plan = GALACTIC_PLANS.find((p) => p.tier === tier);
  return plan ? `${plan.name} Plan` : `${tier.charAt(0).toUpperCase()}${tier.slice(1)} Plan`;
}

export function Sidebar({ displayName }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
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

  const isActive = (href: string) => {
    if (href === '/workspace') return pathname === '/workspace';
    if (href === '/dashboard') return pathname === '/dashboard' || pathname === '/dashboard/';
    return pathname === href || pathname.startsWith(`${href}/`);
  };

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
    router.push('/');
    router.refresh();
  }

  const logoHref = pathname.startsWith('/dashboard') ? '/dashboard' : '/workspace';

  const bottomSection = (
    <div className="p-2 mt-auto space-y-2 xv-sidebar-bottom">
      <SidebarCommunityButton expanded={navExpanded} />
      {navExpanded && (
        <div className="flex items-stretch gap-1.5">
          <div className="flex-1 min-w-0">
            <UpgradeProButton onClick={() => router.push('/pricing')} />
          </div>
          <DownloadAppButton variant="row" className="self-center" />
        </div>
      )}
      {!navExpanded && !isMobile && (
        <div className="flex flex-col items-center gap-1">
          <HoverTip label="Upgrade Plan" description="View plans and upgrade your subscription.">
            <Link
              href="/pricing"
              onClick={() => setMobileOpen(false)}
              className="flex items-center justify-center p-2 mx-auto w-10 h-10 rounded-lg bg-[var(--foreground)] text-[var(--background)]"
            >
              <Zap className="w-4 h-4" />
            </Link>
          </HoverTip>
          <HoverTip label="Download app" description="Launch soon">
            <DownloadAppButton variant="icon" />
          </HoverTip>
        </div>
      )}
      {displayName && navExpanded && (
        <div ref={profileRowRef} className="xv-sidebar-profile-row flex items-center gap-2.5 px-2.5 py-2 rounded-xl">
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
            <p className="text-sm font-medium xv-sidebar-profile-name truncate leading-tight">{userName}</p>
            <p className="text-xs xv-sidebar-profile-plan truncate">{userPlan}</p>
          </div>
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

      <nav ref={navScrollRef} className="flex-1 p-2 overflow-y-auto overflow-x-hidden min-h-0">
        {navExpanded ? (
          <div className="xv-sidebar-menu">
            {navItems.map(({ href, label, icon: Icon, tip }) => (
              <SidebarTip key={href} label={label} description={tip}>
                <Link href={href} onClick={handleNavClick} className={cn(isActive(href) && 'xv-active')}>
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{label}</span>
                </Link>
              </SidebarTip>
            ))}
          </div>
        ) : (
          <div className="xv-sidebar-collapsed-nav space-y-1">
            {navItems.map(({ href, label, icon: Icon, tip }) => (
              <SidebarTip key={href} label={label} description={tip}>
                <Link
                  href={href}
                  onClick={handleNavClick}
                  className={cn('xv-sidebar-icon-link', isActive(href) && 'xv-active')}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                </Link>
              </SidebarTip>
            ))}
          </div>
        )}
        <SidebarProjectHistory expanded={navExpanded} />
      </nav>

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
            <aside className="fixed top-0 left-0 z-[100] flex flex-col w-[min(88vw,320px)] max-w-[320px] h-[100dvh] pt-[env(safe-area-inset-top)] border-r border-[var(--card-border)] glass-panel-strong overflow-hidden shadow-2xl xv-sidebar-mobile-open">
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
        style={{ left: sidebarOpen ? asideWidth : 0 }}
      >
        {sidebarOpen ? (
          <PanelLeftClose className="w-3.5 h-3.5" />
        ) : (
          <PanelLeft className="w-3.5 h-3.5" />
        )}
      </button>

      <div className="xv-sidebar-root hidden lg:block shrink-0" style={{ width: asideWidth }}>
        <aside
          style={{ width: asideWidth }}
          className={cn(
            'sticky top-0 z-40 border-r border-[var(--card-border)] glass-panel-strong min-h-screen transition-[width,opacity] duration-200 xv-sidebar-hover shrink-0 relative overflow-hidden',
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
