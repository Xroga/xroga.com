'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';

/** Remove markdown symbols so raw # * | never show in chat */
export function sanitizePlainAiText(content: string): string {
  const parts: string[] = [];
  const fence = /```[\s\S]*?```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(content)) !== null) {
    if (m.index > last) parts.push(stripSegment(content.slice(last, m.index)));
    parts.push(m[0]);
    last = m.index + m[0].length;
  }
  parts.push(stripSegment(content.slice(last)));
  return parts.join('').replace(/\n{3,}/g, '\n\n').trim();
}

function stripSegment(s: string): string {
  return s
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*•]\s+/gm, '')
    .replace(/\|/g, ' ')
    .replace(/^:?-{2,}:?$/gm, '')
    .replace(/`([^`]+)`/g, '$1');
}

function renderCodeBlocks(content: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /```(\w*)\n?([\s\S]*?)```/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = re.exec(content)) !== null) {
    if (match.index > last) {
      nodes.push(
        <PlainSections key={key++} text={content.slice(last, match.index)} />
      );
    }
    nodes.push(
      <pre
        key={key++}
        className="my-2 overflow-x-auto rounded-xl border border-[var(--card-border)]/60 bg-black/30 px-3 py-2.5 text-[11px] font-mono leading-relaxed text-[var(--foreground)]/95"
      >
        <code>{match[2]?.trim()}</code>
      </pre>
    );
    last = match.index + match[0].length;
  }

  if (last < content.length) {
    nodes.push(<PlainSections key={key++} text={content.slice(last)} />);
  }

  return nodes.length ? nodes : [<PlainSections key={0} text={content} />];
}

function PlainSections({ text }: { text: string }) {
  const clean = sanitizePlainAiText(text);
  const sections = clean.split(/\n\n+/).filter((s) => s.trim());

  if (!sections.length) return null;

  return (
    <div className="space-y-3">
      {sections.map((section, i) => {
        const lines = section.split('\n').map((l) => l.trim()).filter(Boolean);
        if (!lines.length) return null;
        const first = lines[0]!;
        const looksLikeLabel =
          lines.length > 1 &&
          first.length < 56 &&
          !first.endsWith('.') &&
          !first.endsWith('?') &&
          !first.endsWith(':');

        if (looksLikeLabel) {
          return (
            <div key={i} className="space-y-1">
              <p className="text-[13px] font-semibold tracking-tight text-[var(--foreground)]">
                {first}
              </p>
              <p className="text-[13px] leading-[1.65] text-[var(--foreground)]/90 whitespace-pre-wrap">
                {lines.slice(1).join('\n')}
              </p>
            </div>
          );
        }

        return (
          <p
            key={i}
            className={cn(
              'text-[13px] leading-[1.65] text-[var(--foreground)]/90 whitespace-pre-wrap',
              i === 0 && 'text-[14px] font-medium text-[var(--foreground)]'
            )}
          >
            {section}
          </p>
        );
      })}
    </div>
  );
}

export function PlainAiResponse({
  content,
  streaming,
  className,
}: {
  content: string;
  streaming?: boolean;
  className?: string;
}) {
  const hasCode = useMemo(() => /```/.test(content), [content]);
  const nodes = useMemo(
    () => (hasCode ? renderCodeBlocks(content) : [<PlainSections key={0} text={content} />]),
    [content, hasCode]
  );

  return (
    <div className={cn('xv-plain-response', className)}>
      {nodes}
      {streaming && content.length > 0 && (
        <span className="inline-block w-0.5 h-[1em] ml-0.5 bg-[#006aff]/80 align-middle animate-pulse rounded-full" />
      )}
    </div>
  );
}
