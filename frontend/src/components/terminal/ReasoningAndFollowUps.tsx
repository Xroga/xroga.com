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

/** Modern AI response — natural stream growth + fade-in, renders markdown images */
export function ModernResponseText({
  content,
  streaming,
}: {
  content: string;
  streaming?: boolean;
}) {
  const prevLen = useRef(0);
  const blockRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (content.length > prevLen.current && blockRef.current && !streaming) {
      blockRef.current.style.animation = 'none';
      void blockRef.current.offsetHeight;
      if (content.length > 0) {
        blockRef.current.style.animation = 'xv-response-in 0.35s ease-out';
      }
    }
    prevLen.current = content.length;
  }, [content, streaming]);

  if (!content && streaming) {
    return (
      <span className="xv-stream-cursor inline-flex items-center">
        <span className="w-0.5 h-4 bg-[#006aff]/70 rounded-full animate-pulse" />
      </span>
    );
  }

  const parts = content.split(/(!\[[^\]]*\]\([^)]+\))/g);

  return (
    <span
      ref={blockRef}
      className={cn('xv-response-text whitespace-pre-wrap', streaming && 'xv-streaming')}
    >
      {parts.map((part, i) => {
        const imgMatch = part.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
        if (imgMatch) {
          const [, alt, src] = imgMatch;
          return (
            <span key={i} className="block my-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={alt || 'Generated image'}
                className="max-w-full rounded-lg border border-white/10 shadow-lg max-h-[420px] object-contain bg-black/20"
                loading="lazy"
              />
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
      {streaming && content.length > 0 && (
        <span className="inline-block w-0.5 h-[1em] ml-0.5 bg-[#006aff]/80 align-middle animate-pulse rounded-full" />
      )}
    </span>
  );
}
