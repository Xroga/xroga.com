'use client';

import Link from 'next/link';
import { Globe, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HoverTip } from '@/components/ui/HoverTip';

/** Community is locked — Coming Soon. Device push notifications are unrelated and stay enabled. */
export function SidebarCommunityButton({ expanded }: { expanded: boolean }) {
  const body = (
    <Link
      href="/dashboard/community"
      className={cn(
        'w-full flex items-center gap-2 rounded-xl border border-[var(--card-border)]/50 bg-white/[0.02] hover:border-[var(--accent)]/30 transition-colors text-left opacity-90',
        expanded ? 'px-3 py-2' : 'p-2 justify-center mx-auto w-10 h-10'
      )}
    >
      <Globe className="w-4 h-4 shrink-0 text-[var(--muted)]" />
      {expanded && (
        <>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold truncate">Community</p>
            <p className="text-[10px] text-[var(--muted)] truncate flex items-center gap-1">
              <Lock className="w-2.5 h-2.5" />
              Coming Soon
            </p>
          </div>
          <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/25">
            Soon
          </span>
        </>
      )}
    </Link>
  );

  if (expanded) return body;

  return (
    <HoverTip label="Community" description="Coming soon — community hub is locked for now.">
      {body}
    </HoverTip>
  );
}
