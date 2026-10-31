'use client';

import { isValidElement, lazy, Suspense, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, ExternalLink } from 'lucide-react';
import { remarkSourceCitations, type CitationSource } from '@/lib/xrogaCitations';
import { safeLinkV2 } from './document';
import styles from './response-v2.module.css';
const MathV2 = lazy(() => import('./MathV2'));

export function CodeV2({ text, language }: { text: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  return <figure className={styles.code}><figcaption><span>{language || 'Code'}</span><button type="button" onClick={async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setFailed(false); } catch { setFailed(true); }
  }}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy code'}</button></figcaption><pre tabIndex={0}><code>{text}</code></pre>{failed && <p role="status">Copy unavailable. Select the code to copy it.</p>}</figure>;
}

type Ast = { type: string; value?: string; children?: Ast[]; data?: Record<string, unknown> };
/** Tokenize math only inside prose text nodes, never code, links or HTML. */
export function remarkMathV2() {
  return (tree: Ast) => {
    const walk = (node: Ast) => {
      if (!node.children || ['code', 'inlineCode', 'link', 'html'].includes(node.type)) return;
      node.children = node.children.flatMap(child => {
        if (child.type !== 'text' || !child.value) { walk(child); return [child]; }
        const parts: Ast[] = []; let offset = 0;
        const pattern = /(?<!\\)(\$\$|\\\[|\\\()([\s\S]+?)(\$\$|\\\]|\\\))/g;
        for (const match of child.value.matchAll(pattern)) {
          const close = match[1] === '$$' ? '$$' : match[1] === '\\[' ? '\\]' : '\\)';
          if (match[3] !== close || match[2].length > 10_000) continue;
          if (match.index! > offset) parts.push({ type: 'text', value: child.value.slice(offset, match.index) });
          parts.push({ type: 'mathV2', value: match[0], data: { hName: 'span', hProperties: { 'data-math-v2': match[2], 'data-math-source': match[0], 'data-display': match[1] === '\\(' ? 'false' : 'true' } } });
          offset = match.index! + match[0].length;
        }
        if (offset < child.value.length) parts.push({ type: 'text', value: child.value.slice(offset) });
        return parts.length ? parts : [child];
      });
    }; walk(tree);
  };
}

export function ProseV2({ text, sources = [] }: { text: string; sources?: CitationSource[] }) {
  return <div className={styles.prose} dir="auto"><ReactMarkdown skipHtml
    remarkPlugins={[remarkGfm, remarkMathV2, ...(sources.length ? [remarkSourceCitations(sources)] : [])]}
    urlTransform={url => safeLinkV2(url) ?? ''}
    components={{
      a: ({ href, children }) => href ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>,
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
    }}>{text}</ReactMarkdown></div>;
}
