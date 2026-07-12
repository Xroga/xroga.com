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
  | { type: 'para'; text: string; lead?: boolean }
  | { type: 'hr' }
  | { type: 'summary'; text: string }
  | { type: 'table'; headers: string[]; rows: string[][] };

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

    if (trimmed.startsWith('> ')) {
      const summaryLines: string[] = [trimmed.slice(2)];
      i += 1;
      while (i < lines.length && (lines[i] ?? '').trim().startsWith('> ')) {
        summaryLines.push((lines[i] ?? '').trim().slice(2));
        i += 1;
      }
      blocks.push({ type: 'summary', text: summaryLines.join(' ') });
      continue;
    }

    if (/^\|.+\|/.test(trimmed) && trimmed.includes('|')) {
      const tableLines: string[] = [trimmed];
      i += 1;
      while (i < lines.length && /^\|.+\|/.test((lines[i] ?? '').trim())) {
        tableLines.push((lines[i] ?? '').trim());
        i += 1;
      }
      const parsed = tableLines
        .filter((l) => !/^[\|\s:-]+$/.test(l.replace(/\|/g, '').trim()))
        .map((l) =>
          l
            .split('|')
            .map((c) => c.trim())
            .filter(Boolean)
        );
      if (parsed.length >= 1) {
        blocks.push({
          type: 'table',
          headers: parsed[0] ?? [],
          rows: parsed.slice(1),
        });
      }
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
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
    while (i < lines.length && (lines[i] ?? '').trim() && !/^(#{1,4}\s|[-*•]\s|\d+[.)]\s|---)/.test((lines[i] ?? '').trim())) {
      paraLines.push((lines[i] ?? '').trim());
      i += 1;
    }
    const isFirstPara = !blocks.some((b) => b.type === 'heading' || b.type === 'bullet' || b.type === 'numbered' || b.type === 'summary');
    blocks.push({ type: 'para', text: paraLines.join(' '), lead: isFirstPara });
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
    <div className={cn('xv-formatted-response space-y-3 text-[14px] sm:text-[15px] leading-relaxed', className)}>
      {blocks.map((block, idx) => {
        if (block.type === 'heading') {
          const Tag = block.level <= 2 ? 'h3' : block.level === 3 ? 'h4' : 'h5';
          return (
            <Tag
              key={idx}
              className={cn(
                'font-bold text-[var(--foreground)] tracking-tight border-b border-[var(--card-border)]/30 pb-1',
                block.level === 1 && 'text-lg sm:text-xl mt-1',
                block.level === 2 && 'text-base sm:text-lg mt-0.5',
                block.level >= 3 && 'text-[15px] text-[var(--accent)] border-none pb-0',
                /recommended video/i.test(block.text) && 'text-red-500/90 dark:text-red-400',
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
        if (block.type === 'summary') {
          return (
            <div
              key={idx}
              className="rounded-xl border border-[var(--accent)]/25 bg-gradient-to-br from-[var(--accent)]/8 to-transparent px-4 py-3 text-[14px] text-[var(--foreground)]/90 shadow-sm"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)] mb-2">Summary</p>
              <p className="leading-relaxed">{renderInline(block.text)}</p>
            </div>
          );
        }
        if (block.type === 'table' && block.headers.length) {
          return (
            <div key={idx} className="overflow-x-auto rounded-xl border border-[var(--card-border)]/60">
              <table className="w-full text-[13px] sm:text-[14px]">
                <thead>
                  <tr className="border-b border-[var(--card-border)]/50 bg-[var(--accent)]/5">
                    {block.headers.map((h, j) => (
                      <th key={j} className="px-3 py-2 text-left font-semibold text-[var(--foreground)]">
                        {renderInline(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, ri) => (
                    <tr key={ri} className="border-b border-[var(--card-border)]/30 last:border-0">
                      {row.map((cell, ci) => (
                        <td key={ci} className="px-3 py-2 text-[var(--foreground)]/90">
                          {renderInline(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (block.type === 'para') {
          return (
            <p
              key={idx}
              className={cn(
                'text-[var(--foreground)]/95',
                block.lead && 'text-[15px] sm:text-[16px] font-medium leading-snug text-[var(--foreground)]',
              )}
            >
              {renderInline(block.text)}
            </p>
          );
        }
        return null;
      })}
      {streaming && content.length > 0 && (
        <span className="inline-block w-0.5 h-[1em] ml-0.5 bg-[#006aff]/80 align-middle animate-pulse rounded-full" />
      )}
    </div>
  );
}
