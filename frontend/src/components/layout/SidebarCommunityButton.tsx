'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { Globe, Gift, Users, Sparkles, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HoverTip } from '@/components/ui/HoverTip';

const QUICK_LINKS = [
  {
    href: '/dashboard/community',
    label: 'Community Pool',
    desc: 'Request AI tokens when running low',
    icon: Globe,
    accent: 'text-emerald-400',
  },
  {
    href: '/dashboard/referrals',
    label: 'Refer & Earn',
    desc: '250K tokens + 5K XRG per referral',
    icon: Gift,
    accent: 'text-[var(--accent)]',
  },
  {
    href: '/dashboard/community',
    label: 'Discover',
    desc: 'Builder creations — coming soon',
    icon: Users,
    accent: 'text-violet-400',
    badge: 'Soon',
  },
  {
    href: '/dashboard/tasks',
    label: 'Earn XRG',
    desc: 'Complete tasks for rewards',
    icon: Sparkles,
    accent: 'text-amber-400',
  },
] as const;

export function SidebarCommunityButton({ expanded }: { expanded: boolean }) {
  const [open, setOpen] = useState(false);

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={cn(
        'w-full flex items-center gap-2 rounded-xl border border-[var(--card-border)]/50 bg-gradient-to-br from-emerald-500/10 to-[var(--accent)]/5 hover:border-[var(--accent)]/40 transition-colors text-left',
        expanded ? 'px-3 py-2' : 'p-2 justify-center mx-auto w-10 h-10'
      )}
    >
      <Globe className={cn('shrink-0 text-emerald-400', expanded ? 'w-4 h-4' : 'w-4 h-4')} />
      {expanded && (
        <>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold">Community</p>
            <p className="text-[9px] text-[var(--muted)] truncate">Pool · Refer · Earn</p>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-[var(--muted)] shrink-0" />
        </>
      )}
    </button>
  );

  const modal =
    open && typeof document !== 'undefined'
      ? createPortal(
          <>
            <div className="fixed inset-0 z-[400] bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} aria-hidden />
            <div className="fixed z-[410] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(360px,calc(100vw-28px))] rounded-2xl border border-[var(--accent)]/25 bg-[var(--card)] shadow-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--card-border)] flex items-center justify-between bg-gradient-to-r from-emerald-500/10 to-transparent">
                <div>
                  <p className="font-bold text-sm flex items-center gap-2">
                    <Globe className="w-4 h-4 text-emerald-400" />
                    Community
                  </p>
                  <p className="text-[10px] text-[var(--muted)]">Quick links</p>
                </div>
                <button type="button" onClick={() => setOpen(false)} className="p-1 text-[var(--muted)] hover:text-[var(--foreground)]">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <nav className="p-2 space-y-1">
                {QUICK_LINKS.map((item) => {
                  const { href, label, desc, icon: Icon, accent } = item;
                  const badge = 'badge' in item ? item.badge : undefined;
                  return (
                  <Link
                    key={label}
                    href={href}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors group"
                  >
                    <Icon className={cn('w-5 h-5 shrink-0', accent)} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold flex items-center gap-2">
                        {label}
                        {badge && (
                          <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                            {badge}
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] text-[var(--muted)]">{desc}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[var(--muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                  );
                })}
              </nav>
              <p className="px-4 pb-3 text-[9px] text-center text-[var(--muted)]">
                Discover builder creations — coming soon
              </p>
            </div>
          </>,
          document.body
        )
      : null;

  if (!expanded) {
    return (
      <>
        <HoverTip label="Community" description="Pool, referrals, and quick links">
          {trigger}
        </HoverTip>
        {modal}
      </>
    );
  }

  return (
    <>
      {trigger}
      {modal}
    </>
  );
}
