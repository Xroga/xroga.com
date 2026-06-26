'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { MiniActionMeter } from './MiniActionMeter';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { Logo } from './Logo';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/projects', label: 'Projects', icon: FolderOpen },
  { href: '/dashboard/chats', label: 'Chats', icon: MessageSquare },
  { href: '/dashboard/integrations', label: 'Integrations', icon: Link2 },
  { href: '/dashboard/billing', label: 'Billing', icon: CreditCard },
  { href: '/settings', label: 'Settings', icon: Settings },
];

interface SidebarProps {
  displayName?: string;
  onTopUp?: () => void;
}

export function Sidebar({ displayName, onTopUp }: SidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(href));

  const navContent = (
    <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
      {navItems.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          onClick={() => setMobileOpen(false)}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all',
            isActive(href)
              ? 'glass-panel border-[var(--accent)]/40 text-white text-[var(--accent)]'
              : 'text-[var(--muted)] hover:text-white hover:bg-white/5'
          )}
        >
          <Icon className="w-4 h-4" />
          {label}
        </Link>
      ))}

      <Link
        href="/pricing"
        onClick={() => setMobileOpen(false)}
        className="flex items-center justify-center gap-2 mt-4 mx-1 px-4 py-3 rounded-xl bg-gradient-to-r from-[var(--accent)] to-[var(--primary)] text-black text-sm font-semibold transition-all glow-green"
      >
        <Rocket className="w-4 h-4" />
        Upgrade
      </Link>
    </nav>
  );

  const sidebarInner = (
    <>
      <div className="p-5 border-b border-[var(--card-border)]">
        <div className="flex items-center justify-between">
          <Logo href="/dashboard" size="md" />
          <div className="lg:hidden">
            <NotificationBell />
          </div>
        </div>
        {displayName && (
          <p className="text-sm text-[var(--muted)] mt-3 truncate font-terminal">
            &gt; {displayName}
          </p>
        )}
      </div>

      {navContent}

      <div className="p-3 border-t border-[var(--card-border)] mt-auto">
        <MiniActionMeter onTopUp={onTopUp} />
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
          'fixed lg:sticky top-0 z-40 flex flex-col w-64 border-r border-[var(--card-border)] glass-panel-strong min-h-screen transition-transform lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {sidebarInner}
      </aside>
    </>
  );
}
