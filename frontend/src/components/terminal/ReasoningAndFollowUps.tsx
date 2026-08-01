'use client';

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

  if (!safeContent && streaming) {
    return null;
  }

  const images = extractImagesFromContent(safeContent);
  const textOnly = stripImageMarkdown(safeContent);
  const provider = parseProviderFromContent(safeContent);

  if (isFailedImageContent(safeContent) && images.length === 0) {
    return (
      <div className="xv-response-text">
        <p className="whitespace-pre-wrap text-[13px] text-red-300/90">{textOnly || safeContent}</p>
      </div>
    );
  }

  if (images.length > 0) {
    return (
      <div
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
      </div>
    );
  }

  return (
    <div
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
