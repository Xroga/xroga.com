'use client';

import { isValidElement, lazy, Suspense, useState, useEffect, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { normalizeMathDelimitersV2, remarkMathPresentationV2 } from './mathSyntax';
import { Copy, Check, ExternalLink } from 'lucide-react';
import { remarkSourceCitations, type CitationSource } from '@/lib/xrogaCitations';
import { safeLinkV2 } from './document';
import styles from './response-v2.module.css';
const MathV2 = lazy(() => import('./MathV2'));

export function CodeV2({ text, language }: { text: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setCopied(false); setFailed(false); }, [text]);
  return <figure className={styles.code}><figcaption><span>{language || 'Code'}</span><button type="button" onClick={async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setFailed(false); } catch { setFailed(true); }
  }}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy code'}</button></figcaption><pre tabIndex={0}><code>{text}</code></pre>{failed && <p role="status">Copy unavailable. Select the code to copy it.</p>}</figure>;
}

export function ProseV2({ text, sources = [] }: { text: string; sources?: CitationSource[] }) {
  return <div className={styles.prose} dir="auto"><ReactMarkdown skipHtml
    remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: false }], remarkMathPresentationV2, ...(sources.length ? [remarkSourceCitations(sources)] : [])]}
    urlTransform={url => safeLinkV2(url) ?? ''}
    components={{
      p: ({ children }) => <p dir="auto">{children}</p>,
      li: ({ children }) => <li dir="auto">{children}</li>,
      a: ({ href, children }) => href ? <a href={href} className={/^\[\d+\]$/.test(String(children)) ? styles.citation : undefined} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>,
      img: ({ alt, src }) => <span>{alt || 'Image'}{src && <a href={src} target="_blank" rel="noopener noreferrer"> View image <ExternalLink size={12} /></a>}</span>,
      pre: ({ children }) => {
        if (!isValidElement<{ children?: ReactNode; className?: string }>(children)) return <pre>{children}</pre>;
        return <CodeV2 text={String(children.props.children ?? '')} language={children.props.className?.replace(/^language-/, '')} />;
      },
      code: ({ children, className }) => <code className={className}>{children}</code>,
      table: ({ children }) => <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Response table"><table>{children}</table></div>,
      span: ({ children, ...props }) => {
        const data = props as Record<string, unknown>;
        return typeof data['data-math-v2'] === 'string' ? <Suspense fallback={<span>{String(data['data-math-source'])}</span>}><MathV2 formula={data['data-math-v2']} source={String(data['data-math-source'])} display={data['data-display'] === 'true'} /></Suspense> : <span>{children as ReactNode}</span>;
      },
    }}>{normalizeMathDelimitersV2(text)}</ReactMarkdown></div>;
}
