'use client';

import { useMemo, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { MathEquation } from '@/lib/mathRender';

export type XrogaBlock =
  | { type: 'headline'; text: string }
  | { type: 'section'; title: string; body: string }
  | { type: 'paragraph'; text: string }
  | { type: 'math-step'; step: string; body: string }
  | { type: 'math-equation'; text: string }
  | { type: 'math-answer'; text: string }
  | { type: 'callout'; label: string; body: string }
  | { type: 'list'; items: string[] }
  | { type: 'code'; language?: string; body: string };

/** Sanitize — strip markdown symbols but keep backticks for inline code */
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
  let out = s;
  out = out.replace(/#{1,6}\s*/g, '');
  out = out.replace(/\*\*([^*]+)\*\*/g, '$1');
  out = out.replace(/\*([^*]+)\*/g, '$1');
  out = out.replace(/_([^_]+)_/g, '$1');
  out = out.replace(/^>\s?/gm, '');
  out = out.replace(/^[-*•]\s+/gm, '');
  out = out.replace(/\|+/g, ' ');
  out = out.replace(/^:?-{2,}:?$/gm, '');
  return out;
}

function normalizeMathContent(content: string): string {
  let out = content;
  out = out.replace(/(\S)\s+Step\s+(\d+)\b/gi, '$1\n\nStep $2');
  out = out.replace(/\s+Answer\b/gi, '\n\nAnswer\n');
  out = out.replace(/\s+Quick check\b/gi, '\n\nQuick check\n');
  out = out.replace(/steps\s+Step\s+(\d+)/gi, 'steps\n\nStep $1');
  out = out.replace(/Step\s+(\d+)\s*[:.]?\s*/gi, 'Step $1\n');
  out = out.replace(/(\d)\s+(Step\s+\d)/gi, '$1\n\n$2');
  out = out.replace(/(To solve for [^\n]+)\s*(\d)/gi, '$1\n\n$2');
  out = out.replace(/(In plain words:?)\s*/gi, '$1\n\n');
  out = out.replace(/(equation:)\s*/gi, '$1\n\n');
  return out;
}

function isEquationLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/^step\s+\d+/i.test(t) || /^answer$/i.test(t)) return false;
  if (/^(subtract|divide|add|multiply|simplify|therefore|so)\b/i.test(t)) return false;
  if (/[∫∑√±×÷^]/.test(t)) return true;
  if (/=/.test(t) && /[0-9a-z]/i.test(t) && t.length < 100) return true;
  if (/^[0-9x().+\-*/\s]+$/.test(t) && t.length < 60) return true;
  return false;
}

function isSectionTitle(line: string): boolean {
  if (line.length > 64) return false;
  if (/[.!?]$/.test(line) && line.split(' ').length > 6) return false;
  if (/^(note|implementation note|key takeaway|answer|try asking|arriving|quick questions)/i.test(line)) return true;
  if (line.split(' ').length <= 6 && !line.endsWith('.')) return true;
  return false;
}

function isCalloutLine(line: string): boolean {
  return /^(note|implementation note|key takeaway|assumption):/i.test(line);
}

function isPlainWordsIntro(line: string): boolean {
  return /^in plain words:?/i.test(line.trim());
}

function isMathIntro(line: string): boolean {
  return /^to solve for\b/i.test(line.trim());
}

function stepNumber(step: string): string {
  return step.replace(/^step\s+/i, '').trim();
}

function splitCallout(line: string): { label: string; rest: string } {
  const idx = line.indexOf(':');
  if (idx < 0) return { label: 'Note', rest: line };
  return { label: line.slice(0, idx).trim(), rest: line.slice(idx + 1).trim() };
}

export function parseXrogaBlocks(content: string): XrogaBlock[] {
  const normalized = normalizeMathContent(content);
  const blocks: XrogaBlock[] = [];
  const codeRe = /```(\w*)\n?([\s\S]*?)```/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  const pushText = (raw: string, isFirst: boolean) => {
    const text = sanitizePlainAiText(raw).trim();
    if (!text) return;

    const paragraphs = text.split(/\n\n+/).filter((p) => p.trim());
    paragraphs.forEach((para, pIdx) => {
      const lines = para.split('\n').map((l) => l.trim()).filter(Boolean);
      if (!lines.length) return;

      const first = lines[0]!;

      if (isFirst && pIdx === 0 && blocks.length === 0) {
        blocks.push({ type: 'headline', text: first });
        if (lines.length > 1) {
          blocks.push({ type: 'paragraph', text: lines.slice(1).join('\n') });
        }
        return;
      }

      if (isCalloutLine(first)) {
        const { label, rest } = splitCallout(first);
        blocks.push({
          type: 'callout',
          label,
          body: [rest, ...lines.slice(1)].filter(Boolean).join('\n'),
        });
        return;
      }

      if (/^step\s+\d+/i.test(first)) {
        blocks.push({ type: 'math-step', step: first, body: lines.slice(1).join('\n') });
        return;
      }

      if (/^quick check$/i.test(first)) {
        blocks.push({ type: 'callout', label: 'Quick check', body: lines.slice(1).join('\n').trim() });
        return;
      }

      if (/^answer$/i.test(first) && lines.length > 1) {
        blocks.push({ type: 'math-answer', text: lines.slice(1).join('\n').trim() });
        return;
      }

      if (isPlainWordsIntro(first)) {
        const bodyText = first.replace(/^in plain words:?\s*/i, '').trim();
        const rest = lines.slice(1).join('\n').trim();
        blocks.push({
          type: 'callout',
          label: 'In plain words',
          body: [bodyText, rest].filter(Boolean).join('\n'),
        });
        return;
      }

      if (isMathIntro(first)) {
        blocks.push({ type: 'paragraph', text: first });
        const rest = lines.slice(1);
        for (const line of rest) {
          if (isEquationLine(line)) blocks.push({ type: 'math-equation', text: line });
          else if (/^step\s+\d+/i.test(line)) {
            const stepIdx = rest.indexOf(line);
            const stepBody = rest.slice(stepIdx + 1).join('\n');
            blocks.push({ type: 'math-step', step: line, body: stepBody });
            break;
          } else blocks.push({ type: 'paragraph', text: line });
        }
        return;
      }

      if (lines.length === 1 && isEquationLine(first)) {
        blocks.push({ type: 'math-equation', text: first });
        return;
      }

      if (lines.length > 1 && isSectionTitle(first)) {
        const bodyLines = lines.slice(1);
        const allShort = bodyLines.every((l) => l.length < 120);
        if (allShort && bodyLines.length > 1 && /^(try asking|quick questions)/i.test(first)) {
          blocks.push({ type: 'list', items: bodyLines });
          return;
        }
        blocks.push({ type: 'section', title: first, body: bodyLines.join('\n') });
        return;
      }

      blocks.push({ type: 'paragraph', text: lines.join('\n') });
    });
  };

  let isFirstText = true;
  while ((match = codeRe.exec(normalized)) !== null) {
    if (match.index > cursor) {
      pushText(normalized.slice(cursor, match.index), isFirstText);
      isFirstText = false;
    }
    blocks.push({ type: 'code', language: match[1] || undefined, body: match[2]?.trim() ?? '' });
    cursor = match.index + match[0].length;
  }
  if (cursor < normalized.length) {
    pushText(normalized.slice(cursor), isFirstText);
  }

  return blocks;
}

function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /`([^`]+)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <code
        key={k++}
        className="rounded-md bg-slate-200/60 px-1.5 py-0.5 text-[12px] font-mono text-slate-800 dark:bg-white/10 dark:text-slate-200"
      >
        {m[1]}
      </code>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : [text];
}

function MathStepBody({ body }: { body: string }) {
  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
  const prose: string[] = [];
  const equations: string[] = [];
  for (const line of lines) {
    if (/^step\s+\d+/i.test(line) || /^answer$/i.test(line)) break;
    if (isEquationLine(line)) equations.push(line);
    else prose.push(line);
  }
  return (
    <div className="space-y-3">
      {prose.map((line, i) => (
        <p key={`p-${i}`} className="text-[14px] sm:text-[15px] leading-relaxed text-[var(--foreground)]/85">
          {renderInline(line)}
        </p>
      ))}
      {equations.map((eq, i) => (
        <div key={`eq-${i}`} className="xv-math-equation py-1">
          <MathEquation
            text={eq}
            className="text-[16px] sm:text-[17px] text-[var(--foreground)]"
          />
        </div>
      ))}
    </div>
  );
}

function BlockView({ block }: { block: XrogaBlock }) {
  switch (block.type) {
    case 'headline':
      return (
        <h2 className="xv-headline text-[1.125rem] sm:text-[1.25rem] font-semibold leading-snug tracking-tight text-[var(--foreground)] border-b border-slate-200/70 dark:border-white/10 pb-2 mb-1.5">
          {block.text}
        </h2>
      );
    case 'section':
      return (
        <div className="space-y-1.5 pt-1">
          <h3 className="text-[14px] sm:text-[15px] font-semibold tracking-tight text-[var(--foreground)]">
            {block.title}
          </h3>
          <p className="text-[14px] sm:text-[15px] leading-[1.65] text-[var(--foreground)]/85 whitespace-pre-wrap">
            {renderInline(block.body)}
          </p>
        </div>
      );
    case 'paragraph':
      return (
        <p className="text-[14px] sm:text-[15px] leading-[1.65] text-[var(--foreground)]/88 whitespace-pre-wrap">
          {renderInline(block.text)}
        </p>
      );
    case 'math-step': {
      const num = stepNumber(block.step);
      return (
        <div className="xv-math-step rounded-xl border border-[var(--card-border)]/50 bg-gradient-to-br from-[var(--accent)]/[0.04] to-transparent px-4 py-3.5 space-y-2.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/15 text-[13px] font-bold text-[var(--accent)] tabular-nums">
              {num}
            </span>
            <p className="text-[13px] font-semibold uppercase tracking-wide text-[var(--muted)]">Step {num}</p>
          </div>
          <MathStepBody body={block.body} />
        </div>
      );
    }
    case 'math-equation':
      return (
        <div className="xv-math-equation py-2">
          <MathEquation
            text={block.text}
            className="text-[16px] sm:text-[17px] text-[var(--foreground)]"
          />
        </div>
      );
    case 'math-answer':
      return (
        <div className="xv-math-answer rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/[0.08] to-transparent px-4 py-3.5 space-y-2">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Final answer</p>
          <div className="xv-math-equation">
            <MathEquation
              text={block.text}
              className="text-[18px] sm:text-[20px] font-medium text-[var(--foreground)]"
            />
          </div>
        </div>
      );
    case 'callout':
      return (
        <div className="rounded-r-xl border-l-4 border-[#006aff]/50 bg-gradient-to-r from-slate-50/95 to-white/60 px-4 py-3 dark:from-white/5 dark:to-transparent">
          <p className="text-[13px] sm:text-[14px] font-semibold text-[var(--foreground)] mb-1">{block.label}</p>
          <p className="text-[14px] sm:text-[15px] leading-[1.65] text-[var(--foreground)]/88 whitespace-pre-wrap">
            {renderInline(block.body)}
          </p>
        </div>
      );
    case 'list':
      return (
        <div className="space-y-2">
          {block.items.map((item, i) => (
            <p
              key={i}
              className="text-[14px] sm:text-[15px] leading-snug text-[var(--foreground)]/80 pl-3 border-l-2 border-slate-200/80 dark:border-white/15"
            >
              {renderInline(item)}
            </p>
          ))}
        </div>
      );
    case 'code':
      return (
        <pre className="overflow-x-auto rounded-xl border border-slate-200/80 bg-slate-900/[0.04] px-3 py-2.5 text-[12px] sm:text-[13px] font-mono leading-relaxed dark:border-white/10 dark:bg-black/30">
          <code>{block.body}</code>
        </pre>
      );
    default:
      return null;
  }
}

export function PlainAiResponse({
  content,
  streaming,
  className,
  mathMode = false,
}: {
  content: string;
  streaming?: boolean;
  className?: string;
  mathMode?: boolean;
}) {
  const blocks = useMemo(() => parseXrogaBlocks(content), [content]);

  if (!blocks.length && streaming) {
    return (
      <span className="inline-block w-0.5 h-5 bg-[#006aff]/70 animate-pulse rounded-full" />
    );
  }

  return (
    <div className={cn('xv-xroga-response space-y-3', mathMode && 'xv-math-solution', className)}>
      {blocks.map((block, i) => (
        <BlockView key={`${block.type}-${i}`} block={block} />
      ))}
      {streaming && content.length > 0 && (
        <span className="inline-block w-0.5 h-5 ml-0.5 bg-[#006aff]/70 align-middle animate-pulse rounded-full" />
      )}
    </div>
  );
}
