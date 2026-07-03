'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';

/** Remove markdown symbols, emojis, and clutter from AI text */
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

function stripEmojis(s: string): string {
  return s.replace(
    /(?:[\u2700-\u27bf]|(?:\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff]))/g,
    ''
  );
}

function stripSegment(s: string): string {
  let out = stripEmojis(s);
  out = out.replace(/#{1,6}\s*/g, '');
  out = out.replace(/\*\*([^*]+)\*\*/g, '$1');
  out = out.replace(/\*([^*]+)\*/g, '$1');
  out = out.replace(/_([^_]+)_/g, '$1');
  out = out.replace(/^>\s?/gm, '');
  out = out.replace(/^[-*•]\s+/gm, '');
  out = out.replace(/\|+/g, ' ');
  out = out.replace(/^:?-{2,}:?$/gm, '');
  out = out.replace(/`([^`]+)`/g, '$1');
  out = out.replace(/\s{2,}/g, ' ');
  return out;
}

function renderCodeBlocks(content: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /```(\w*)\n?([\s\S]*?)```/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = re.exec(content)) !== null) {
    if (match.index > last) {
      nodes.push(<PlainSections key={key++} text={content.slice(last, match.index)} />);
    }
    nodes.push(
      <pre
        key={key++}
        className="my-2 overflow-x-auto rounded-xl border border-slate-200/80 bg-slate-900/5 px-3 py-2.5 text-[11px] font-mono leading-relaxed text-[var(--foreground)]/95 dark:border-white/10 dark:bg-black/30"
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
    <div className="space-y-3.5">
      {sections.map((section, i) => {
        const lines = section
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean);
        if (!lines.length) return null;
        const first = lines[0]!;
        const looksLikeLabel =
          lines.length > 1 &&
          first.length < 56 &&
          !first.endsWith('.') &&
          !first.endsWith('?') &&
          !first.endsWith(':') &&
          !first.includes('  ');

        if (looksLikeLabel) {
          return (
            <div key={i} className="space-y-1.5">
              <p className="text-[13px] font-semibold tracking-tight text-[var(--foreground)]">{first}</p>
              <p className="text-[13px] leading-[1.7] text-[var(--foreground)]/88 whitespace-pre-wrap">
                {lines.slice(1).join('\n')}
              </p>
            </div>
          );
        }

        return (
          <p
            key={i}
            className={cn(
              'text-[13px] leading-[1.7] text-[var(--foreground)]/88 whitespace-pre-wrap',
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
  const safe = useMemo(() => sanitizePlainAiText(content), [content]);
  const hasCode = useMemo(() => /```/.test(safe), [safe]);
  const nodes = useMemo(
    () => (hasCode ? renderCodeBlocks(safe) : [<PlainSections key={0} text={safe} />]),
    [safe, hasCode]
  );

  return (
    <div className={cn('xv-plain-response', className)}>
      {nodes}
      {streaming && safe.length > 0 && (
        <span className="inline-block w-0.5 h-[1em] ml-0.5 bg-[#006aff]/70 align-middle animate-pulse rounded-full" />
      )}
    </div>
  );
}
