'use client';
import { lazy, Suspense } from 'react';
import { ExternalLink } from 'lucide-react';
import { planPresentationV2, presentationFamilyV2, displayTitleV2, safeLinkV2, type ResponseDocumentV2, type ResponseNodeV2 } from './document';
import { ProseV2, CodeV2 } from './ProseV2';
import styles from './response-v2.module.css';
const Chart = lazy(() => import('./ChartV2'));
const Table = lazy(() => import('./DataV2').then(m => ({ default: m.DataTableV2 })));
const Graph = lazy(() => import('./DataV2').then(m => ({ default: m.GraphV2 })));
const Calculator = lazy(() => import('./InteractiveV2').then(m => ({ default: m.CalculatorV2 })));
const Tabs = lazy(() => import('./InteractiveV2').then(m => ({ default: m.TabsV2 })));

function NodeView({ node, document, grouped = false }: { node: ResponseNodeV2; document: ResponseDocumentV2; grouped?: boolean }) {
  switch (node.kind) {
    case 'prose': return <ProseV2 text={node.text} sources={document.sources} />;
    case 'code': return <><h3 className={styles.blockTitle}>{node.title}</h3><CodeV2 text={node.text} language={node.language} /></>;
    case 'table': return <Table node={node} />;
    case 'chart': return <Chart node={node} showSourceData={!grouped} />;
    case 'calculator': return <Calculator key={JSON.stringify([node.operation, node.inputs])} node={node} />;
    case 'tabs': return <Tabs key={JSON.stringify(node.items.map(item => item.id))} node={node} />;
    case 'graph': return <Graph node={node} />;
    case 'citation': return <details className={styles.source}><summary>{node.label}</summary>{node.excerpt && <p>{node.excerpt}</p>}{safeLinkV2(node.url) ? <a href={safeLinkV2(node.url)} target="_blank" rel="noopener noreferrer">Open source <ExternalLink size={14} /></a> : <p>Source URL unavailable.</p>}</details>;
    case 'metrics': return <dl className={styles.metrics}>{node.items.map(item => <div key={item.id}><dt>{item.label}</dt><dd>{item.value == null ? 'Unavailable' : String(item.value)}{item.unit ? ` ${item.unit}` : ''}</dd></div>)}</dl>;
    case 'notice': return <aside className={styles.notice} data-tone={node.tone}>{node.title && <h3>{node.title}</h3>}<ProseV2 text={node.text} /></aside>;
    case 'accordion': return <section>{node.title && <h3 className={styles.blockTitle}>{node.title}</h3>}{node.items.map(item => <details key={item.id} className={styles.disclosure}><summary>{item.title}</summary><ProseV2 text={item.content} /></details>)}</section>;
    case 'timeline': return <section>{node.title && <h3 className={styles.blockTitle}>{node.title}</h3>}<ol className={styles.timeline}>{node.items.map(item => <li key={item.id}><div><strong>{item.label}</strong>{item.date && <time>{item.date}</time>}{item.status && <span className={styles.status}>{item.status}</span>}</div>{item.detail && <p>{item.detail}</p>}</li>)}</ol></section>;
    case 'progress': return <section className={styles.progress}>{node.title && <h3 className={styles.blockTitle}>{node.title}</h3>}{node.items.map(item => <div key={item.id}><label>{item.label}<progress aria-label={item.label} value={item.value} max={item.max} /></label><span>{item.value} / {item.max}{item.unit ? ` ${item.unit}` : ''}{item.status ? ` · ${item.status}` : ''}</span>{item.detail && <p>{item.detail}</p>}</div>)}</section>;
  }
}

export default function ResponseCanvasV2({ document }: { document: ResponseDocumentV2 }) {
  return <article className={styles.canvas} data-response-v2="true" data-composition={presentationFamilyV2(document)} aria-label="Xroga response" aria-busy={document.streaming}>
    {planPresentationV2(document).map(group => <div className={`${group.width === 'wide' ? styles.wide : styles.measure} ${styles.group}`} data-group={group.kind} key={group.id}>
      {group.nodes.map(node => <div key={node.id}><Suspense fallback={<p className={styles.loading} role="status">Loading presentation...</p>}>{node.kind === 'table' && group.nodes[0].kind === 'chart' ? <details className={styles.disclosure}><summary>View source data</summary><Table node={{ ...node, title: displayTitleV2(node.title) === displayTitleV2(group.nodes[0].title) ? undefined : displayTitleV2(node.title) }} /></details> : <NodeView node={{ ...node, title: displayTitleV2(node.title) }} document={document} grouped={group.nodes.length > 1} />}</Suspense></div>)}
    </div>)}
    {document.sources.length > 0 && <details className={`${styles.sources} ${styles.measure}`}><summary>Sources · {document.sources.length}</summary><ol>{document.sources.map((source, index) => <li key={`${index}:${source.url}`}><span>{index + 1}</span><div>{safeLinkV2(source.url) ? <a href={safeLinkV2(source.url)} target="_blank" rel="noopener noreferrer">{source.title} <ExternalLink size={13} /></a> : source.title}{source.snippet && <p>{source.snippet}</p>}</div></li>)}</ol></details>}
    {document.streaming && <span className={styles.streaming} role="status">Receiving response</span>}
  </article>;
}
