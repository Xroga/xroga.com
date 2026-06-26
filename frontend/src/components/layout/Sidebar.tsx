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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MiniActionMeter } from './MiniActionMeter';
import { Logo } from './Logo';
import { SidebarSearchModal } from './SidebarSearchModal';
import { MediaGalleryModal } from './MediaGalleryModal';
import { useThemeStore } from '@/store/useThemeStore';
import { useAppStore } from '@/store/useAppStore';
import { createClient } from '@/lib/supabase/client';
import { api } from '@/lib/api';
import { LogoutButton, UpgradeProButton } from '@/components/ui/Uiverse';
import toast from 'react-hot-toast';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/projects', label: 'My Projects', icon: FolderOpen },
  { href: '/dashboard/chats', label: 'Chats', icon: MessageSquare },
  { href: '/dashboard/spending', label: 'Action Spend', icon: PieChart },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/dashboard/integrations', label: 'Integrations', icon: Link2 },
  { href: '/dashboard/billing', label: 'Billing', icon: CreditCard },
  { href: '/settings', label: 'Settings', icon: Settings },
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

  const isActive = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(href));

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
        setProfile({ ...(profile ?? { display_name: displayName ?? '', timezone: 'UTC', language: 'en', avatar_url: '' }), avatar_url: url });
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
      setProfile({ ...(profile ?? { display_name: displayName ?? '', timezone: 'UTC', language: 'en', avatar_url: '' }), avatar_url: publicUrl });
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
            <button
              type="button"
              onClick={onTopUp}
              className="p-2 rounded-lg glass-panel flex items-center gap-0.5 text-[10px] font-terminal text-[var(--accent)]"
              title={`${actions?.remaining ?? 50} actions left`}
            >
              <Zap className="w-3 h-3" />
              {actions?.remaining ?? 50}
            </button>
          )}
        </div>
      )}
      {isFreeTrial && sidebarOpen && (
        <UpgradeProButton onClick={() => router.push('/pricing')} />
      )}
      {isFreeTrial && !sidebarOpen && (
        <Link
          href="/pricing"
          onClick={() => setMobileOpen(false)}
          className="flex items-center justify-center p-2 mx-auto w-10 h-10 rounded-lg bg-[var(--foreground)] text-[var(--background)]"
          title="Upgrade Plan"
        >
          <Zap className="w-4 h-4" />
        </Link>
      )}
      <div className={cn('flex items-center justify-between gap-2 px-1 py-1.5', !sidebarOpen && 'flex-col')}>
        {displayName && (
          <div className={cn('flex items-center gap-2 min-w-0', !sidebarOpen && 'justify-center flex-col')}>
            <button
              type="button"
              onClick={() => avatarRef.current?.click()}
              className="relative w-9 h-9 rounded-full border-2 border-[var(--accent)]/40 overflow-hidden flex items-center justify-center text-xs font-bold shrink-0 group hover:border-[var(--accent)] transition-colors"
              title="Change profile photo"
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
            <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
            {sidebarOpen && (
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{profile?.display_name ?? displayName}</p>
                {email && <p className="text-[10px] text-[var(--muted)] truncate">{email}</p>}
              </div>
            )}
          </div>
        )}
        <LogoutButton onClick={handleLogout} />
      </div>
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
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
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
          mobileOpen ? 'translate-x-0 w-64' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className="p-3 border-b border-[var(--card-border)] flex items-center justify-between gap-1">
          <Logo href="/dashboard" height={sidebarOpen ? 44 : 36} variant="sidebar" />
          <button
            type="button"
            onClick={() => {
              toggleSidebar();
              setMobileOpen(false);
            }}
            className="hidden lg:flex p-2 rounded-lg hover:bg-white/5 text-[var(--muted)] shrink-0"
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
          </button>
        </div>

        <div className={cn('px-2 pt-2 flex gap-1', !sidebarOpen && 'flex-col items-center')}>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            title="Search projects & chats"
            className={cn(
              'flex items-center gap-2 rounded-lg text-sm text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-white/5 transition-colors',
              sidebarOpen ? 'flex-1 px-3 py-2' : 'p-2.5'
            )}
          >
            <Search className="w-4 h-4 shrink-0" />
            {sidebarOpen && <span className="text-xs">Search...</span>}
          </button>
          <button
            type="button"
            onClick={() => setMediaOpen(true)}
            title="Images & Videos"
            className={cn(
              'flex items-center gap-2 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-white/5 transition-colors',
              sidebarOpen ? 'px-3 py-2' : 'p-2.5'
            )}
          >
            <ImageIcon className="w-4 h-4 shrink-0" aria-hidden />
            {sidebarOpen && <span className="text-xs">Media</span>}
          </button>
        </div>

        <nav className="flex-1 p-2 overflow-y-auto">
          {sidebarOpen ? (
            <div className="xv-sidebar-menu">
              {navItems.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(isActive(href) && 'xv-active')}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{label}</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="space-y-0.5">
              {navItems.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  title={label}
                  className={cn(
                    'flex items-center justify-center p-2.5 rounded-lg text-sm transition-all',
                    isActive(href)
                      ? 'bg-white/10 text-[var(--foreground)]'
                      : 'text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-white/5'
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </nav>

        {bottomSection}
      </aside>
    </>
  );
}
