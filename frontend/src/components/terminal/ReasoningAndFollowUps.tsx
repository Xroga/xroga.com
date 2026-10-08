'use client';

import { memo, type ReactNode } from 'react';
import { MessageSquareText } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  extractImagesFromContent,
  stripImageMarkdown,
  parseProviderFromContent,
  isFailedImageContent,
} from '@/lib/parseImageContent';
import { FormattedAiMarkdown } from '@/lib/formatAiMarkdown';
import type { CitationSource } from '@/lib/xrogaCitations';
import { PlainAiResponse } from '@/lib/plainAiText';
import { isMathSolutionContent } from '@/lib/mathDetect';
import { ImageStudioCard } from './ImageStudioCard';

function ResponseBody({ children, streaming }: { children: ReactNode; streaming?: boolean }) {
  return <div className={cn('xv-response-text flex min-w-0 items-start gap-2.5', streaming && 'xv-streaming')}>
    <MessageSquareText className="mt-1 h-4 w-4 shrink-0 text-[var(--muted)]" aria-hidden="true" />
    <div className="min-w-0 flex-1">{children}</div>
  </div>;
}

/** Modern AI response — professional markdown or structured plain text */
export const ModernResponseText = memo(function ModernResponseText({
  content,
  streaming,
  sources,
}: {
  content: string;
  streaming?: boolean;
  sources?: CitationSource[];
}) {
  const safeContent = typeof content === 'string' ? content : '';

  if (!safeContent && streaming) {
    return null;
  }

  const images = extractImagesFromContent(safeContent);
  const textOnly = stripImageMarkdown(safeContent);
  const provider = parseProviderFromContent(safeContent);

  if (isFailedImageContent(safeContent) && images.length === 0) {
    return (
      <ResponseBody streaming={streaming}>
        <p className="whitespace-pre-wrap text-[13px] text-red-300/90">
          {textOnly || safeContent}
        </p>
      </ResponseBody>
    );
  }

  if (images.length > 0) {
    return (
      <ResponseBody streaming={streaming}>
        <div className="space-y-2">
          {textOnly && (
            <FormattedAiMarkdown content={textOnly} streaming={streaming} sources={sources} />
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
        </div>
      </ResponseBody>
    );
  }

  return (
    <ResponseBody streaming={streaming}>
      {isMathSolutionContent(safeContent) ? (
        <PlainAiResponse
          content={safeContent}
          streaming={streaming}
          mathMode
        />
      ) : (
        <FormattedAiMarkdown content={safeContent} streaming={streaming} sources={sources} />
      )}
    </ResponseBody>
  );
});
