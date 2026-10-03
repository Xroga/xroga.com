'use client';

import { cn } from '@/lib/utils';
import { FormattedAiMarkdown } from '@/lib/formatAiMarkdown';
import { MathEquation } from '@/lib/mathRender';

export type XrogaBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'math-equation'; text: string }
  | { type: 'code'; language?: string; body: string };

/** Kept for compatibility. Rendering is delegated to the safe CommonMark renderer. */
export function sanitizePlainAiText(content: string): string {
  return content.replace(/\r\n/g, '\n').trim();
}

function explicitEquation(line: string): boolean {
  const value = line.trim();
  return /^\$\$[\s\S]+\$\$$/.test(value) || /^\\\([\s\S]+\\\)$/.test(value) ||
    (/^[a-z0-9()[\].+\-*/^\s]+=[a-z0-9()[\].+\-*/^\s]+$/i.test(value) && /\d|[a-z]/i.test(value));
}

/**
 * Conservative compatibility parser used only by focused tests and explicit math mode.
 * Ordinary prose is a paragraph; the first line is never promoted to a heading.
 */
export function parseXrogaBlocks(content: string): XrogaBlock[] {
  const blocks: XrogaBlock[] = [];
  const normalized = sanitizePlainAiText(content);
  const fences = /```([^\n`]*)\n([\s\S]*?)```/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  const addText = (value: string) => {
    for (const paragraph of value.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean)) {
      if (explicitEquation(paragraph)) {
        blocks.push({ type: 'math-equation', text: paragraph.replace(/^\$\$|\$\$$/g, '').replace(/^\\\(|\\\)$/g, '') });
      } else {
        blocks.push({ type: 'paragraph', text: paragraph });
      }
    }
  };

  while ((match = fences.exec(normalized)) !== null) {
    addText(normalized.slice(cursor, match.index));
    blocks.push({ type: 'code', language: match[1]?.trim() || undefined, body: match[2] ?? '' });
    cursor = match.index + match[0].length;
  }
  addText(normalized.slice(cursor));
  return blocks;
}

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
