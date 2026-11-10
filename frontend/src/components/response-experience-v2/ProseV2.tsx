'use client';

import { isValidElement, lazy, Suspense, useId, useRef, useState, useEffect, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { normalizeMathDelimitersV2, remarkMathPresentationV2 } from './mathSyntax';
import { Copy, Check } from 'lucide-react';
import { highlightCode, isLightColor, type HighlightedToken } from '@/lib/codeHighlight';
import { InlineImageV2, SourceLinkV2, SourceMarkV2 } from './SourceV2';
import type { CitationSource } from '@/lib/xrogaCitations';
import { remarkCitationsV2 } from './sourceRegistry';
import { safeLinkV2 } from './document';
import styles from './response-v2.module.css';
import { ComparisonV2 } from './ComparisonV2';
import { remarkEntityRolesV2 } from './entityRegistry';
import { supportedDiagramV2 } from './diagramSyntax';
const MathV2 = lazy(() => import('./MathV2'));
const ArchitectureV2 = lazy(() => import('./ArchitectureV2'));

export function CodeV2({ text, language }: { text: string; language?: string }) {
  const id = useId();
  const diagram = language?.toLowerCase() === 'mermaid' ? supportedDiagramV2(text) : undefined;
  if (diagram) return <><Suspense fallback={<PlainCodeV2 text={text} language={language} />}><ArchitectureV2 node={{ ...diagram, id: `diagram-${id.replaceAll(':', '')}` }} /></Suspense><details><summary>Diagram source</summary><PlainCodeV2 text={text} language={language} /></details></>;
  return <PlainCodeV2 text={text} language={language} />;
}

function PlainCodeV2({ text, language }: { text: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const [lines, setLines] = useState<HighlightedToken[][] | null>(null);
  const [onDark, setOnDark] = useState(false);
  const figure = useRef<HTMLElement>(null);
  useEffect(() => { setCopied(false); setFailed(false); }, [text]);
  // Highlight lazily. The plain code is shown immediately and stays if highlighting is unavailable for any reason.
  useEffect(() => {
    let cancelled = false;
    setLines(null);
    void highlightCode(text, language).then(result => { if (!cancelled) setLines(result); });
    return () => { cancelled = true; };
  }, [text, language]);
  // The palette follows the theme actually in use: light text means a dark theme.
  useEffect(() => { if (figure.current) setOnDark(isLightColor(getComputedStyle(figure.current).color)); }, [lines]);
  return <figure ref={figure} className={styles.code}><figcaption><span>{language || 'Code'}</span><button type="button" onClick={async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setFailed(false); } catch { setFailed(true); }
  }}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy code'}</button></figcaption><pre tabIndex={0}><code>{lines ? lines.map((line, row) => <span key={row} className={styles.codeLine}>{line.map((token, index) => <span key={index} style={{ color: (onDark ? token.dark : token.light) || undefined }}>{token.content}</span>)}{row < lines.length - 1 ? '\n' : ''}</span>) : text}</code></pre>{failed && <p role="status">Copy unavailable. Select the code to copy it.</p>}</figure>;
}

export function ProseV2({ text, sources = [] }: { text: string; sources?: CitationSource[] }) {
  return <div className={styles.prose} dir="auto"><ReactMarkdown skipHtml
    remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: false }], remarkMathPresentationV2, remarkEntityRolesV2, ...(sources.length ? [remarkCitationsV2(sources)] : [])]}
    urlTransform={url => safeLinkV2(url) ?? ''}
    components={{
      p: ({ children, node }) => <p dir="auto" className={node?.properties?.['data-resource-v2'] === 'true' ? styles.entityRole : undefined}>{children}</p>,
      li: ({ children, node }) => <li dir="auto" className={node?.properties?.['data-resource-v2'] === 'true' ? styles.entityRole : undefined}>{children}</li>,
      a: ({ href, children }) => {
        if (!href) return <span>{children}</span>;
        if (href.startsWith('/')) return <a href={href}>{children}</a>;
        const match = /^\[(\d+)\]$/.exec(String(children));
        const source = match && sources[Number(match[1]) - 1];
        if (source && safeLinkV2(source.url) === href) return <SourceLinkV2 url={href} title={source.title} siteName={source.siteName} number={Number(match![1])} />;
        return <a href={href} target="_blank" rel="noopener noreferrer"><SourceMarkV2 url={href} /> {children}</a>;
      },
      img: ({ alt, src }) => <InlineImageV2 key={src} alt={alt} src={src} />,
      pre: ({ children }) => {
        if (!isValidElement<{ children?: ReactNode; className?: string }>(children)) return <pre>{children}</pre>;
        return <CodeV2 text={String(children.props.children ?? '')} language={children.props.className?.replace(/^language-/, '')} />;
      },
      code: ({ children, className }) => <code className={className}>{children}</code>,
      table: ({ children }) => <ComparisonV2>{children}</ComparisonV2>,
      span: ({ children, ...props }) => {
        const data = props as Record<string, unknown>;
        return typeof data['data-math-v2'] === 'string' ? <Suspense fallback={<span>{String(data['data-math-source'])}</span>}><MathV2 formula={data['data-math-v2']} source={String(data['data-math-source'])} display={data['data-display'] === 'true'} /></Suspense> : <span>{children as ReactNode}</span>;
      },
    }}>{normalizeMathDelimitersV2(text)}</ReactMarkdown></div>;
}
