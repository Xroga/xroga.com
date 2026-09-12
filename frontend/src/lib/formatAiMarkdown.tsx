'use client';

import React from 'react';
import ReactMarkdown, { type Components, type UrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';

function joinClasses(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(' ');
}

/** Blocks script/data protocols while retaining normal web, mail, fragment and app-relative links. */
export const safeMarkdownUrl: UrlTransform = (url, key) => {
  const value = url.trim();
  if (!value) return '';
  if (value.startsWith('#') || value.startsWith('/') || value.startsWith('./') || value.startsWith('../')) return value;
  try {
    const parsed = new URL(value);
    if (key === 'src') return parsed.protocol === 'https:' ? value : '';
    return ['https:', 'http:', 'mailto:'].includes(parsed.protocol) ? value : '';
  } catch {
    return '';
  }
};

const components: Components = {
  h1: ({ children }) => <h3 className="mt-1 border-b border-[var(--card-border)]/30 pb-1 text-lg font-bold tracking-tight text-[var(--foreground)] sm:text-xl">{children}</h3>,
  h2: ({ children }) => <h3 className="mt-0.5 border-b border-[var(--card-border)]/30 pb-1 text-base font-bold tracking-tight text-[var(--foreground)] sm:text-lg">{children}</h3>,
  h3: ({ children }) => <h4 className="text-[15px] font-bold tracking-tight text-[var(--accent)]">{children}</h4>,
  h4: ({ children }) => <h5 className="text-[14px] font-semibold text-[var(--foreground)]">{children}</h5>,
  p: ({ children }) => <p className="text-[var(--foreground)]/95">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-[var(--foreground)]">{children}</strong>,
  em: ({ children }) => <em className="italic text-[var(--foreground)]/90">{children}</em>,
  a: ({ href, children }) => <a href={href} target={href?.startsWith('http') ? '_blank' : undefined} rel={href?.startsWith('http') ? 'noreferrer noopener' : undefined} className="font-medium text-[var(--accent)] underline decoration-[var(--accent)]/35 underline-offset-2 hover:decoration-[var(--accent)]">{children}</a>,
  ul: ({ children }) => <ul className="list-disc space-y-1 pl-5 marker:text-[var(--accent)]">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5 marker:font-semibold marker:text-[var(--accent)]">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5 text-[var(--foreground)]/95">{children}</li>,
  blockquote: ({ children }) => <blockquote className="rounded-r-lg border-l-2 border-[var(--accent)]/50 bg-[var(--accent)]/5 px-3 py-2 text-[var(--foreground)]/85">{children}</blockquote>,
  hr: () => <hr className="my-2 border-[var(--card-border)]/50" />,
  code: ({ className, children }) => {
    const fenced = Boolean(className?.startsWith('language-')) || String(children).includes('\n');
    return fenced
      ? <code className={joinClasses('block overflow-x-auto whitespace-pre p-3 font-mono text-[12px] leading-relaxed text-[var(--foreground)]', className)}>{children}</code>
      : <code className="rounded bg-[var(--muted)]/15 px-1 py-0.5 font-mono text-[11px] text-[var(--accent)]">{children}</code>;
  },
  pre: ({ children }) => <pre className="overflow-x-auto rounded-xl border border-[var(--card-border)]/60 bg-[var(--foreground)]/[0.035]">{children}</pre>,
  table: ({ children }) => <div className="overflow-x-auto rounded-xl border border-[var(--card-border)]/60"><table className="w-full text-[13px] sm:text-[14px]">{children}</table></div>,
  thead: ({ children }) => <thead className="border-b border-[var(--card-border)]/50 bg-[var(--accent)]/5">{children}</thead>,
  th: ({ children }) => <th className="px-3 py-2 text-left font-semibold text-[var(--foreground)]">{children}</th>,
  td: ({ children }) => <td className="border-t border-[var(--card-border)]/30 px-3 py-2 text-[var(--foreground)]/90">{children}</td>,
};

export function FormattedAiMarkdown({ content, className }: { content: string; streaming?: boolean; className?: string }) {
  return (
    <div className={joinClasses('xv-formatted-response space-y-3 text-[14px] leading-relaxed sm:text-[15px] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={safeMarkdownUrl} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
