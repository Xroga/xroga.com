'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Terminal, LayoutDashboard, History, Gift, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const items = [
  { href: '/dashboard', label: 'Workspace', icon: Terminal },
  { href: '/dashboard/home', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/history', label: 'History', icon: History },
  { href: '/dashboard/tasks', label: 'Earn', icon: Gift },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function MobileNav() {
  const pathname = usePathname();
  const isDashboard = pathname === '/dashboard' || pathname === '/dashboard/';

  if (isDashboard) return null;

  return (
    <nav className="xv-mobile-nav lg:hidden fixed bottom-0 inset-x-0 z-50 border-t border-[var(--card-border)] glass-panel-strong safe-area-pb">
      <div className="flex items-center justify-between py-1.5 px-1 max-w-lg mx-auto">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-lg text-[9px] sm:text-[10px] transition-colors min-w-0 flex-1 max-w-[72px]',
                active ? 'text-[var(--accent)]' : 'text-[var(--muted)]'
              )}
            >
              <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="truncate w-full text-center">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
