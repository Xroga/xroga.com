'use client';

import { cn } from '@/lib/utils';
import { FormattedAiMarkdown } from '@/lib/formatAiMarkdown';
import { MathEquation } from '@/lib/mathRender';
import { parseXrogaBlocks } from '@/lib/plainAiTextParser';

export function PlainAiResponse({
  content,
  className,
  mathMode = false,
}: {
  content: string;
  streaming?: boolean;
  className?: string;
  mathMode?: boolean;
}) {
  if (!content.trim()) return null;
  if (!mathMode) return <FormattedAiMarkdown content={content} className={className} />;

  return (
    <div className={cn('xv-xroga-response space-y-3 font-sans', className)}>
      {parseXrogaBlocks(content).map((block, index) => {
        if (block.type === 'math-equation') {
          return <MathEquation key={`equation-${index}`} text={block.text} className="text-[16px] text-[var(--foreground)] sm:text-[17px]" />;
        }
        if (block.type === 'code') {
          return <pre key={`code-${index}`} className="overflow-x-auto rounded-xl border border-[var(--card-border)]/60 bg-[var(--foreground)]/[0.035] p-3 font-mono text-[12px]"><code>{block.body}</code></pre>;
        }
        return <FormattedAiMarkdown key={`paragraph-${index}`} content={block.text} />;
      })}
    </div>
  );
}
