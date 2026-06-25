'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, FolderOpen, MessageSquare, Link2, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const items = [
  { href: '/dashboard', label: 'Home', icon: Home },
  { href: '/dashboard/projects', label: 'Projects', icon: FolderOpen },
  { href: '/dashboard/chats', label: 'Chats', icon: MessageSquare },
  { href: '/dashboard/integrations', label: 'Integrations', icon: Link2 },
  { href: '/settings', label: 'Profile', icon: User },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-50 border-t border-[var(--card-border)] bg-[var(--card)]/95 backdrop-blur-md safe-area-pb">
      <div className="flex items-center justify-around py-2 px-1">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-xs transition-colors min-w-[56px]',
                active ? 'text-violet-400' : 'text-[var(--muted)]'
              )}
            >
              <Icon className={cn('w-5 h-5', active && 'text-violet-400')} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
