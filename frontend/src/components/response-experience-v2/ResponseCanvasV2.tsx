'use client';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { displayTitleV2, safeLinkV2, type ResponseDocumentV2, type ResponseNodeV2 } from './document';
import { ProseV2, CodeV2 } from './ProseV2';
import styles from './response-v2.module.css';
import { InlineImageV2, SourceLinkV2, SourceRegistryContextV2 } from './SourceV2';
import { sourceRegistryV2 } from './sourceRegistry';
import { ResponseSources } from '../terminal/ResponseSources';
import { ResourcesV2 } from './ResourcesV2';
import { EntityIdentityV2 } from './EntityIdentityV2';
import { StatusBadgeV2 } from './StatusBadgeV2';
import { responseIcon } from '@/lib/responseIcons';
import { resourceIdentityV2 } from './entityRegistry';
import { composeResponseV2, layoutUnitV2, type SemanticPartV2 } from './composition';
import { loadPresentation } from './loadPresentation';
const Chart = lazy(() => loadPresentation(() => import('./ChartV2')));
const Table = lazy(() => loadPresentation(() => import('./DataV2')).then(m => ({ default: m.DataTableV2 })));
const Graph = lazy(() => loadPresentation(() => import('./ArchitectureV2')));
const Calculator = lazy(() => loadPresentation(() => import('./InteractiveV2')).then(m => ({ default: m.CalculatorV2 })));
const Tabs = lazy(() => loadPresentation(() => import('./InteractiveV2')).then(m => ({ default: m.TabsV2 })));

function NodeView({ node, document, grouped = false, stacked = false }: { node: ResponseNodeV2; document: ResponseDocumentV2; grouped?: boolean; stacked?: boolean }) {
  switch (node.kind) {
    case 'cards': {
      const resources = node.items.every(item => !!resourceIdentityV2(item.title, item.url, item.entityId));
      return <section>{node.title && <h3 className={styles.blockTitle}>{node.title}</h3>}<div className={resources ? styles.roleRows : styles.comparisonCards}>{node.items.map(item => <section key={item.id} className={resources ? styles.roleRow : styles.comparisonCard}>
      {item.imageUrl && <InlineImageV2 src={item.imageUrl} alt={item.title} />}
      <header><div className={styles.cardHead}>{(() => { const Icon = responseIcon(item.icon); return Icon ? <span className={styles.cardIcon} aria-hidden="true"><Icon size={18} strokeWidth={1.9} /></span> : null; })()}<h4><EntityIdentityV2 label={item.title} url={item.url} entityId={item.entityId} plain={!!responseIcon(item.icon)} /></h4></div>{item.badge && <StatusBadgeV2 label={item.badge} />}</header>
      {item.subtitle && <p className={styles.cardSubtitle}>{item.subtitle}</p>}
      {item.description && <ProseV2 text={item.description} sources={document.sources} />}
      {item.recommended && <p className={styles.cardSubtitle}>Suggested in this answer</p>}
      {item.metrics && <dl>{Object.entries(item.metrics).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value == null ? 'Not supplied' : String(value)}</dd></div>)}</dl>}
      {item.url && item.actionLabel && safeLinkV2(item.url) && <a href={safeLinkV2(item.url)} target="_blank" rel="noopener noreferrer">{item.actionLabel}</a>}
    </section>)}</div></section>;
    }
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
    case 'metrics': return <dl className={styles.metrics}>{node.items.map(item => <div key={item.id} data-tone={item.tone ?? 'neutral'}><dt>{item.label}</dt><dd>{item.tone === 'positive' && <span aria-hidden="true">▲ </span>}{item.tone === 'negative' && <span aria-hidden="true">▼ </span>}{item.value == null ? 'Unavailable' : String(item.value)}{item.unit ? ` ${item.unit}` : ''}{item.tone === 'positive' && <span className={styles.visuallyHidden}> (gain)</span>}{item.tone === 'negative' && <span className={styles.visuallyHidden}> (loss or cost)</span>}</dd></div>)}</dl>;
    case 'notice': return <aside className={styles.notice} data-tone={node.tone}>{node.title && <h3>{node.title}</h3>}<ProseV2 text={node.text} sources={document.sources} /></aside>;
    case 'accordion': return <section>{node.title && <h3 className={styles.blockTitle}>{node.title}</h3>}{node.items.map(item => <section key={item.id} className={styles.disclosure}><h4>{item.title}</h4><ProseV2 text={item.content} sources={document.sources} /></section>)}</section>;
    case 'timeline': return <section>{node.title && <h3 className={styles.blockTitle}>{node.title}</h3>}<ol className={styles.timeline}>{node.items.map(item => <li key={item.id}><div>{(() => { const Icon = responseIcon(item.icon); return Icon ? <span className={styles.cardIcon} aria-hidden="true"><Icon size={16} strokeWidth={1.9} /></span> : null; })()}<strong>{item.label}</strong>{item.date && <time>{item.date}</time>}{item.status && <StatusBadgeV2 label={item.status} />}</div>{item.detail && <p>{item.detail}</p>}</li>)}</ol></section>;
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
  const references = composition.unplacedSourceKeys.flatMap(key => { const source = registry.get(key); return source ? [source] : []; });
  return <SourceRegistryContextV2.Provider value={registry}><article ref={root} className={styles.canvas} data-response-v2="true" data-composition="semantic" aria-label="Xroga response" aria-busy={document.streaming}>
    <div className={styles.editorialBody}>{composition.parts.map(part => <ComposedPart key={part.id} part={part} document={document} width={width} />)}</div>
    {references.length > 0 && <div className={styles.measure}><ResponseSources sources={references} referral={false} /></div>}
    {document.streaming && <span className={styles.streaming} role="status">Receiving response</span>}
  </article></SourceRegistryContextV2.Provider>;
}
