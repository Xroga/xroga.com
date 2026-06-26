'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MiniActionMeter } from './MiniActionMeter';
import { Logo } from './Logo';
import { SidebarSearchModal } from './SidebarSearchModal';
import { MediaGalleryModal } from './MediaGalleryModal';
import { useThemeStore } from '@/store/useThemeStore';
import { useAppStore } from '@/store/useAppStore';
import { createClient } from '@/lib/supabase/client';
import { LogoutButton, GradientStartButton } from '@/components/ui/Uiverse';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/projects', label: 'My Projects', icon: FolderOpen },
  { href: '/dashboard/chats', label: 'Chats', icon: MessageSquare },
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
  const toggleSidebar = useThemeStore((s) => s.toggleSidebar);
  const actions = useAppStore((s) => s.actions);
  const isFreeTrial = !actions?.planTier || actions.planTier === 'unpaid';

  const isActive = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(href));

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
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
        <div className="mx-1">
          <GradientStartButton className="w-full text-sm" onClick={() => router.push('/pricing')}>
            Upgrade Plan
          </GradientStartButton>
        </div>
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
          <div className={cn('flex items-center gap-2 min-w-0', !sidebarOpen && 'justify-center')}>
            <div className="w-8 h-8 rounded-full border border-[var(--card-border)] flex items-center justify-center text-xs font-bold shrink-0">
              {displayName.charAt(0).toUpperCase()}
            </div>
            {sidebarOpen && (
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{displayName}</p>
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
        className={cn(
          'fixed lg:sticky top-0 z-40 flex flex-col border-r border-[var(--card-border)] glass-panel-strong min-h-screen transition-all duration-300',
          sidebarOpen ? 'w-64' : 'w-[72px]',
          mobileOpen ? 'translate-x-0 w-64' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className="p-3 border-b border-[var(--card-border)] flex items-center justify-between gap-1">
          <Logo href="/dashboard" height={sidebarOpen ? 44 : 36} variant="sidebar" />
          <button
            type="button"
            onClick={toggleSidebar}
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
