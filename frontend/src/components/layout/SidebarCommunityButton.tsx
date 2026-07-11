'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import {
  Globe,
  Gift,
  Award,
  Store,
  RefreshCw,
  Sparkles,
  ChevronRight,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { HoverTip } from '@/components/ui/HoverTip';

const QUICK_LINKS = [
  {
    href: '/dashboard/community',
    label: 'Community Overview',
    desc: 'Pool balance, quick stats, and hub',
    icon: Globe,
    accent: 'text-emerald-400',
  },
  {
    href: '/dashboard/community?tab=influencer',
    label: 'Influencer Program',
    desc: '2–10% commission · up to 3M AI tokens per referral',
    icon: Award,
    accent: 'text-violet-400',
    highlight: true,
  },
  {
    href: '/dashboard/community?tab=marketplace',
    label: 'Marketplace',
    desc: 'Buy & sell templates, projects, and automations',
    icon: Store,
    accent: 'text-emerald-400',
  },
  {
    href: '/dashboard/community?tab=distribution',
    label: 'Auto Distribution',
    desc: 'Manage unused token allocation at month-end',
    icon: RefreshCw,
    accent: 'text-violet-300',
  },
  {
    href: '/dashboard/referrals',
    label: 'Refer & Earn',
    desc: '250K tokens + 5K XRG per referral',
    icon: Gift,
    accent: 'text-[var(--accent)]',
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
        'w-full flex items-center gap-2 rounded-xl border border-[var(--card-border)]/50 bg-gradient-to-br from-emerald-500/10 to-violet-500/5 hover:border-[var(--accent)]/40 transition-colors text-left',
        expanded ? 'px-3 py-2' : 'p-2 justify-center mx-auto w-10 h-10'
      )}
    >
      <Globe className={cn('shrink-0 text-emerald-400', expanded ? 'w-4 h-4' : 'w-4 h-4')} />
      {expanded && (
        <>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold">Community</p>
            <p className="text-[9px] text-[var(--muted)] truncate">Influencer · Pool · Market</p>
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
            <div className="fixed z-[410] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(380px,calc(100vw-28px))] max-h-[min(85vh,560px)] flex flex-col rounded-2xl border border-[var(--accent)]/25 bg-[var(--card)] shadow-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--card-border)] flex items-center justify-between bg-gradient-to-r from-emerald-500/10 via-violet-500/10 to-transparent shrink-0">
                <div>
                  <p className="font-bold text-sm flex items-center gap-2">
                    <Globe className="w-4 h-4 text-emerald-400" />
                    Community Hub
                  </p>
                  <p className="text-[10px] text-[var(--muted)]">Influencer · Pool · Marketplace · Distribution</p>
                </div>
                <button type="button" onClick={() => setOpen(false)} className="p-1 text-[var(--muted)] hover:text-[var(--foreground)]">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <nav className="p-2 space-y-1 overflow-y-auto flex-1">
                {QUICK_LINKS.map((item) => {
                  const { href, label, desc, icon: Icon, accent } = item;
                  const highlight = 'highlight' in item && item.highlight;
                  return (
                    <Link
                      key={label}
                      href={href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        'flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors group',
                        highlight && 'border border-violet-500/20 bg-violet-500/5 hover:bg-violet-500/10'
                      )}
                    >
                      <div className={cn('p-2 rounded-lg bg-white/5 shrink-0', highlight && 'bg-violet-500/15')}>
                        <Icon className={cn('w-5 h-5', accent)} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold flex items-center gap-2">
                          {label}
                          {highlight && (
                            <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-violet-500/25 text-violet-300">
                              Live
                            </span>
                          )}
                        </p>
                        <p className="text-[10px] text-[var(--muted)] leading-snug">{desc}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[var(--muted)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </Link>
                  );
                })}
              </nav>
              <div className="px-4 py-3 border-t border-[var(--card-border)] shrink-0">
                <Link
                  href="/dashboard/community?tab=influencer"
                  onClick={() => setOpen(false)}
                  className="block w-full text-center py-2 rounded-xl bg-gradient-to-r from-violet-600/80 to-[var(--accent)]/80 text-white text-xs font-bold hover:opacity-90"
                >
                  Open Influencer Program
                </Link>
              </div>
            </div>
          </>,
          document.body
        )
      : null;

  if (!expanded) {
    return (
      <>
        <HoverTip label="Community" description="Influencer program, pool, marketplace, and more">
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
