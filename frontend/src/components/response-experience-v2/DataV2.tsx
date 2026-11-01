'use client';
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { displayTitleV2, type ResponseNodeV2 } from './document';
import styles from './response-v2.module.css';
import { isLinearFlowV2, graphLayersV2 } from './graphLayout';
export type TableNode = Extract<ResponseNodeV2, { kind: 'table' }>;
export function DataTableV2({ node, stacked = false }: { node: TableNode; stacked?: boolean }) {
  const [query, setQuery] = useState(''); const [sort, setSort] = useState<{ key: string; descending: boolean } | null>(null); const [page, setPage] = useState(0);
  const rows = useMemo(() => {
    const filtered = node.rows.filter(row => !query || node.columns.some(c => String(row[c.key] ?? '').toLocaleLowerCase().includes(query.toLocaleLowerCase())));
    if (!sort) return filtered;
    return [...filtered].sort((a, b) => { const x = a[sort.key], y = b[sort.key]; const diff = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true }); return sort.descending ? -diff : diff; });
  }, [node, query, sort]);
  const current = Math.min(page, Math.max(0, Math.ceil(rows.length / 50) - 1));
  return <section className={styles.data}>
    {node.rows.length > 10 && <label className={styles.filter}>Filter rows<input type="search" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} /></label>}
    {stacked ? <div className={styles.comparisonRows}>{displayTitleV2(node.title) && <h3>{node.title}</h3>}{rows.map((row, index) => <section key={index}><h4>{String(row[node.columns[0].key] ?? 'Unavailable')}</h4><dl>{node.columns.slice(1).map(column => <div key={column.key}><dt>{column.label}</dt><dd>{row[column.key] == null ? 'Unavailable' : String(row[column.key])}</dd></div>)}</dl></section>)}</div> : <div className={styles.tableScroll} tabIndex={0} role="region" aria-label={node.title || 'Response data'}><table><caption className={displayTitleV2(node.title) ? undefined : styles.visuallyHidden}>{displayTitleV2(node.title) || node.columns.map(c => c.label).join(', ')}</caption><thead><tr>{node.columns.map(c => <th key={c.key} scope="col" aria-sort={sort?.key === c.key ? sort.descending ? 'descending' : 'ascending' : 'none'}><button type="button" onClick={() => { setSort({ key: c.key, descending: sort?.key === c.key && !sort.descending }); setPage(0); }}>{c.label}{sort?.key === c.key && (sort.descending ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}</button></th>)}</tr></thead><tbody>{rows.slice(current * 50, (current + 1) * 50).map((row, index) => <tr key={current * 50 + index}>{node.columns.map(c => <td key={c.key} data-numeric={typeof row[c.key] === 'number'}>{row[c.key] == null ? 'Unavailable' : String(row[c.key])}</td>)}</tr>)}</tbody></table></div>}
    {!rows.length && <p>No matching rows.</p>}
    {rows.length > 50 && <nav aria-label="Table pages" className={styles.pagination}><button type="button" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</button><span>Page {current + 1} of {Math.ceil(rows.length / 50)} · {rows.length} rows</span><button type="button" disabled={(current + 1) * 50 >= rows.length} onClick={() => setPage(current + 1)}>Next</button></nav>}
  </section>;
}

export function GraphV2({ node }: { node: Extract<ResponseNodeV2, { kind: 'graph' }> }) {
  const names = new Map(node.nodes.map(n => [n.id, n.label]));
  const linear = isLinearFlowV2(node);
  const layers = graphLayersV2(node);
  if (!linear && layers && layers.length > 1 && node.nodes.length <= 12 && layers.every(layer => layer.length <= 3)) return <figure className={styles.branchFlow}>
    {node.title && <figcaption>{node.title}</figcaption>}{node.description && <p>{node.description}</p>}
    <div className={styles.flowLayers}>{layers.map((layer, rank) => <div className={styles.flowLayer} key={rank}>{layer.map(id => {
      const item = node.nodes.find(candidate => candidate.id === id)!;
      return <section key={id}><h4>{item.label}</h4>{item.detail && <p>{item.detail}</p>}
        {node.edges.some(edge => edge.source === id) && <ul aria-label={`Connections from ${item.label}`}>{node.edges.filter(edge => edge.source === id).map((edge, index) => <li key={index}><span aria-hidden="true">↓ </span>{names.get(edge.target)}{edge.label && <small>{edge.label}</small>}</li>)}</ul>}
      </section>;
    })}</div>)}</div>
  </figure>;
  // Keep supplied order and explicit edges, including cycles and disconnected
  // nodes. Never fabricate a sequential flow from an unordered list.
  return <figure className={styles.graph} data-linear={linear}><figcaption>{node.title || 'Workflow'}</figcaption>{node.description && <p>{node.description}</p>}<ol>{node.nodes.map((n, index) => <li key={n.id}>{linear && <span className={styles.stepIndex} aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>}<div><strong>{n.label}</strong>{n.detail && <p>{n.detail}</p>}{node.edges.some(e => e.source === n.id) && <ul aria-label={`Connections from ${n.label}`}>{node.edges.filter(e => e.source === n.id).map((e, i) => <li key={i}><span aria-hidden="true">↓</span><span>{names.get(e.target)}{e.label && <small>{e.label}</small>}</span></li>)}</ul>}</div></li>)}</ol></figure>;
}
