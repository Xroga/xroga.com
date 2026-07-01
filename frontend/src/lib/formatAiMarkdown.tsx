'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';

/** Lightweight markdown — headings, bold, bullets, numbered lists, code */
function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith('**')) {
      parts.push(<strong key={key++} className="font-semibold text-[var(--foreground)]">{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`')) {
      parts.push(
        <code key={key++} className="rounded bg-[var(--muted)]/15 px-1 py-0.5 text-[11px] font-mono text-[var(--accent)]">
          {token.slice(1, -1)}
        </code>
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : [text];
}

type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'bullet'; items: string[] }
  | { type: 'numbered'; items: string[] }
  | { type: 'para'; text: string }
  | { type: 'hr' };

function parseBlocks(content: string): Block[] {
  const lines = content.split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1]!.length, text: heading[2]! });
      i += 1;
      continue;
    }

    if (/^[-*•]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s+/.test((lines[i] ?? '').trim())) {
        items.push((lines[i] ?? '').trim().replace(/^[-*•]\s+/, ''));
        i += 1;
      }
      blocks.push({ type: 'bullet', items });
      continue;
    }

    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test((lines[i] ?? '').trim())) {
        items.push((lines[i] ?? '').trim().replace(/^\d+[.)]\s+/, ''));
        i += 1;
      }
      blocks.push({ type: 'numbered', items });
      continue;
    }

    const paraLines: string[] = [trimmed];
    i += 1;
    while (i < lines.length && (lines[i] ?? '').trim() && !/^(#{1,3}\s|[-*•]\s|\d+[.)]\s|---)/.test((lines[i] ?? '').trim())) {
      paraLines.push((lines[i] ?? '').trim());
      i += 1;
    }
    blocks.push({ type: 'para', text: paraLines.join(' ') });
  }

  return blocks;
}

export function FormattedAiMarkdown({
  content,
  streaming,
  className,
}: {
  content: string;
  streaming?: boolean;
  className?: string;
}) {
  const blocks = useMemo(() => parseBlocks(content), [content]);

  return (
    <div className={cn('xv-formatted-response space-y-2.5 text-[13px] leading-relaxed', className)}>
      {blocks.map((block, idx) => {
        if (block.type === 'heading') {
          const Tag = block.level === 1 ? 'h3' : block.level === 2 ? 'h4' : 'h5';
          return (
            <Tag
              key={idx}
              className={cn(
                'font-bold text-[var(--foreground)] tracking-tight',
                block.level === 1 && 'text-base mt-1',
                block.level === 2 && 'text-sm mt-0.5',
                block.level === 3 && 'text-[13px] text-[var(--accent)]',
              )}
            >
              {renderInline(block.text)}
            </Tag>
          );
        }
        if (block.type === 'bullet') {
          return (
            <ul key={idx} className="list-none space-y-1 pl-0.5">
              {block.items.map((item, j) => (
                <li key={j} className="flex gap-2">
                  <span className="text-[var(--accent)] shrink-0 mt-0.5">•</span>
                  <span>{renderInline(item)}</span>
                </li>
              ))}
            </ul>
          );
        }
        if (block.type === 'numbered') {
          return (
            <ol key={idx} className="list-none space-y-1 pl-0.5 counter-reset-none">
              {block.items.map((item, j) => (
                <li key={j} className="flex gap-2">
                  <span className="text-[var(--accent)] font-semibold shrink-0 tabular-nums w-4">{j + 1}.</span>
                  <span>{renderInline(item)}</span>
                </li>
              ))}
            </ol>
          );
        }
        if (block.type === 'hr') {
          return <hr key={idx} className="border-[var(--card-border)]/50 my-2" />;
        }
        return (
          <p key={idx} className="text-[var(--foreground)]/95">
            {renderInline(block.text)}
          </p>
        );
      })}
      {streaming && content.length > 0 && (
        <span className="inline-block w-0.5 h-[1em] ml-0.5 bg-[#006aff]/80 align-middle animate-pulse rounded-full" />
      )}
    </div>
  );
}
