'use client';

import { useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronRight,
  ExternalLink,
  File,
  Folder,
  LoaderCircle,
  MapPin,
  TriangleAlert,
} from 'lucide-react';

import { safeArtifactUri } from '@/lib/universalOutput';
import type { XrogaBlock } from '@/lib/xrogaBlocks';

type OrganizerType = 'tabs' | 'accordion' | 'file-tree' | 'calendar' | 'source-list';
type OrganizerBlock = Extract<XrogaBlock, { type: OrganizerType }>;

function Surface({
  children,
  title,
  description,
  state = 'ready',
}: {
  children: React.ReactNode;
  title?: string;
  description?: string;
  state?: OrganizerBlock['state'];
}) {
  if (state === 'loading') return <section className="xv-response-surface max-w-[960px] rounded-2xl border border-[var(--border)] p-5" aria-busy="true"><LoaderCircle className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" /><span className="sr-only">Loading output</span></section>;
  if (state === 'empty') return <section className="xv-response-surface max-w-[960px] rounded-2xl border border-dashed border-[var(--border)] p-5 text-sm text-[var(--muted)]">No data is available for this output.</section>;
  if (state === 'error' || state === 'unsupported') return <section className="xv-response-surface max-w-[960px] rounded-2xl border border-amber-500/35 p-5 text-sm" role="status"><TriangleAlert className="mr-2 inline h-4 w-4" aria-hidden="true" />{state === 'unsupported' ? 'This output cannot be previewed in this workspace yet.' : 'This output could not be rendered.'}</section>;
  return (
    <section className="xv-response-surface max-w-[960px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background)]/70 shadow-sm">
      {title || description ? <header className="border-b border-[var(--border)] px-4 py-3">{title ? <h3 className="text-sm font-semibold">{title}</h3> : null}{description ? <p className="mt-0.5 text-xs text-[var(--muted)]">{description}</p> : null}</header> : null}
      {children}
    </section>
  );
}

function TabsRenderer({ block }: { block: Extract<OrganizerBlock, { type: 'tabs' }> }) {
  const initial = block.tabs.some((tab) => tab.id === block.activeTabId) ? block.activeTabId! : block.tabs[0]!.id;
  const [activeId, setActiveId] = useState(initial);
  const active = block.tabs.find((tab) => tab.id === activeId) ?? block.tabs[0];
  return (
    <Surface title={block.title ?? 'Details'} description={block.description} state={block.state}>
      <div className="overflow-x-auto border-b border-[var(--border)] px-2 pt-2" role="tablist" aria-label={block.title ?? 'Details'}>
        <div className="flex min-w-max gap-1">
          {block.tabs.map((tab) => <button key={tab.id} id={`${block.id}-${tab.id}-tab`} type="button" role="tab" aria-selected={tab.id === activeId} aria-controls={`${block.id}-${tab.id}-panel`} onClick={() => setActiveId(tab.id)} className="rounded-t-lg border border-transparent px-3 py-2 text-xs font-medium text-[var(--muted)] transition-colors hover:text-[var(--foreground)] aria-selected:border-[var(--border)] aria-selected:border-b-[var(--background)] aria-selected:bg-[var(--background)] aria-selected:text-[var(--foreground)] motion-reduce:transition-none">{tab.label}</button>)}
        </div>
      </div>
      {active ? <div id={`${block.id}-${active.id}-panel`} role="tabpanel" aria-labelledby={`${block.id}-${active.id}-tab`} className="whitespace-pre-wrap p-4 text-sm leading-6">{active.content}</div> : null}
    </Surface>
  );
}

function AccordionRenderer({ block }: { block: Extract<OrganizerBlock, { type: 'accordion' }> }) {
  return <Surface title={block.title ?? 'Details'} description={block.description} state={block.state}><div className="divide-y divide-[var(--border)]">{block.items.map((item) => <details key={item.id} open={item.open} className="group"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium"><span>{item.title}</span><ChevronRight className="h-4 w-4 shrink-0 text-[var(--muted)] transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" /></summary><p className="whitespace-pre-wrap px-4 pb-4 text-sm leading-6 text-[var(--muted)]">{item.content}</p></details>)}</div></Surface>;
}

function FileTreeRenderer({ block }: { block: Extract<OrganizerBlock, { type: 'file-tree' }> }) {
  const entries = useMemo(() => [...block.entries].sort((a, b) => a.path.localeCompare(b.path)), [block.entries]);
  return (
    <Surface title={block.title ?? 'Files'} description={block.description} state={block.state}>
      <div className="max-h-[440px] overflow-auto p-2 font-mono text-xs" role="tree" aria-label={block.title ?? 'File tree'}>
        {entries.map((entry) => {
          const depth = Math.min(8, Math.max(0, entry.path.split(/[\\/]/).filter(Boolean).length - 1));
          const Icon = entry.kind === 'folder' ? Folder : File;
          const statusClass = entry.status === 'added' ? 'text-green-500' : entry.status === 'modified' ? 'text-amber-500' : entry.status === 'deleted' ? 'text-red-500' : 'text-[var(--muted)]';
          return <div key={entry.id} role="treeitem" aria-level={depth + 1} aria-selected={false} className="flex min-h-9 items-center gap-2 rounded-lg pr-3 hover:bg-black/[0.035] dark:hover:bg-white/[0.04]" style={{ paddingLeft: `${12 + depth * 18}px` }}><Icon className="h-4 w-4 shrink-0 text-[var(--muted)]" aria-hidden="true" /><span className={`min-w-0 flex-1 truncate ${entry.kind === 'folder' ? 'font-semibold' : ''}`}>{entry.name}</span>{entry.status && entry.status !== 'unchanged' ? <span className={`shrink-0 text-[10px] uppercase tracking-wide ${statusClass}`}>{entry.status}</span> : null}{entry.detail ? <span className="sr-only">{entry.detail}</span> : null}</div>;
        })}
      </div>
    </Surface>
  );
}

function scheduleLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: value.includes('T') ? 'short' : undefined }).format(date);
}

function CalendarRenderer({ block }: { block: Extract<OrganizerBlock, { type: 'calendar' }> }) {
  const events = useMemo(() => [...block.events].sort((a, b) => a.start.localeCompare(b.start)), [block.events]);
  return (
    <Surface title={block.title ?? 'Schedule'} description={block.description} state={block.state}>
      <ol className="divide-y divide-[var(--border)]" aria-label={`${block.view ?? 'agenda'} schedule`}>
        {events.map((event) => <li key={event.id} className="grid gap-2 p-4 sm:grid-cols-[150px_minmax(0,1fr)_auto] sm:items-start"><time dateTime={event.start} className="flex items-center gap-2 text-xs font-medium text-[var(--muted)]"><CalendarDays className="h-4 w-4" aria-hidden="true" />{scheduleLabel(event.start)}</time><div><h4 className="text-sm font-medium">{event.title}</h4>{event.detail ? <p className="mt-1 text-xs text-[var(--muted)]">{event.detail}</p> : null}{event.location ? <p className="mt-1 flex items-center gap-1 text-xs text-[var(--muted)]"><MapPin className="h-3 w-3" aria-hidden="true" />{event.location}</p> : null}{event.end ? <p className="mt-1 text-[11px] text-[var(--muted)]">Ends {scheduleLabel(event.end)}</p> : null}</div>{event.status ? <span className="w-fit rounded-full border border-[var(--border)] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">{event.status}</span> : null}</li>)}
      </ol>
    </Surface>
  );
}

function SourceListRenderer({ block }: { block: Extract<OrganizerBlock, { type: 'source-list' }> }) {
  return (
    <Surface title={block.title ?? 'Sources'} description={block.description} state={block.state}>
      <ol className="divide-y divide-[var(--border)]">
        {block.sources.map((source, index) => {
          const href = safeArtifactUri(source.url);
          return <li key={source.id} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 p-4"><span className="grid h-7 w-7 place-items-center rounded-full bg-black/5 text-xs font-semibold dark:bg-white/5">{index + 1}</span><div className="min-w-0">{href ? <a href={href} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1.5 text-sm font-medium text-[var(--accent)] hover:underline"><span className="truncate">{source.title}</span><ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /></a> : <p className="text-sm font-medium">{source.title}</p>}<p className="mt-0.5 text-[11px] text-[var(--muted)]">{source.domain ?? new URL(source.url).hostname}{source.publishedAt ? ` · ${source.publishedAt}` : ''}</p>{source.excerpt ? <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{source.excerpt}</p> : null}</div></li>;
        })}
      </ol>
    </Surface>
  );
}

export function XrogaOrganizerBlockView({ block }: { block: XrogaBlock }) {
  if (block.type === 'tabs') return <TabsRenderer block={block} />;
  if (block.type === 'accordion') return <AccordionRenderer block={block} />;
  if (block.type === 'file-tree') return <FileTreeRenderer block={block} />;
  if (block.type === 'calendar') return <CalendarRenderer block={block} />;
  if (block.type === 'source-list') return <SourceListRenderer block={block} />;
  return null;
}
