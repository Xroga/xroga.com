'use client';

/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from 'react';
import { Braces, ChevronRight, ExternalLink, GitBranch, LoaderCircle, TriangleAlert } from 'lucide-react';

import { InlineCopyButton } from '@/components/ui/InlineCopyButton';
import { safeArtifactUri } from '@/lib/universalOutput';
import type { XrogaBlock } from '@/lib/xrogaBlocks';

type StructuredType = 'card-grid' | 'tree' | 'json' | 'api-request';
type StructuredBlock = Extract<XrogaBlock, { type: StructuredType }>;

function Surface({
  children,
  title,
  description,
  state = 'ready',
}: {
  children: React.ReactNode;
  title?: string;
  description?: string;
  state?: StructuredBlock['state'];
}) {
  if (state === 'loading') return <section className="xv-response-surface max-w-[960px] rounded-2xl border border-[var(--border)] p-5" aria-busy="true"><LoaderCircle className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" /><span className="sr-only">Loading output</span></section>;
  if (state === 'empty') return <section className="xv-response-surface max-w-[960px] rounded-2xl border border-dashed border-[var(--border)] p-5 text-sm text-[var(--muted)]">No data is available for this output.</section>;
  if (state === 'error' || state === 'unsupported') return <section className="xv-response-surface max-w-[960px] rounded-2xl border border-amber-500/35 p-5 text-sm" role="status"><TriangleAlert className="mr-2 inline h-4 w-4" aria-hidden="true" />{state === 'unsupported' ? 'This output cannot be previewed in this workspace yet.' : 'This output could not be rendered.'}</section>;
  return <section className="xv-response-surface max-w-[960px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background)]/70 shadow-sm">{title || description ? <header className="border-b border-[var(--border)] px-4 py-3">{title ? <h3 className="text-sm font-semibold">{title}</h3> : null}{description ? <p className="mt-0.5 text-xs text-[var(--muted)]">{description}</p> : null}</header> : null}{children}</section>;
}

function CardGridRenderer({ block }: { block: Extract<StructuredBlock, { type: 'card-grid' }> }) {
  return (
    <Surface title={block.title ?? 'Results'} description={block.description} state={block.state}>
      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
        {block.cards.map((card) => {
          const href = card.url ? safeArtifactUri(card.url) : null;
          const image = card.imageUrl ? safeArtifactUri(card.imageUrl) : null;
          return (
            <article key={card.id} className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-black/[0.018] transition-colors hover:bg-black/[0.035] dark:bg-white/[0.025] dark:hover:bg-white/[0.045] motion-reduce:transition-none">
              {image ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={image} alt="" loading="lazy" className="aspect-[16/9] w-full border-b border-[var(--border)] object-cover" /> : null}
              <div className="flex flex-1 flex-col p-4">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h4 className="truncate text-sm font-semibold">{card.title}</h4>{card.subtitle ? <p className="mt-0.5 truncate text-xs text-[var(--muted)]">{card.subtitle}</p> : null}</div>{card.badge ? <span className="shrink-0 rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">{card.badge}</span> : null}</div>
                {card.description ? <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{card.description}</p> : null}
                {card.metrics ? <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--border)] pt-3">{Object.entries(card.metrics).map(([label, value]) => <div key={label} className="min-w-0"><dt className="truncate text-[10px] uppercase tracking-wide text-[var(--muted)]">{label}</dt><dd className="truncate text-xs font-medium">{String(value ?? '—')}</dd></div>)}</dl> : null}
                {href ? <a href={href} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent)] hover:underline">{card.actionLabel ?? 'Open'}<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a> : null}
              </div>
            </article>
          );
        })}
      </div>
    </Surface>
  );
}

function TreeRenderer({ block }: { block: Extract<StructuredBlock, { type: 'tree' }> }) {
  const rows = useMemo(() => {
    const ids = new Set(block.nodes.map((node) => node.id));
    const children = new Map<string, typeof block.nodes>();
    for (const node of block.nodes) {
      const parent = node.parentId && ids.has(node.parentId) ? node.parentId : '__root__';
      children.set(parent, [...(children.get(parent) ?? []), node]);
    }
    const flattened: Array<{ node: (typeof block.nodes)[number]; depth: number }> = [];
    const visited = new Set<string>();
    const visit = (parentId: string, depth: number) => {
      for (const node of children.get(parentId) ?? []) {
        if (visited.has(node.id)) continue;
        visited.add(node.id);
        flattened.push({ node, depth: Math.min(depth, 10) });
        visit(node.id, depth + 1);
      }
    };
    visit('__root__', 0);
    for (const node of block.nodes) if (!visited.has(node.id)) flattened.push({ node, depth: 0 });
    return flattened;
  }, [block]);
  return (
    <Surface title={block.title ?? 'Hierarchy'} description={block.description} state={block.state}>
      <div className="max-h-[480px] overflow-auto p-2" role="tree" aria-label={block.title ?? 'Hierarchy'}>
        {rows.map(({ node, depth }) => <div key={node.id} role="treeitem" aria-level={depth + 1} aria-selected={false} className="flex min-h-11 items-center gap-2 rounded-lg pr-3 hover:bg-black/[0.035] dark:hover:bg-white/[0.04]" style={{ paddingLeft: `${12 + depth * 22}px` }}><GitBranch className="h-4 w-4 shrink-0 text-[var(--muted)]" aria-hidden="true" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{node.label}</p>{node.detail ? <p className="truncate text-xs text-[var(--muted)]">{node.detail}</p> : null}</div>{node.status ? <span className="shrink-0 rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--muted)]">{node.status}</span> : null}</div>)}
      </div>
    </Surface>
  );
}

function JsonNode({ name, value, depth }: { name?: string; value: unknown; depth: number }) {
  const isObject = value !== null && typeof value === 'object';
  if (!isObject || depth >= 8) return <div className="flex min-w-0 gap-2 py-0.5 pl-4 font-mono text-xs"><span className="shrink-0 text-sky-600 dark:text-sky-400">{name ? `${name}:` : ''}</span><span className="min-w-0 break-all text-[var(--muted)]">{depth >= 8 && isObject ? '…' : JSON.stringify(value)}</span></div>;
  const entries = Object.entries(value as Record<string, unknown>);
  return <details open={depth < 1} className="group/json pl-2"><summary className="flex cursor-pointer list-none items-center gap-1 py-0.5 font-mono text-xs"><ChevronRight className="h-3.5 w-3.5 shrink-0 transition-transform group-open/json:rotate-90 motion-reduce:transition-none" aria-hidden="true" /><span className="text-sky-600 dark:text-sky-400">{name ?? (Array.isArray(value) ? 'Array' : 'Object')}</span><span className="text-[var(--muted)]">{Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`}</span></summary><div className="border-l border-[var(--border)] pl-2">{entries.map(([key, item]) => <JsonNode key={key} name={key} value={item} depth={depth + 1} />)}</div></details>;
}

function JsonRenderer({ block }: { block: Extract<StructuredBlock, { type: 'json' }> }) {
  const text = useMemo(() => JSON.stringify(block.data, null, 2), [block.data]);
  return <Surface title={block.title ?? 'Structured data'} description={block.description} state={block.state}><div className="flex justify-end border-b border-[var(--border)] px-3 py-2"><InlineCopyButton value={text} /></div><div className="max-h-[480px] overflow-auto p-3"><JsonNode value={block.data} depth={0} /></div></Surface>;
}

function ApiRequestRenderer({ block }: { block: Extract<StructuredBlock, { type: 'api-request' }> }) {
  const panels = [
    block.requestBody !== undefined ? { id: 'request', label: 'Request', value: block.requestBody } : null,
    block.responseBody !== undefined ? { id: 'response', label: 'Response', value: block.responseBody } : null,
    block.requestHeaders || block.responseHeaders ? { id: 'headers', label: 'Headers', value: JSON.stringify({ request: block.requestHeaders ?? {}, response: block.responseHeaders ?? {} }, null, 2) } : null,
  ].filter((panel): panel is { id: string; label: string; value: string } => Boolean(panel));
  const [activeId, setActiveId] = useState(panels[0]?.id ?? '');
  const active = panels.find((panel) => panel.id === activeId) ?? panels[0];
  const statusTone = block.status && block.status >= 400 ? 'text-red-500' : block.status ? 'text-green-600 dark:text-green-400' : 'text-[var(--muted)]';
  return (
    <Surface title={block.title ?? 'API exchange'} description={block.description} state={block.state}>
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] p-3 font-mono text-xs"><span className="rounded-md bg-[var(--foreground)] px-2 py-1 font-bold text-[var(--background)]">{block.method}</span><code className="min-w-0 flex-1 break-all">{block.url}</code>{block.status ? <span className={`font-semibold ${statusTone}`}>{block.status}</span> : null}{block.durationMs !== undefined ? <span className="text-[var(--muted)]">{block.durationMs} ms</span> : null}</div>
      {active ? <><div className="flex items-end justify-between gap-3 border-b border-[var(--border)] px-3 pt-2"><div role="tablist" aria-label="API exchange details" className="flex gap-1">{panels.map((panel) => <button key={panel.id} type="button" role="tab" aria-selected={panel.id === active.id} onClick={() => setActiveId(panel.id)} className="border-b-2 border-transparent px-2 py-2 text-xs text-[var(--muted)] aria-selected:border-[var(--accent)] aria-selected:text-[var(--foreground)]">{panel.label}</button>)}</div><div className="pb-2"><InlineCopyButton value={active.value} /></div></div><pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs leading-5">{active.value}</pre></> : <div className="flex items-center gap-2 p-4 text-xs text-[var(--muted)]"><Braces className="h-4 w-4" aria-hidden="true" />No request or response body was provided.</div>}
    </Surface>
  );
}

export function XrogaStructuredBlockView({ block }: { block: XrogaBlock }) {
  if (block.type === 'card-grid') return <CardGridRenderer block={block} />;
  if (block.type === 'tree') return <TreeRenderer block={block} />;
  if (block.type === 'json') return <JsonRenderer block={block} />;
  if (block.type === 'api-request') return <ApiRequestRenderer block={block} />;
  return null;
}
