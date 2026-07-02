'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  extractImagesFromContent,
  stripImageMarkdown,
  parseProviderFromContent,
  isFailedImageContent,
} from '@/lib/parseImageContent';
import { FormattedAiMarkdown } from '@/lib/formatAiMarkdown';
import { PlainAiResponse } from '@/lib/plainAiText';
import { ImageStudioCard } from './ImageStudioCard';

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

/** Modern AI response — text + Image Studio cards with reveal animation */
export function ModernResponseText({
  content,
  streaming,
}: {
  content: string;
  streaming?: boolean;
}) {
  const prevLen = useRef(0);
  const blockRef = useRef<HTMLDivElement>(null);

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

  const images = extractImagesFromContent(content);
  const textOnly = stripImageMarkdown(content);
  const provider = parseProviderFromContent(content);

  if (isFailedImageContent(content) && images.length === 0) {
    return (
      <div ref={blockRef} className="xv-response-text">
        <p className="whitespace-pre-wrap text-[13px] text-red-300/90">{textOnly || content}</p>
      </div>
    );
  }

  if (images.length > 0) {
    return (
      <div
        ref={blockRef}
        className={cn('xv-response-text space-y-2', streaming && 'xv-streaming')}
      >
        {textOnly && (
          <FormattedAiMarkdown content={textOnly} streaming={streaming} />
        )}
        {images.map((img, i) => (
          <ImageStudioCard
            key={`studio-img-${i}`}
            data={{
              type: 'image',
              imageUrl: img.url,
              provider,
              prompt: img.alt !== 'Generated image' ? img.alt : undefined,
            }}
          />
        ))}
        {streaming && (
          <span className="inline-block w-0.5 h-[1em] ml-0.5 bg-[#006aff]/80 align-middle animate-pulse rounded-full" />
        )}
      </div>
    );
  }

  return (
    <div
      ref={blockRef}
      className={cn('xv-response-text', streaming && 'xv-streaming')}
    >
      <PlainAiResponse content={content} streaming={streaming} />
    </div>
  );
}
