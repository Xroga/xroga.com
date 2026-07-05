'use client';

import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { sanitizeXrogaTerminalText } from '@/lib/xrogaBrand';
import { XrogaBlackHoleShineText } from '@/components/ui/XrogaBlackHoleShineText';

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
  const source = useMemo(() => sanitizeXrogaTerminalText(text?.trim() ?? ''), [text]);
  const sanitizedLog = useMemo(
    () =>
      activityLog
        .map((line) => (typeof line === 'string' ? sanitizeXrogaTerminalText(line) : ''))
        .filter(Boolean),
    [activityLog]
  );

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

  if (!source && !sanitizedLog.length) return null;

  return (
    <div className={cn('space-y-1.5', className)}>
      {source && (
        <div className="relative overflow-hidden rounded-lg border border-[#006aff]/25 bg-black/40 px-3 py-2.5">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#006aff]/10 to-transparent opacity-90 animate-pulse pointer-events-none" aria-hidden />
          <p className="relative text-[11px] leading-snug min-h-[1.25rem]">
            <XrogaBlackHoleShineText className="text-[11px]">
              {displayed}
              {displayed.length < source.length && (
                <span className="inline-block w-1.5 h-3 ml-0.5 bg-[#60a5fa] animate-pulse align-middle xv-agent-cursor" />
              )}
            </XrogaBlackHoleShineText>
          </p>
        </div>
      )}
      {sanitizedLog.length > 1 && (
        <ul className="max-h-24 overflow-y-auto space-y-0.5 pr-1 scrollbar-thin">
          {sanitizedLog.slice(-8).map((line, i) => (
            <li
              key={`${i}-${line.slice(0, 24)}`}
              className={cn(
                'text-[9px] leading-snug truncate',
                i === sanitizedLog.length - 1 ? 'text-[var(--foreground)]/70' : 'text-[var(--muted)]/40'
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
