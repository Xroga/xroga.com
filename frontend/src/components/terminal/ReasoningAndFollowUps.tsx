'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import {
  extractImagesFromContent,
  stripImageMarkdown,
  parseProviderFromContent,
  isFailedImageContent,
} from '@/lib/parseImageContent';
import { FormattedAiMarkdown } from '@/lib/formatAiMarkdown';
import { PlainAiResponse } from '@/lib/plainAiText';
import { isMathSolutionContent } from '@/lib/mathDetect';
import { ImageStudioCard } from './ImageStudioCard';

function hasMarkdown(content: string): boolean {
  return /^#{1,4}\s/m.test(content) || /^\|.+\|/m.test(content) || /^[-*•]\s/m.test(content) || /^>\s/m.test(content);
}

/** Modern AI response — professional markdown or structured plain text */
export function ModernResponseText({
  content,
  streaming,
}: {
  content: string;
  streaming?: boolean;
}) {
  const safeContent = typeof content === 'string' ? content : '';
  const prevLen = useRef(0);
  const blockRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (safeContent.length > prevLen.current && blockRef.current && !streaming) {
      blockRef.current.style.animation = 'none';
      void blockRef.current.offsetHeight;
      if (safeContent.length > 0) {
        blockRef.current.style.animation = 'xv-response-in 0.35s ease-out';
      }
    }
    prevLen.current = safeContent.length;
  }, [safeContent, streaming]);

  if (!safeContent && streaming) {
    return (
      <span className="xv-stream-cursor inline-flex items-center">
        <span className="w-0.5 h-4 bg-[var(--accent)]/70 rounded-full animate-pulse" />
      </span>
    );
  }

  const images = extractImagesFromContent(safeContent);
  const textOnly = stripImageMarkdown(safeContent);
  const provider = parseProviderFromContent(safeContent);

  if (isFailedImageContent(safeContent) && images.length === 0) {
    return (
      <div ref={blockRef} className="xv-response-text">
        <p className="whitespace-pre-wrap text-[13px] text-red-300/90">{textOnly || safeContent}</p>
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
      {hasMarkdown(safeContent) && !isMathSolutionContent(safeContent) ? (
        <FormattedAiMarkdown content={safeContent} streaming={streaming} />
      ) : (
        <PlainAiResponse content={safeContent} streaming={streaming} mathMode={isMathSolutionContent(safeContent)} />
      )}
    </div>
  );
}
