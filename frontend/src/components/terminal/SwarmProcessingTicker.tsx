'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/** Fast typewriter — shows every word of what XROGA AI is doing */
export function SwarmProcessingTicker({
  text,
  activityLog = [],
  className,
}: {
  text?: string | null;
  activityLog?: string[];
  className?: string;
}) {
  const [displayed, setDisplayed] = useState('');
  const source = text?.trim() ?? '';

  useEffect(() => {
    if (!source) {
      setDisplayed('');
      return;
    }
    const words = source.split(/\s+/);
    let i = 0;
    setDisplayed('');
    const id = setInterval(() => {
      i += 1;
      setDisplayed(words.slice(0, i).join(' '));
      if (i >= words.length) clearInterval(id);
    }, 28);
    return () => clearInterval(id);
  }, [source]);

  if (!source && !activityLog.length) return null;

  return (
    <div className={cn('space-y-1.5', className)}>
      {source && (
        <div className="relative overflow-hidden rounded-lg border border-[#006aff]/20 bg-[#006aff]/8 px-2.5 py-2">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.04] to-transparent opacity-80 animate-pulse" />
          <p className="relative text-[11px] font-medium text-[#93c5fd] leading-snug min-h-[1.25rem]">
            {displayed}
            {displayed.length < source.length && (
              <span className="inline-block w-1.5 h-3 ml-0.5 bg-[#60a5fa] animate-pulse align-middle" />
            )}
          </p>
        </div>
      )}
      {activityLog.length > 1 && (
        <ul className="max-h-24 overflow-y-auto space-y-0.5 pr-1 scrollbar-thin">
          {activityLog.slice(-8).map((line, i) => (
            <li
              key={`${i}-${line.slice(0, 24)}`}
              className={cn(
                'text-[9px] leading-snug truncate',
                i === activityLog.length - 1 ? 'text-[var(--foreground)]/70' : 'text-[var(--muted)]/40'
              )}
            >
              {line}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
