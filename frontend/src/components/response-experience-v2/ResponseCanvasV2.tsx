'use client';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { displayTitleV2, safeLinkV2, type ResponseDocumentV2, type ResponseNodeV2 } from './document';
import { ProseV2, CodeV2 } from './ProseV2';
import styles from './response-v2.module.css';
import { InlineImageV2, SourceLinkV2, SourceRegistryContextV2 } from './SourceV2';
import { sourceRegistryV2 } from './sourceRegistry';
import { ResourcesV2 } from './ResourcesV2';
import { composeResponseV2, layoutUnitV2, type SemanticPartV2 } from './composition';
import { loadPresentation } from './loadPresentation';
const Chart = lazy(() => loadPresentation(() => import('./ChartV2')));
const Table = lazy(() => loadPresentation(() => import('./DataV2')).then(m => ({ default: m.DataTableV2 })));
const Graph = lazy(() => loadPresentation(() => import('./ArchitectureV2')));
const Calculator = lazy(() => loadPresentation(() => import('./InteractiveV2')).then(m => ({ default: m.CalculatorV2 })));
const Tabs = lazy(() => loadPresentation(() => import('./InteractiveV2')).then(m => ({ default: m.TabsV2 })));

function NodeView({ node, document, grouped = false, stacked = false }: { node: ResponseNodeV2; document: ResponseDocumentV2; grouped?: boolean; stacked?: boolean }) {
  switch (node.kind) {
    case 'prose': return <>{node.title && <h3 className={styles.blockTitle}>{node.title}</h3>}<ProseV2 text={node.text} sources={document.sources} /></>;
    case 'resources': return <ResourcesV2 node={node} />;
    case 'images': return <section>{node.title && <h3 className={styles.blockTitle}>{node.title}</h3>}{node.items.map(item => <figure key={item.id}><InlineImageV2 src={item.url} alt={item.label} />{item.caption && <figcaption>{item.caption}</figcaption>}</figure>)}</section>;
    case 'code': return <><h3 className={styles.blockTitle}>{node.title}</h3><CodeV2 text={node.text} language={node.language} /></>;
    case 'table': return <Table node={node} stacked={stacked} />;
    case 'chart': return <Chart node={node} showSourceData={!grouped} />;
    case 'calculator': return <Calculator key={JSON.stringify([node.operation, node.inputs])} node={node} />;
    case 'tabs': return <Tabs key={JSON.stringify(node.items.map(item => item.id))} node={node} sources={document.sources} />;
    case 'graph': return <Graph node={node} />;
    case 'citation': return <section className={styles.source}><div><SourceLinkV2 url={node.url} title={node.label} /><h3>{node.label}</h3></div>{node.excerpt && <p>{node.excerpt}</p>}</section>;
    case 'metrics': return <dl className={styles.metrics}>{node.items.map(item => <div key={item.id}><dt>{item.label}</dt><dd>{item.value == null ? 'Unavailable' : String(item.value)}{item.unit ? ` ${item.unit}` : ''}</dd></div>)}</dl>;
    case 'notice': return <aside className={styles.notice} data-tone={node.tone}>{node.title && <h3>{node.title}</h3>}<ProseV2 text={node.text} sources={document.sources} /></aside>;
    case 'accordion': return <section>{node.title && <h3 className={styles.blockTitle}>{node.title}</h3>}{node.items.map(item => <section key={item.id} className={styles.disclosure}><h4>{item.title}</h4><ProseV2 text={item.content} sources={document.sources} /></section>)}</section>;
    case 'timeline': return <section>{node.title && <h3 className={styles.blockTitle}>{node.title}</h3>}<ol className={styles.timeline}>{node.items.map(item => <li key={item.id}><div><strong>{item.label}</strong>{item.date && <time>{item.date}</time>}{item.status && <span className={styles.status}>{item.status}</span>}</div>{item.detail && <p>{item.detail}</p>}</li>)}</ol></section>;
    case 'progress': return <section className={styles.progress}>{node.title && <h3 className={styles.blockTitle}>{node.title}</h3>}{node.items.map(item => <div key={item.id}><label>{item.label}<progress aria-label={item.label} value={item.value} max={item.max} /></label><span>{item.value} / {item.max}{item.unit ? ` ${item.unit}` : ''}{item.status ? ` · ${item.status}` : ''}</span>{item.detail && <p>{item.detail}</p>}</div>)}</section>;
  }
}

function ComposedPart({ part, document, width }: { part: SemanticPartV2; document: ResponseDocumentV2; width: number }) {
  if (part.type === 'section') return <section className={styles.editorialSection} data-depth={part.level}>
    <ComposedPart part={part.heading} document={document} width={width} />
    <div className={styles.sectionBody}>{part.children.map(child => <ComposedPart key={child.id} part={child} document={document} width={width} />)}</div>
  </section>;
  const layout = layoutUnitV2(part, width);
  const node = part.node;
  return <div className={`${layout === 'reading' ? styles.measure : styles.wide} ${styles.semanticUnit}`} data-role={part.role} data-layout={layout}>
    {node.description && !['calculator', 'graph'].includes(node.kind) && <ProseV2 text={node.description} sources={document.sources} />}
    <Suspense fallback={<p className={styles.loading} role="status">Loading presentation...</p>}>
      <NodeView node={{ ...node, title: part.suppressRepeatedTitle ? undefined : displayTitleV2(node.title) }} document={document} grouped={!!part.relatedData} stacked={layout === 'stacked-comparison'} />
    </Suspense>
  </div>;
}

export default function ResponseCanvasV2({ document }: { document: ResponseDocumentV2 }) {
  const root = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(880);
  const composition = useMemo(() => composeResponseV2(document), [document]);
  const registry = useMemo(() => sourceRegistryV2(document), [document]);
  useEffect(() => {
    const element = root.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => {
      const next = entries[0]?.contentRect.width;
      if (next && next > 0) setWidth(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const references = composition.unplacedSourceKeys.flatMap(key => { const source = registry.get(key); return source ? [{ key, source }] : []; });
  return <SourceRegistryContextV2.Provider value={registry}><article ref={root} className={styles.canvas} data-response-v2="true" data-composition="semantic" aria-label="Xroga response" aria-busy={document.streaming}>
    <div className={styles.editorialBody}>{composition.parts.map(part => <ComposedPart key={part.id} part={part} document={document} width={width} />)}</div>
    {references.length > 0 && <details className={`${styles.sources} ${styles.measure}`}><summary>References - {references.length}</summary><ul>{references.map(({ key, source }) => <li key={key}><SourceLinkV2 url={source.url} title={source.title} /><a href={safeLinkV2(source.url)} target="_blank" rel="noopener noreferrer">{source.title}</a></li>)}</ul></details>}
    {document.streaming && <span className={styles.streaming} role="status">Receiving response</span>}
  </article></SourceRegistryContextV2.Provider>;
}
