'use client';

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GitHubActivationOverlayProps {
  open: boolean;
  username?: string;
  onDone?: () => void;
}

/** Brief success animation after GitHub OAuth completes */
export function GitHubActivationOverlay({ open, username, onDone }: GitHubActivationOverlayProps) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (!open) {
      setVisible(false);
      setExiting(false);
      return;
    }

    setVisible(true);
    setExiting(false);

    const exitTimer = setTimeout(() => setExiting(true), 2200);
    const doneTimer = setTimeout(() => {
      setVisible(false);
      onDone?.();
    }, 2800);

    return () => {
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
    };
  }, [open, onDone]);

  if (!visible) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-[300] flex items-center justify-center pointer-events-none',
        exiting ? 'github-activation-exit' : 'github-activation-enter'
      )}
      aria-live="polite"
      aria-label="GitHub connected"
    >
      <div className="github-activation-card flex flex-col items-center gap-3 px-8 py-7 rounded-2xl border border-white/10 bg-[var(--card)]/95 backdrop-blur-xl shadow-2xl">
        <div className="github-activation-check flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 border border-emerald-400/40">
          <Check className="h-7 w-7 text-emerald-400 github-activation-check-icon" strokeWidth={2.5} />
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-semibold tracking-wide text-[var(--foreground)]">GitHub activated</p>
          {username && (
            <p className="text-xs font-mono text-[var(--muted)]">@{username}</p>
          )}
          <p className="text-[10px] text-emerald-400/90 pt-1">Repository ready — swarm can build</p>
        </div>
      </div>
    </div>
  );
}
