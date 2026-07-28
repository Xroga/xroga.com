'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, FolderGit2, Gauge, LayoutDashboard, Link2, Rocket, Settings, Terminal, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

const items = [
  { href: '/workspace', label: 'Workspace', icon: Terminal },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/projects', label: 'Repositories', icon: FolderGit2 },
  { href: '/dashboard/integrations', label: 'Integrations', icon: Link2 },
  { href: '/dashboard/publish', label: 'Publish', icon: Rocket },
  { href: '/dashboard/operations', label: 'Operations', icon: Activity },
  { href: '/dashboard/growth', label: 'Growth', icon: TrendingUp },
  { href: '/settings?tab=plan', label: 'Plan', icon: Gauge },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function MobileNav() {
  const pathname = usePathname();
  if (pathname === '/workspace' || pathname === '/workspace/') return null;

  return (
    <nav aria-label="Primary" className="xv-mobile-nav lg:hidden fixed bottom-0 inset-x-0 z-50 border-t border-[var(--card-border)] glass-panel-strong safe-area-pb">
      <div className="flex items-center gap-1 overflow-x-auto py-1.5 px-2">
        {items.map(({ href, label, icon: Icon }) => {
          const path = href.split('?')[0];
          const active = pathname === path || (path !== '/dashboard' && pathname.startsWith(path));
          return (
            <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={cn('flex shrink-0 flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-[9px] transition-colors min-w-[66px]', active ? 'text-[var(--accent)] bg-[var(--accent-dim)]' : 'text-[var(--muted)]')}>
              <Icon className="w-4 h-4" aria-hidden="true" />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
