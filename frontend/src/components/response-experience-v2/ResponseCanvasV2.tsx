'use client';
import { lazy, Suspense } from 'react';
import { planPresentationV2, presentationFamilyV2, displayTitleV2, safeLinkV2, type ResponseDocumentV2, type ResponseNodeV2 } from './document';
import { ProseV2, CodeV2 } from './ProseV2';
import styles from './response-v2.module.css';
import { InlineImageV2, SourceLinkV2, SourceRegistryContextV2 } from './SourceV2';
import { sourceRegistryV2 } from './sourceRegistry';
import { ResourcesV2 } from './ResourcesV2';
const Chart = lazy(() => import('./ChartV2'));
const Table = lazy(() => import('./DataV2').then(m => ({ default: m.DataTableV2 })));
const Graph = lazy(() => import('./DataV2').then(m => ({ default: m.GraphV2 })));
const Calculator = lazy(() => import('./InteractiveV2').then(m => ({ default: m.CalculatorV2 })));
const Tabs = lazy(() => import('./InteractiveV2').then(m => ({ default: m.TabsV2 })));

function NodeView({ node, document, grouped = false }: { node: ResponseNodeV2; document: ResponseDocumentV2; grouped?: boolean }) {
  switch (node.kind) {
    case 'prose': return <>{node.title && <h3 className={styles.blockTitle}>{node.title}</h3>}<ProseV2 text={node.text} sources={document.sources} /></>;
    case 'resources': return <ResourcesV2 node={node} />;
    case 'images': return <section>{node.title && <h3 className={styles.blockTitle}>{node.title}</h3>}{node.items.map(item => <figure key={item.id}><InlineImageV2 src={item.url} alt={item.label} />{item.caption && <figcaption>{item.caption}</figcaption>}</figure>)}</section>;
    case 'code': return <><h3 className={styles.blockTitle}>{node.title}</h3><CodeV2 text={node.text} language={node.language} /></>;
    case 'table': return <Table node={node} />;
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

export default function ResponseCanvasV2({ document }: { document: ResponseDocumentV2 }) {
  const registry = sourceRegistryV2(document);
  return <SourceRegistryContextV2.Provider value={registry}><article className={styles.canvas} data-response-v2="true" data-composition={presentationFamilyV2(document)} aria-label="Xroga response" aria-busy={document.streaming}>
    {planPresentationV2(document).map(group => <div className={`${group.width === 'wide' ? styles.wide : styles.measure} ${styles.group}`} data-group={group.kind} key={group.id}>
      {group.nodes.map(node => <div key={node.id}>{node.description && !['calculator', 'graph'].includes(node.kind) && <ProseV2 text={node.description} sources={document.sources} />}<Suspense fallback={<p className={styles.loading} role="status">Loading presentation...</p>}><NodeView node={{ ...node, title: displayTitleV2(node.title) }} document={document} grouped={group.nodes.length > 1} /></Suspense></div>)}
    </div>)}
    {registry.size > 0 && <details className={`${styles.sources} ${styles.measure}`}><summary>References - {registry.size}</summary><ul>{[...registry.entries()].map(([key, source]) => <li key={key}><SourceLinkV2 url={source.url} title={source.title} /><a href={safeLinkV2(source.url)} target="_blank" rel="noopener noreferrer">{source.title}</a></li>)}</ul></details>}
    {document.streaming && <span className={styles.streaming} role="status">Receiving response</span>}
  </article></SourceRegistryContextV2.Provider>;
}
