'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FolderOpen,
  MessageSquare,
  BarChart3,
  Link2,
  CreditCard,
  Settings,
  Shield,
  Rocket,
  Zap,
  Menu,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { MiniActionMeter } from './MiniActionMeter';
import { NotificationBell } from '@/components/notifications/NotificationBell';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, emoji: '🔥' },
  { href: '/dashboard/projects', label: 'My Projects', icon: FolderOpen, emoji: '📁' },
  { href: '/dashboard/chats', label: 'Active Chats', icon: MessageSquare, emoji: '💬' },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3, emoji: '📊' },
  { href: '/dashboard/integrations', label: 'Integrations', icon: Link2, emoji: '🔗' },
  { href: '/dashboard/billing', label: 'Billing', icon: CreditCard, emoji: '💰' },
  { href: '/settings', label: 'Settings', icon: Settings, emoji: '⚙️' },
  { href: '/dashboard/security', label: 'Security', icon: Shield, emoji: '🛡️' },
];

interface SidebarProps {
  displayName?: string;
}

export function Sidebar({ displayName }: SidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(href));

  const navContent = (
    <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
      {navItems.map(({ href, label, icon: Icon, emoji }) => (
        <Link
          key={href}
          href={href}
          onClick={() => setMobileOpen(false)}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all',
            isActive(href)
              ? 'bg-gradient-to-r from-violet-600/30 to-cyan-600/20 text-white border border-violet-500/40 shadow-lg shadow-violet-500/10'
              : 'text-[var(--muted)] hover:text-white hover:bg-white/5'
          )}
        >
          <span className="text-base w-5 text-center" aria-hidden>{emoji}</span>
          <Icon className="w-4 h-4 opacity-70" />
          {label}
        </Link>
      ))}

      <Link
        href="/dashboard/upgrade"
        onClick={() => setMobileOpen(false)}
        className="flex items-center justify-center gap-2 mt-4 mx-1 px-4 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-sm font-semibold transition-all shadow-lg shadow-violet-500/25"
      >
        <Rocket className="w-4 h-4" />
        🚀 Upgrade
      </Link>
    </nav>
  );

  const sidebarInner = (
    <>
      <div className="p-5 border-b border-[var(--card-border)]">
        <div className="flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-cyan-500 flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold gradient-text">Xroga</span>
          </Link>
          <div className="lg:hidden">
            <NotificationBell />
          </div>
        </div>
        {displayName && (
          <p className="text-sm text-[var(--muted)] mt-2 truncate">Welcome, {displayName}</p>
        )}
      </div>

      {navContent}

      <div className="p-3 border-t border-[var(--card-border)] mt-auto">
        <MiniActionMeter />
      </div>
    </>
  );

  return (
    <>
      <button
        type="button"
        className="lg:hidden fixed top-4 left-4 z-50 p-2.5 rounded-lg bg-[var(--card)] border border-[var(--card-border)] shadow-lg"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Toggle menu"
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          'fixed lg:sticky top-0 z-40 flex flex-col w-64 border-r border-[var(--card-border)] bg-[var(--card)] min-h-screen transition-transform lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {sidebarInner}
      </aside>
    </>
  );
}
