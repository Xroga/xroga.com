'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Word-by-word typewriter — Cursor-style goal / status text */
export function AgentTypewriterText({
  text,
  active = false,
  className,
}: {
  text: string;
  active?: boolean;
  className?: string;
}) {
  const [displayed, setDisplayed] = useState(active ? '' : text);

  useEffect(() => {
    if (!active) {
      setDisplayed(text);
      return;
    }
    const words = text.split(/\s+/).filter(Boolean);
    if (!words.length) {
      setDisplayed('');
      return;
    }
    let i = 0;
    setDisplayed('');
    const id = setInterval(() => {
      i += 1;
      setDisplayed(words.slice(0, i).join(' '));
      if (i >= words.length) clearInterval(id);
    }, 22);
    return () => clearInterval(id);
  }, [text, active]);

  const done = !active || displayed.length >= text.length;

  return (
    <span className={className}>
      {displayed}
      {!done && (
        <span className="xv-agent-cursor ml-0.5 inline-block w-[2px] h-[13px] bg-[var(--foreground)]/50 align-middle" />
      )}
    </span>
  );
}

/** Single activity row with fade-in */
export function AgentActivityRow({
  children,
  delayMs = 0,
  dimmed = false,
}: {
  children: ReactNode;
  delayMs?: number;
  dimmed?: boolean;
}) {
  return (
    <div
      className={cn(
        'xv-agent-line-in text-[12px] leading-snug flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5',
        dimmed ? 'text-[var(--muted)]/50' : 'text-[var(--muted)]/70'
      )}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      {children}
    </div>
  );
}
