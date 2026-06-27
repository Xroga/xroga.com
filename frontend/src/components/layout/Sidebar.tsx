'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  FolderOpen,
  MessageSquare,
  Link2,
  CreditCard,
  Settings,
  Menu,
  X,
  PanelLeftClose,
  PanelLeft,
  Search,
  Image as ImageIcon,
  Zap,
  BarChart3,
  PieChart,
  Camera,
  Workflow,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MiniActionMeter } from './MiniActionMeter';
import { Logo } from './Logo';
import { SidebarSearchModal } from './SidebarSearchModal';
import { MediaGalleryModal } from './MediaGalleryModal';
import { HoverTip } from '@/components/ui/HoverTip';
import { useThemeStore } from '@/store/useThemeStore';
import { useAppStore } from '@/store/useAppStore';
import { createClient } from '@/lib/supabase/client';
import { api } from '@/lib/api';
import { LogoutButton, UpgradeProButton } from '@/components/ui/Uiverse';
import toast from 'react-hot-toast';

const navItems = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    tip: 'Main workspace — terminal, browser split view, and AI swarm.',
  },
  {
    href: '/dashboard/projects',
    label: 'My Projects',
    icon: FolderOpen,
    tip: 'All your websites, apps, games, and software projects.',
  },
  {
    href: '/dashboard/chats',
    label: 'Chats',
    icon: MessageSquare,
    tip: 'Conversation history with the Xroga swarm.',
  },
  {
    href: '/dashboard/automation',
    label: 'Automation',
    icon: Workflow,
    tip: 'Running, failed, and browser automations — continue or review past runs.',
  },
  {
    href: '/dashboard/spending',
    label: 'Action Spend',
    icon: PieChart,
    tip: 'See action costs per task and what fits your balance.',
  },
  {
    href: '/dashboard/analytics',
    label: 'Analytics',
    icon: BarChart3,
    tip: 'Usage stats and build analytics for your account.',
  },
  {
    href: '/dashboard/integrations',
    label: 'Integrations',
    icon: Link2,
    tip: 'Connect GitHub, Slack, databases, and 710+ tools.',
  },
  {
    href: '/dashboard/billing',
    label: 'Billing',
    icon: CreditCard,
    tip: 'Plans, invoices, and action top-ups.',
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
  onTopUp?: () => void;
}

export function Sidebar({ displayName, email, onTopUp }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const sidebarOpen = useThemeStore((s) => s.sidebarOpen);
  const setSidebarOpen = useThemeStore((s) => s.setSidebarOpen);
  const sidebarPinned = useThemeStore((s) => s.sidebarPinned);
  const toggleSidebar = useThemeStore((s) => s.toggleSidebar);
  const closeBrowser = useThemeStore((s) => s.closeBrowser);
  const actions = useAppStore((s) => s.actions);
  const profile = useAppStore((s) => s.profile);
  const setProfile = useAppStore((s) => s.setProfile);
  const avatarRef = useRef<HTMLInputElement>(null);
  const isFreeTrial = !actions?.planTier || actions.planTier === 'unpaid';
  const avatarUrl = profile?.avatar_url;
  const nameInitial = (profile?.display_name ?? displayName ?? 'U').charAt(0).toUpperCase();

  useEffect(() => {
    api.profile
      .get()
      .then((p) => setProfile(p))
      .catch(() => {});
  }, [setProfile]);

  useEffect(() => {
    document.body.classList.toggle('mobile-sidebar-open', mobileOpen);
    return () => document.body.classList.remove('mobile-sidebar-open');
  }, [mobileOpen]);

  const isActive = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(href));

  function handleNavClick() {
    setMobileOpen(false);
    closeBrowser();
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const supabase = createClient();
    const path = `avatars/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from('avatars').upload(path, file);
    if (error) {
      const reader = new FileReader();
      reader.onload = () => {
        const url = reader.result as string;
        setProfile({
          ...(profile ?? { display_name: displayName ?? '', timezone: 'UTC', language: 'en', avatar_url: '' }),
          avatar_url: url,
        });
        toast.success('Avatar updated locally');
      };
      reader.readAsDataURL(file);
      return;
    }
    const {
      data: { publicUrl },
    } = supabase.storage.from('avatars').getPublicUrl(path);
    try {
      const updated = await api.profile.update({ avatar_url: publicUrl });
      setProfile(updated);
      toast.success('Avatar updated');
    } catch {
      setProfile({
        ...(profile ?? { display_name: displayName ?? '', timezone: 'UTC', language: 'en', avatar_url: '' }),
        avatar_url: publicUrl,
      });
      toast.success('Avatar uploaded');
    }
  }

  const bottomSection = (
    <div className="p-2 border-t border-[var(--card-border)] mt-auto space-y-2">
      {onTopUp && (
        <div className={cn(!sidebarOpen && 'flex justify-center')}>
          {sidebarOpen ? (
            <MiniActionMeter onTopUp={onTopUp} />
          ) : (
            <HoverTip label="Actions left" description="Your remaining swarm actions. Click to top up.">
              <button
                type="button"
                onClick={onTopUp}
                className="p-2 rounded-lg glass-panel flex items-center gap-0.5 text-[10px] font-terminal text-[var(--accent)]"
              >
                <Zap className="w-3 h-3" />
                {actions?.remaining ?? 50}
              </button>
            </HoverTip>
          )}
        </div>
      )}
      {isFreeTrial && sidebarOpen && (
        <UpgradeProButton onClick={() => router.push('/pricing')} />
      )}
      {isFreeTrial && !sidebarOpen && (
        <HoverTip label="Upgrade Plan" description="Unlock more actions and PRO features.">
          <Link
            href="/pricing"
            onClick={() => setMobileOpen(false)}
            className="flex items-center justify-center p-2 mx-auto w-10 h-10 rounded-lg bg-[var(--foreground)] text-[var(--background)]"
          >
            <Zap className="w-4 h-4" />
          </Link>
        </HoverTip>
      )}
      <div className={cn('flex items-center justify-between gap-2 px-1 py-1.5', !sidebarOpen && 'flex-col')}>
        {displayName && (
          <div className={cn('flex items-center gap-2 min-w-0', !sidebarOpen && 'justify-center flex-col')}>
            <HoverTip label="Profile photo" description="Upload or change your avatar.">
              <button
                type="button"
                onClick={() => avatarRef.current?.click()}
                className="relative w-9 h-9 rounded-full border-2 border-[var(--accent)]/40 overflow-hidden flex items-center justify-center text-xs font-bold shrink-0 group hover:border-[var(--accent)] transition-colors"
              >
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  nameInitial
                )}
                <span className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <Camera className="w-3.5 h-3.5 text-white" />
                </span>
              </button>
            </HoverTip>
            <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
            {sidebarOpen && (
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{profile?.display_name ?? displayName}</p>
                {email && <p className="text-[10px] text-[var(--muted)] truncate">{email}</p>}
              </div>
            )}
          </div>
        )}
        <div className="xv-sidebar-logout shrink-0">
          <LogoutButton onClick={handleLogout} />
        </div>
      </div>
      {sidebarOpen && (
        <HoverTip label="About Xroga" description="Mission, CEO Muhammad Ibrahim, and what Xroga AI can do.">
          <Link
            href="/about"
            onClick={() => setMobileOpen(false)}
            className="block text-center text-[10px] text-[var(--muted)] hover:text-[var(--accent)] py-1"
          >
            About Xroga & CEO
          </Link>
        </HoverTip>
      )}
    </div>
  );

  return (
    <>
      <SidebarSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <MediaGalleryModal open={mediaOpen} onClose={() => setMediaOpen(false)} />

      <button
        type="button"
        className="lg:hidden fixed top-3.5 left-4 z-50 p-2.5 rounded-lg glass-panel"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Toggle menu"
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      <aside
        onMouseEnter={() => {
          if (window.innerWidth >= 1024 && !sidebarPinned) setSidebarOpen(true);
        }}
        onMouseLeave={() => {
          if (window.innerWidth >= 1024 && !sidebarPinned) setSidebarOpen(false);
        }}
        className={cn(
          'fixed lg:sticky top-0 z-40 flex flex-col border-r border-[var(--card-border)] glass-panel-strong min-h-screen transition-all duration-300 xv-sidebar-hover',
          sidebarOpen ? 'w-64' : 'w-[72px]',
          mobileOpen ? 'translate-x-0 w-64 z-[70]' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className="p-2 sm:p-3 border-b border-[var(--card-border)] flex items-center gap-1 min-h-[52px]">
          <HoverTip label="Xroga AI" description="Your AI Swarm Operating System — dashboard home." block className="min-w-0 flex-1">
            <div className="shrink min-w-0 flex justify-center lg:justify-start">
              <Logo
                href="/dashboard"
                height={sidebarOpen ? 40 : 28}
                variant="sidebar"
                onClick={handleNavClick}
              />
            </div>
          </HoverTip>
          {sidebarOpen && (
            <div className="flex items-center gap-0.5 shrink-0">
              <HoverTip label="Search" description="Search projects, chats, and commands.">
                <button
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-white/5 transition-colors"
                  aria-label="Search"
                >
                  <Search className="w-4 h-4" />
                </button>
              </HoverTip>
              <HoverTip label="Images & Videos" description="Browse AI-generated images and media.">
                <button
                  type="button"
                  onClick={() => setMediaOpen(true)}
                  className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-white/5 transition-colors"
                  aria-label="Images and videos"
                >
                  <ImageIcon className="w-4 h-4" />
                </button>
              </HoverTip>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              toggleSidebar();
              setMobileOpen(false);
            }}
            className="hidden lg:flex p-1.5 rounded-lg hover:bg-white/5 text-[var(--muted)] shrink-0 ml-auto"
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 p-2 overflow-y-auto">
          {sidebarOpen ? (
            <div className="xv-sidebar-menu">
              {navItems.map(({ href, label, icon: Icon, tip }) => (
                <HoverTip key={href} label={label} description={tip} block>
                  <Link href={href} onClick={handleNavClick} className={cn(isActive(href) && 'xv-active')}>
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{label}</span>
                  </Link>
                </HoverTip>
              ))}
            </div>
          ) : (
            <div className="space-y-0.5">
              {navItems.map(({ href, label, icon: Icon, tip }) => (
                <HoverTip key={href} label={label} description={tip}>
                  <Link
                    href={href}
                    onClick={handleNavClick}
                    className={cn(
                      'flex items-center justify-center p-2.5 rounded-lg text-sm transition-all',
                      isActive(href)
                        ? 'bg-white/10 text-[var(--foreground)]'
                        : 'text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-white/5'
                    )}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                  </Link>
                </HoverTip>
              ))}
            </div>
          )}
        </nav>

        {bottomSection}
      </aside>
    </>
  );
}
