'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  LayoutDashboard,
  FolderOpen,
  MessageSquare,
  Link2,
  CreditCard,
  Settings,
  Rocket,
  Menu,
  X,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MiniActionMeter } from './MiniActionMeter';
import { Logo } from './Logo';
import { useThemeStore } from '@/store/useThemeStore';

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
  const [mobileOpen, setMobileOpen] = useState(false);
  const sidebarOpen = useThemeStore((s) => s.sidebarOpen);
  const toggleSidebar = useThemeStore((s) => s.toggleSidebar);

  const isActive = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(href));

  const navContent = (
    <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
      {navItems.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          onClick={() => setMobileOpen(false)}
          title={!sidebarOpen ? label : undefined}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all',
            isActive(href)
              ? 'glass-panel border-[var(--accent)]/40 text-[var(--accent)]'
              : 'text-[var(--muted)] hover:text-white hover:bg-white/5',
            !sidebarOpen && 'justify-center px-2'
          )}
        >
          <Icon className="w-4 h-4 shrink-0" />
          {sidebarOpen && <span>{label}</span>}
        </Link>
      ))}

      {sidebarOpen && (
        <Link
          href="/pricing"
          onClick={() => setMobileOpen(false)}
          className="flex items-center justify-center gap-2 mt-4 mx-1 px-4 py-3 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--primary)] text-black text-sm font-semibold glow-frozen"
        >
          <Rocket className="w-4 h-4" />
          Upgrade
        </Link>
      )}
    </nav>
  );

  const sidebarInner = (
    <>
      <div className="p-4 border-b border-[var(--card-border)] flex items-center justify-between gap-2">
        {sidebarOpen ? <Logo href="/dashboard" height={44} /> : <Logo href="/dashboard" height={36} />}
        <button
          type="button"
          onClick={toggleSidebar}
          className="hidden lg:flex p-2 rounded-lg hover:bg-white/5 text-[var(--muted)]"
          aria-label="Toggle sidebar"
        >
          {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
        </button>
      </div>

      {navContent}

      <div className="p-3 border-t border-[var(--card-border)] mt-auto space-y-3">
        {sidebarOpen && onTopUp && <MiniActionMeter onTopUp={onTopUp} />}
        {displayName && sidebarOpen && (
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[var(--primary)] to-[var(--accent)] flex items-center justify-center text-sm font-bold text-black shrink-0">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{displayName}</p>
              {email && <p className="text-xs text-[var(--muted)] truncate">{email}</p>}
            </div>
          </div>
        )}
      </div>
    </>
  );

  return (
    <>
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
        {sidebarInner}
      </aside>
    </>
  );
}
