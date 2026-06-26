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
  Palette,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MiniActionMeter } from './MiniActionMeter';
import { Logo } from './Logo';
import { useThemeStore } from '@/store/useThemeStore';
import { useAppStore } from '@/store/useAppStore';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, emoji: '📊' },
  { href: '/dashboard/projects', label: 'My Projects', icon: FolderOpen, emoji: '📁' },
  { href: '/dashboard/chats', label: 'Chats', icon: MessageSquare, emoji: '💬' },
  { href: '/dashboard/integrations', label: 'Integrations', icon: Link2, emoji: '🔗' },
  { href: '/dashboard/billing', label: 'Billing', icon: CreditCard, emoji: '💰' },
  { href: '/settings', label: 'Settings', icon: Settings, emoji: '⚙️' },
];

interface SidebarProps {
  displayName?: string;
  email?: string;
  onTopUp?: () => void;
}

export function Sidebar({ displayName, email, onTopUp }: SidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const sidebarOpen = useThemeStore((s) => s.sidebarOpen);
  const toggleSidebar = useThemeStore((s) => s.toggleSidebar);
  const setTheme = useThemeStore((s) => s.setTheme);
  const theme = useThemeStore((s) => s.theme);
  const actions = useAppStore((s) => s.actions);
  const isFreeTrial = !actions?.planTier || actions.planTier === 'unpaid';

  const isActive = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(href));

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
              className="p-2 rounded-lg glass-panel text-[10px] font-terminal text-[var(--accent)]"
              title={`${actions?.remaining ?? 0} actions left`}
            >
              ⚡{actions?.remaining ?? 0}
            </button>
          )}
        </div>
      )}
      {isFreeTrial && (
        <Link
          href="/pricing"
          onClick={() => setMobileOpen(false)}
          className={cn(
            'flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-[var(--accent)] to-[var(--primary)] text-black text-xs font-semibold transition-transform hover:scale-[1.02]',
            sidebarOpen ? 'mx-1 px-3 py-2' : 'p-2 mx-auto w-10 h-10'
          )}
          title="Upgrade Plan"
        >
          <Rocket className="w-3.5 h-3.5 shrink-0" />
          {sidebarOpen && <span>Upgrade Plan</span>}
        </Link>
      )}
      {displayName && (
        <div className={cn('flex items-center gap-2 px-1 py-1.5', !sidebarOpen && 'justify-center')}>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--primary)] to-[var(--accent)] flex items-center justify-center text-xs font-bold text-black shrink-0">
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
    </div>
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
        <div className="p-3 border-b border-[var(--card-border)] flex items-center justify-between gap-1">
          {sidebarOpen ? (
            <Logo href="/dashboard" height={44} variant="sidebar" />
          ) : (
            <Logo href="/dashboard" height={36} variant="collapsed" />
          )}
          <button
            type="button"
            onClick={toggleSidebar}
            className="hidden lg:flex p-2 rounded-lg hover:bg-white/5 text-[var(--muted)] shrink-0"
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
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
                  : 'text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-white/5',
                !sidebarOpen && 'justify-center px-2'
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {sidebarOpen && <span>{label}</span>}
            </Link>
          ))}

          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setThemeOpen(!themeOpen);
              }}
              title="Theme"
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-white/5',
                !sidebarOpen && 'justify-center px-2'
              )}
            >
              <Palette className="w-4 h-4 shrink-0" />
              {sidebarOpen && <span>Theme</span>}
            </button>
            {themeOpen && sidebarOpen && (
              <div
                className="absolute left-full top-0 ml-2 w-48 glass-panel-strong rounded-xl p-2 z-50 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                {(['image', 'white', 'black', 'gray', 'blue-gradient'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setTheme(t);
                      setThemeOpen(false);
                    }}
                    className={cn(
                      'w-full text-left px-3 py-2 rounded-lg text-xs capitalize',
                      theme === t ? 'bg-[var(--primary)]/30 text-[var(--accent)]' : 'hover:bg-white/5'
                    )}
                  >
                    {t.replace('-', ' ')}
                  </button>
                ))}
              </div>
            )}
          </div>
        </nav>

        {bottomSection}
      </aside>
    </>
  );
}
