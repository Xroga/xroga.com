'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface ReasoningPanelProps {
  reasoning?: string;
  dag?: Array<{ id: string; description: string; agent: string }>;
}

export function ReasoningPanel({ reasoning, dag }: ReasoningPanelProps) {
  const [open, setOpen] = useState(false);
  if (!reasoning && !dag?.length) return null;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-[10px] text-[var(--muted)] hover:text-[var(--primary)] underline-offset-2 hover:underline"
      >
        {open ? 'Hide reasoning' : 'Show reasoning'}
      </button>
      {open && (
        <div className="mt-2 p-2.5 rounded-lg bg-black/20 border border-white/10 text-[11px] text-[var(--muted)] space-y-2">
          {reasoning && <p className="italic">{reasoning}</p>}
          {dag?.map((d) => (
            <div key={d.id} className="flex gap-2">
              <span className="text-[var(--primary)] font-mono">{d.id}.</span>
              <span>
                <strong className="text-[var(--foreground)]">{d.agent}</strong> — {d.description}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface FollowUpChipsProps {
  items: string[];
  onSelect: (text: string) => void;
}

export function FollowUpChips({ items, onSelect }: FollowUpChipsProps) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {items.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onSelect(item)}
          className={cn(
            'text-[10px] px-2.5 py-1 rounded-full border border-[#006aff]/30',
            'bg-[#006aff]/10 hover:bg-[#006aff]/20 text-[#93c5fd] transition-colors'
          )}
        >
          {item}
        </button>
      ))}
    </div>
  );
}

/** Smooth typewriter — avoids stray single-char flash by syncing with growing content */
export function SmoothTypewriter({
  content,
  animate,
  speed = 8,
}: {
  content: string;
  animate: boolean;
  speed?: number;
}) {
  const [displayed, setDisplayed] = useState(animate ? '' : content);
  const targetRef = useRef(content);

  useEffect(() => {
    targetRef.current = content;
    if (!animate) {
      setDisplayed(content);
      return;
    }
    if (!content) {
      setDisplayed('');
      return;
    }
    let i = displayed.length;
    if (i > content.length) i = 0;
    const timer = setInterval(() => {
      i += 1;
      const next = targetRef.current.slice(0, i);
      setDisplayed(next);
      if (i >= targetRef.current.length) clearInterval(timer);
    }, speed);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, animate]);

  return (
    <span>
      {displayed}
      {animate && displayed.length < content.length && <span className="cursor-blink">▌</span>}
    </span>
  );
}
