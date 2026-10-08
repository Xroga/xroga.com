'use client';

import { useMemo, useRef, useState } from 'react';
import { flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Funnel, FunnelChart, LabelList, Legend, Line, LineChart, Pie, PieChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Circle, Copy, ExternalLink, FileText, LoaderCircle, Minus, Search, TriangleAlert } from 'lucide-react';

import { safeArtifactUri } from '@/lib/universalOutput';
import { shouldVirtualizeRows } from '@/lib/xrogaPresentation';
import { useXrogaArtifactContext } from '@/lib/xrogaArtifactContext';
import type { XrogaBlock } from '@/lib/xrogaBlocks';
import { XrogaOrganizerBlockView } from './XrogaOrganizerBlockView';
import { XrogaStructuredBlockView } from './XrogaStructuredBlockView';
import { XrogaUtilityBlockView } from './XrogaUtilityBlockView';

type RichType = 'metric' | 'metric-group' | 'table' | 'chart' | 'timeline' | 'graph' | 'map' | 'form' | 'choice' | 'gallery' | 'image' | 'audio' | 'video' | 'dashboard' | 'document' | 'spreadsheet' | 'presentation' | 'board' | 'database' | 'pdf';
type RichBlock = Extract<XrogaBlock, { type: RichType }>;
type TableBlock = Extract<XrogaBlock, { type: 'table' | 'spreadsheet' | 'database' }>;
type ChartBlock = Extract<XrogaBlock, { type: 'chart' }>;
type Metric = Extract<XrogaBlock, { type: 'metric' }>['metric'];

const CHART_COLORS = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626'];

function Surface({ children, title, description, state = 'ready' }: { children: React.ReactNode; title?: string; description?: string; state?: RichBlock['state'] }) {
  if (state === 'loading') return <section className="xv-response-surface max-w-[960px] rounded-2xl border border-[var(--border)] p-5" aria-busy="true"><LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" /><span className="sr-only">Loading output</span></section>;
  if (state === 'empty') return <section className="xv-response-surface max-w-[960px] rounded-2xl border border-dashed border-[var(--border)] p-5 text-sm text-[var(--muted)]">No data is available for this output.</section>;
  if (state === 'error' || state === 'unsupported') return <section className="xv-response-surface max-w-[960px] rounded-2xl border border-amber-500/35 p-5 text-sm" role="status"><TriangleAlert className="mr-2 inline h-4 w-4" aria-hidden="true" />{state === 'unsupported' ? 'This output cannot be previewed in this workspace yet.' : 'This output could not be rendered.'}</section>;
  return <section className="xv-response-surface max-w-[960px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background)]/65 shadow-sm"><header className="border-b border-[var(--border)] px-4 py-3">{title ? <h3 className="text-sm font-semibold text-[var(--foreground)]">{title}</h3> : null}{description ? <p className="mt-0.5 text-xs text-[var(--muted)]">{description}</p> : null}</header>{children}</section>;
}

function MetricCard({ metric }: { metric: Metric }) {
  const Icon = metric.trend === 'up' ? ArrowUp : metric.trend === 'down' ? ArrowDown : Minus;
  return <article className="min-w-0 rounded-xl border border-[var(--border)] bg-black/[0.025] p-4 dark:bg-white/[0.035]"><p className="truncate text-xs text-[var(--muted)]">{metric.label}</p><p className="mt-2 break-words text-2xl font-semibold tracking-tight">{metric.value}{metric.unit ? <span className="ml-1 text-sm font-normal text-[var(--muted)]">{metric.unit}</span> : null}</p>{metric.change !== undefined ? <p className="mt-2 flex items-center gap-1 text-xs text-[var(--muted)]"><Icon className="h-3.5 w-3.5" aria-hidden="true" />{Math.abs(metric.change)}%</p> : null}</article>;
}

function MetricRenderer({ block }: { block: Extract<RichBlock, { type: 'metric' | 'metric-group' }> }) {
  const metrics = block.type === 'metric' ? [block.metric] : block.metrics;
  return <Surface title={block.title} description={block.description} state={block.state}><div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">{metrics.map((metric) => <MetricCard key={metric.id} metric={metric} />)}</div></Surface>;
}

function valueText(value: unknown): string { return value === null || value === undefined ? '' : String(value); }

function TableRenderer({ block }: { block: TableBlock }) {
  const [filter, setFilter] = useState('');
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const addSelection = useXrogaArtifactContext((state) => state.addSelection);
  const columns = useMemo<ColumnDef<Record<string, string | number | boolean | null>>[]>(() => block.columns.map((column) => ({ accessorKey: column.key, header: column.label, cell: (context) => valueText(context.getValue()) })), [block.columns]);
  const table = useReactTable({ data: block.rows, columns, state: { globalFilter: filter, rowSelection }, onGlobalFilterChange: setFilter, onRowSelectionChange: setRowSelection, enableRowSelection: block.selectable !== false, getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(), getSortedRowModel: getSortedRowModel(), getPaginationRowModel: getPaginationRowModel(), initialState: { pagination: { pageSize: 25 } } });
  const filteredRows = table.getFilteredRowModel().rows;
  const largeDataset = shouldVirtualizeRows(filteredRows.length);
  const rows = largeDataset ? filteredRows : table.getRowModel().rows;
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtual = useVirtualizer({ count: largeDataset ? rows.length : 0, getScrollElement: () => scrollRef.current, estimateSize: () => 42, overscan: 8 });
  const virtualItems = largeDataset ? virtual.getVirtualItems() : [];
  const visibleRows = largeDataset ? virtualItems.map((item) => ({ row: rows[item.index], key: item.key })) : rows.map((row) => ({ row, key: row.id }));
  const topSpacer = largeDataset && virtualItems.length ? virtualItems[0].start : 0;
  const bottomSpacer = largeDataset && virtualItems.length ? virtual.getTotalSize() - virtualItems[virtualItems.length - 1].end : 0;
  const selectedIds = Object.keys(rowSelection).filter((key) => rowSelection[key]);
  const useSelection = () => addSelection({ artifactId: block.artifactId ?? block.id, blockId: block.id, kind: 'rows', label: `${selectedIds.length} selected row${selectedIds.length === 1 ? '' : 's'} from ${block.title ?? 'table'}`, recordIds: selectedIds });
  const copyCsv = async () => { const csv = [block.columns.map((c) => c.label), ...block.rows.map((row) => block.columns.map((c) => JSON.stringify(valueText(row[c.key]))))].map((row) => row.join(',')).join('\n'); await navigator.clipboard.writeText(csv); };
  return <Surface title={block.title ?? (block.type === 'spreadsheet' ? 'Spreadsheet' : block.type === 'database' ? 'Database' : 'Table')} description={block.description} state={block.state}>
    <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] p-3">
      {block.searchable !== false ? <label className="relative min-w-44 flex-1"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-[var(--muted)]" aria-hidden="true" /><span className="sr-only">Search table</span><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search rows" className="h-9 w-full rounded-lg border border-[var(--border)] bg-transparent pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" /></label> : null}
      {selectedIds.length ? <button type="button" onClick={useSelection} className="h-9 rounded-lg border border-[var(--border)] px-3 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/5">Use {selectedIds.length} as context</button> : null}
      <button type="button" onClick={() => void copyCsv()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/5"><Copy className="h-3.5 w-3.5" aria-hidden="true" />Copy CSV</button>
    </div>
    <div ref={scrollRef} className="max-h-[440px] overflow-auto">
      <table className="w-full min-w-[560px] border-collapse text-left text-sm"><thead className="sticky top-0 z-10 bg-[var(--background)]"><tr>{block.selectable !== false ? <th className="w-10 border-b border-[var(--border)] p-3"><span className="sr-only">Select</span></th> : null}{table.getHeaderGroups()[0]?.headers.map((header) => <th key={header.id} className="border-b border-[var(--border)] p-3 text-xs font-semibold"><button type="button" onClick={header.column.getToggleSortingHandler()} className="inline-flex items-center gap-1">{flexRender(header.column.columnDef.header, header.getContext())}{header.column.getIsSorted() ? (header.column.getIsSorted() === 'asc' ? ' ↑' : ' ↓') : null}</button></th>)}</tr></thead>
        <tbody>{topSpacer > 0 ? <tr aria-hidden="true"><td colSpan={block.columns.length + (block.selectable !== false ? 1 : 0)} style={{ height: topSpacer }} /></tr> : null}{visibleRows.map(({ row, key }) => row ? <tr key={key} className="border-b border-[var(--border)]/70 hover:bg-black/[0.025] dark:hover:bg-white/[0.035]">{block.selectable !== false ? <td className="p-3"><input type="checkbox" aria-label={`Select row ${Number(row.id) + 1}`} checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} /></td> : null}{row.getVisibleCells().map((cell) => <td key={cell.id} className="max-w-80 p-3 align-top">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr> : null)}{bottomSpacer > 0 ? <tr aria-hidden="true"><td colSpan={block.columns.length + (block.selectable !== false ? 1 : 0)} style={{ height: bottomSpacer }} /></tr> : null}</tbody></table>
      {largeDataset ? <span className="sr-only">Large dataset virtualization is active for {rows.length} rows.</span> : null}
    </div>
    <footer className="flex items-center justify-between gap-2 p-3 text-xs text-[var(--muted)]"><span>{filteredRows.length} rows</span>{!largeDataset ? <div className="flex items-center gap-1"><button type="button" aria-label="Previous page" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()} className="rounded-md border border-[var(--border)] p-1.5 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button><span>Page {table.getState().pagination.pageIndex + 1} of {Math.max(1, table.getPageCount())}</span><button type="button" aria-label="Next page" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()} className="rounded-md border border-[var(--border)] p-1.5 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button></div> : <span>Virtualized view</span>}</footer>
  </Surface>;
}

function ChartRenderer({ block }: { block: ChartBlock }) {
  const addSelection = useXrogaArtifactContext((state) => state.addSelection);
  const common = { data: block.data, margin: { top: 8, right: 16, left: 0, bottom: 8 }, onClick: (state: { activeLabel?: string | number }) => { if (state?.activeLabel !== undefined) addSelection({ artifactId: block.artifactId ?? block.id, blockId: block.id, kind: 'chart-point', label: `${block.xKey}: ${state.activeLabel}`, recordIds: [String(state.activeLabel)] }); } };
  const children = <><CartesianGrid strokeDasharray="3 3" opacity={0.22} /><XAxis dataKey={block.xKey} tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Legend />{block.series.map((series, index) => block.chartType === 'bar' ? <Bar key={series.key} dataKey={series.key} name={series.label} fill={series.color ?? CHART_COLORS[index % CHART_COLORS.length]} /> : block.chartType === 'area' ? <Area key={series.key} dataKey={series.key} name={series.label} stroke={series.color ?? CHART_COLORS[index % CHART_COLORS.length]} fill={series.color ?? CHART_COLORS[index % CHART_COLORS.length]} fillOpacity={0.18} /> : <Line key={series.key} dataKey={series.key} name={series.label} stroke={series.color ?? CHART_COLORS[index % CHART_COLORS.length]} strokeWidth={2} dot={false} />)}</>;
  const primary = block.series[0];
  const chart = block.chartType === 'pie' || block.chartType === 'donut'
    ? <PieChart><Tooltip /><Legend /><Pie data={block.data} dataKey={primary?.key} nameKey={block.xKey} innerRadius={block.chartType === 'donut' ? 58 : 0} outerRadius={92} paddingAngle={2}>{block.data.map((_, index) => <Cell key={`${block.id}-slice-${index}`} fill={primary?.color ?? CHART_COLORS[index % CHART_COLORS.length]} />)}</Pie></PieChart>
    : block.chartType === 'radar'
      ? <RadarChart data={block.data}><PolarGrid /><PolarAngleAxis dataKey={block.xKey} tick={{ fontSize: 11 }} /><PolarRadiusAxis tick={{ fontSize: 10 }} /><Tooltip /><Legend />{block.series.map((series, index) => <Radar key={series.key} dataKey={series.key} name={series.label} stroke={series.color ?? CHART_COLORS[index % CHART_COLORS.length]} fill={series.color ?? CHART_COLORS[index % CHART_COLORS.length]} fillOpacity={0.14} />)}</RadarChart>
      : block.chartType === 'funnel'
        ? <FunnelChart><Tooltip /><Funnel data={block.data} dataKey={primary?.key} nameKey={block.xKey} fill={primary?.color ?? CHART_COLORS[0]}><LabelList position="right" fill="currentColor" stroke="none" dataKey={block.xKey} /></Funnel></FunnelChart>
        : block.chartType === 'scatter'
      ? <ScatterChart {...common}><CartesianGrid strokeDasharray="3 3" opacity={0.22} /><XAxis dataKey={block.xKey} tick={{ fontSize: 11 }} /><YAxis dataKey={primary?.key} tick={{ fontSize: 11 }} /><Tooltip cursor={{ strokeDasharray: '3 3' }} /><Legend />{block.series.map((series, index) => <Scatter key={series.key} name={series.label} data={block.data} fill={series.color ?? CHART_COLORS[index % CHART_COLORS.length]} />)}</ScatterChart>
      : block.chartType === 'bar' ? <BarChart {...common}>{children}</BarChart> : block.chartType === 'area' ? <AreaChart {...common}>{children}</AreaChart> : <LineChart {...common}>{children}</LineChart>;
  return <Surface title={block.title ?? 'Chart'} description={block.description} state={block.state}><div className="xv-response-chart h-72 w-full p-3" role="img" aria-label={block.summary}><ResponsiveContainer width="100%" height="100%">{chart}</ResponsiveContainer></div><p className="border-t border-[var(--border)] px-4 py-3 text-xs text-[var(--muted)]">{block.summary}. Select a chart point to use it as context.</p></Surface>;
}

function TimelineRenderer({ block }: { block: Extract<RichBlock, { type: 'timeline' }> }) { return <Surface title={block.title ?? 'Timeline'} description={block.description} state={block.state}><ol className="space-y-0 p-4">{block.events.map((event) => <li key={event.id} className="relative grid grid-cols-[20px_1fr] gap-3 pb-5 last:pb-0"><div className="flex flex-col items-center"><Circle className="h-4 w-4 fill-current" aria-hidden="true" /><span className="h-full w-px bg-[var(--border)] last:hidden" /></div><div><p className="text-xs text-[var(--muted)]">{event.date}</p><h4 className="text-sm font-medium">{event.title}</h4>{event.detail ? <p className="mt-1 text-sm text-[var(--muted)]">{event.detail}</p> : null}</div></li>)}</ol></Surface>; }

function GraphRenderer({ block }: { block: Extract<RichBlock, { type: 'graph' }> }) { const addSelection = useXrogaArtifactContext((state) => state.addSelection); return <Surface title={block.title ?? 'Graph'} description={block.description} state={block.state}><div className="grid gap-3 p-4 md:grid-cols-2">{block.nodes.map((node) => <button type="button" key={node.id} onClick={() => addSelection({ artifactId: block.artifactId ?? block.id, blockId: block.id, kind: 'node', label: node.label, recordIds: [node.id] })} className="rounded-xl border border-[var(--border)] p-3 text-left hover:bg-black/[0.025] dark:hover:bg-white/[0.035]"><span className="text-sm font-medium">{node.label}</span>{node.detail ? <p className="mt-1 text-xs text-[var(--muted)]">{node.detail}</p> : null}</button>)}</div>{block.edges.length ? <ul className="border-t border-[var(--border)] p-4 text-xs text-[var(--muted)]" aria-label="Connections">{block.edges.map((edge) => <li key={edge.id ?? `${edge.source}-${edge.target}`}>{edge.source} → {edge.target}{edge.label ? ` · ${edge.label}` : ''}</li>)}</ul> : null}</Surface>; }

function FormRenderer({ block }: { block: Extract<RichBlock, { type: 'form' }> }) { return <Surface title={block.title ?? 'Form'} description={block.description} state={block.state}><form className="grid gap-3 p-4" onSubmit={(event) => event.preventDefault()}>{block.fields.map((field) => <label key={field.id} className="grid gap-1 text-xs font-medium">{field.label}<input type={field.inputType === 'textarea' ? 'text' : field.inputType} required={field.required} defaultValue={valueText(field.value)} disabled={Boolean(block.disabledReason)} className="h-10 rounded-lg border border-[var(--border)] bg-transparent px-3 text-sm" /></label>)}<button type="submit" disabled className="h-10 rounded-lg bg-[var(--foreground)] px-4 text-sm text-[var(--background)] disabled:opacity-45">{block.submitLabel ?? 'Submit'}</button><p className="text-xs text-[var(--muted)]">{block.disabledReason ?? 'Submission needs a connected, authorized action handler.'}</p></form></Surface>; }

function ChoiceRenderer({ block }: { block: Extract<RichBlock, { type: 'choice' }> }) { return <Surface title={block.title ?? block.prompt} description={block.description} state={block.state}><fieldset disabled className="grid gap-2 p-4"><legend className="sr-only">{block.prompt}</legend>{block.options.map((option) => <label key={option.id} className="flex gap-3 rounded-xl border border-[var(--border)] p-3"><input type="radio" name={block.id} disabled={option.disabled} /><span><span className="text-sm font-medium">{option.label}</span>{option.description ? <span className="block text-xs text-[var(--muted)]">{option.description}</span> : null}</span></label>)}<p className="text-xs text-[var(--muted)]">{block.disabledReason ?? 'Choices are read-only until an authorized continuation handler is attached.'}</p></fieldset></Surface>; }

function safeMedia(url: string): string | null { return safeArtifactUri(url); }
function MediaRenderer({ block }: { block: Extract<RichBlock, { type: 'gallery' | 'image' | 'audio' | 'video' }> }) { const items = block.type === 'gallery' ? block.items : [block.type === 'image' ? block.image : block.type === 'audio' ? block.audio : block.video]; return <Surface title={block.title ?? block.type} description={block.description} state={block.state}><div className="grid gap-3 p-4 sm:grid-cols-2">{items.map((item) => { const src = safeMedia(item.url); return <figure key={item.id} className="overflow-hidden rounded-xl border border-[var(--border)] p-2">{!src ? <p className="p-3 text-xs text-[var(--muted)]">Media URL is unavailable or unsafe.</p> : (block.type === 'audio' || item.mediaType?.startsWith('audio/')) ? <audio src={src} controls className="w-full" /> : (block.type === 'video' || item.mediaType?.startsWith('video/')) ? <video src={src} controls className="max-h-80 w-full rounded-lg" /> : /* eslint-disable-next-line @next/next/no-img-element */ <img src={src} alt={item.label} loading="lazy" className="max-h-80 w-full rounded-lg object-contain" />}{item.caption ? <figcaption className="p-2 text-xs text-[var(--muted)]">{item.caption}</figcaption> : null}</figure>; })}</div></Surface>; }

function MapRenderer({ block }: { block: Extract<RichBlock, { type: 'map' }> }) { return <Surface title={block.title ?? 'Locations'} description={block.description} state={block.state}><ul className="grid gap-2 p-4 sm:grid-cols-2">{block.locations.map((location) => <li key={location.id} className="rounded-xl border border-[var(--border)] p-3"><span className="text-sm font-medium">{location.label}</span>{location.detail ? <p className="text-xs text-[var(--muted)]">{location.detail}</p> : null}{location.latitude !== undefined && location.longitude !== undefined ? <a href={`https://www.openstreetmap.org/?mlat=${location.latitude}&mlon=${location.longitude}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--accent)]">Open map<ExternalLink className="h-3 w-3" /></a> : null}</li>)}</ul></Surface>; }

function DocumentRenderer({ block }: { block: Extract<RichBlock, { type: 'document' }> }) { return <Surface title={block.title ?? 'Document'} description={block.description} state={block.state}><article className="prose prose-sm max-w-none p-5 text-[var(--foreground)] dark:prose-invert">{block.format === 'markdown' ? <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={(url) => safeArtifactUri(url) ?? ''}>{block.content}</ReactMarkdown> : <p className="whitespace-pre-wrap">{block.content}</p>}</article></Surface>; }

function PresentationRenderer({ block }: { block: Extract<RichBlock, { type: 'presentation' }> }) { const [active, setActive] = useState(0); const slide = block.slides[active]; return <Surface title={block.title ?? 'Presentation'} description={block.description} state={block.state}><div className="aspect-video min-h-60 p-6 sm:p-10">{slide ? <article><p className="text-xs text-[var(--muted)]">Slide {active + 1} of {block.slides.length}</p><h4 className="mt-4 text-2xl font-semibold">{slide.title}</h4>{slide.body ? <p className="mt-3 text-sm text-[var(--muted)]">{slide.body}</p> : null}{slide.bullets ? <ul className="mt-4 list-disc space-y-2 pl-5 text-sm">{slide.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul> : null}</article> : null}</div><footer className="flex justify-between border-t border-[var(--border)] p-3"><button type="button" disabled={active === 0} onClick={() => setActive((index) => index - 1)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs disabled:opacity-40">Previous</button><button type="button" disabled={active >= block.slides.length - 1} onClick={() => setActive((index) => index + 1)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs disabled:opacity-40">Next</button></footer></Surface>; }

function BoardRenderer({ block }: { block: Extract<RichBlock, { type: 'board' }> }) { return <Surface title={block.title ?? 'Board'} description={block.description} state={block.state}><div className="grid auto-cols-[minmax(220px,1fr)] grid-flow-col gap-3 overflow-x-auto p-4">{block.columns.map((column) => <section key={column.id} className="rounded-xl bg-black/[0.035] p-3 dark:bg-white/[0.04]"><h4 className="text-xs font-semibold uppercase tracking-wide">{column.title}</h4><div className="mt-3 space-y-2">{column.items.map((item) => <article key={item.id} className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3"><p className="text-sm font-medium">{item.title}</p>{item.detail ? <p className="mt-1 text-xs text-[var(--muted)]">{item.detail}</p> : null}</article>)}</div></section>)}</div></Surface>; }

function PdfRenderer({ block }: { block: Extract<RichBlock, { type: 'pdf' }> }) { const uri = block.uri ? safeArtifactUri(block.uri) : null; return <Surface title={block.title ?? block.name} description={block.description} state={block.state}><div className="flex items-center gap-3 p-4"><FileText className="h-8 w-8" aria-hidden="true" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{block.name}</p><p className="text-xs text-[var(--muted)]">{block.pageCount ? `${block.pageCount} pages` : 'PDF artifact'}{block.metadataOnly ? ' · metadata only' : ''}</p></div>{uri ? <a href={uri} target="_blank" rel="noreferrer" className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs">Open PDF</a> : null}</div></Surface>; }

function DashboardRenderer({ block }: { block: Extract<RichBlock, { type: 'dashboard' }> }) { return <Surface title={block.title ?? 'Dashboard'} description={block.description} state={block.state}><div className="space-y-4 p-4">{block.metrics?.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{block.metrics.map((metric) => <MetricCard key={metric.id} metric={metric} />)}</div> : null}{block.charts?.map((chart) => <ChartRenderer key={chart.id} block={{ schemaVersion: 1, type: 'chart', ...chart }} />)}{block.tables?.map((table) => <TableRenderer key={table.id} block={{ schemaVersion: 1, type: 'table', ...table }} />)}</div></Surface>; }

export function XrogaRichBlockView({ block }: { block: XrogaBlock }) {
  if (['card-grid', 'tree', 'json', 'api-request'].includes(block.type)) return <XrogaStructuredBlockView block={block} />;
  if (['tabs', 'accordion', 'file-tree', 'calendar', 'source-list'].includes(block.type)) return <XrogaOrganizerBlockView block={block} />;
  if (['progress', 'progress-group', 'calculator', 'calculation', 'gauge', 'comparison', 'key-value', 'checklist', 'steps', 'scorecard', 'ranking'].includes(block.type)) return <XrogaUtilityBlockView block={block} />;
  if (block.type === 'metric' || block.type === 'metric-group') return <MetricRenderer block={block} />;
  if (block.type === 'table' || block.type === 'spreadsheet' || block.type === 'database') return <TableRenderer block={block} />;
  if (block.type === 'chart') return <ChartRenderer block={block} />;
  if (block.type === 'timeline') return <TimelineRenderer block={block} />;
  if (block.type === 'graph') return <GraphRenderer block={block} />;
  if (block.type === 'map') return <MapRenderer block={block} />;
  if (block.type === 'form') return <FormRenderer block={block} />;
  if (block.type === 'choice') return <ChoiceRenderer block={block} />;
  if (block.type === 'gallery' || block.type === 'image' || block.type === 'audio' || block.type === 'video') return <MediaRenderer block={block} />;
  if (block.type === 'dashboard') return <DashboardRenderer block={block} />;
  if (block.type === 'document') return <DocumentRenderer block={block} />;
  if (block.type === 'presentation') return <PresentationRenderer block={block} />;
  if (block.type === 'board') return <BoardRenderer block={block} />;
  if (block.type === 'pdf') return <PdfRenderer block={block} />;
  return null;
}
