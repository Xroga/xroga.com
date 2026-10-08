'use client';

import { lazy, Suspense, type ComponentType, type LazyExoticComponent, type ReactNode } from 'react';
import { Activity, AlertCircle, AudioLines, BarChart3, Braces, Calculator, CalendarDays, Check, CircleHelp, Clock3, Code2, ExternalLink, FileCheck2, FileText, FolderTree, Gauge, Globe2, Image, LayoutDashboard, ListChecks, LoaderCircle, MapPin, MessageSquareText, PlugZap, Search, SlidersHorizontal, Sparkles, Table2, TriangleAlert, Video, type LucideIcon } from 'lucide-react';

import { EngineeringArtifactView } from './EngineeringArtifactView';
import { LegacyLandingOutputView } from './LegacyLandingOutputView';
import { InlineCopyButton } from '@/components/ui/InlineCopyButton';
import { isRenderableArtifact } from '@/lib/engineeringArtifact';
import { safeArtifactUri } from '@/lib/universalOutput';
import { parseXrogaBlock, type XrogaBlock, type XrogaOutputDocument } from '@/lib/xrogaBlocks';
import { XrogaArtifactHeader } from './XrogaArtifactHeader';
import { FormattedAiMarkdown } from '@/lib/formatAiMarkdown';

type BlockRenderer = ComponentType<{ block: XrogaBlock }> | LazyExoticComponent<ComponentType<{ block: XrogaBlock }>>;

const renderers = new Map<string, BlockRenderer>();

export function registerRenderer(type: XrogaBlock['type'], renderer: BlockRenderer): void {
  renderers.set(type, renderer);
}

export function canRender(type: string): boolean {
  return renderers.has(type);
}

export function getRenderer(type: string): BlockRenderer {
  return renderers.get(type) ?? UnknownBlockRenderer;
}

export function renderBlock(block: XrogaBlock): ReactNode {
  const Renderer = getRenderer(block.type);
  return <Renderer block={block} />;
}

const RichBlockRenderer = lazy(() => import('./XrogaRichBlockView').then((module) => ({ default: module.XrogaRichBlockView })));
const DecisionMatrixRenderer = lazy(() => import('./XrogaDecisionMatrixView').then((module) => ({ default: module.XrogaDecisionMatrixView })));
const CustomLucideIcon = lazy(() => import('./XrogaLucideIcon').then((module) => ({ default: module.XrogaLucideIcon })));

const typeIcons: Partial<Record<XrogaBlock['type'], LucideIcon>> = {
  narrative: MessageSquareText, notice: CircleHelp, status: Activity, error: AlertCircle, 'empty-state': Search,
  plan: ListChecks, activity: Activity, evidence: FileCheck2, citation: ExternalLink, source: ExternalLink,
  approval: CircleHelp, receipt: Check, code: Code2, diff: Code2, terminal: Code2, file: FileText,
  'connection-request': PlugZap, website: Globe2, artifact: FileText,
  metric: BarChart3, 'metric-group': BarChart3, progress: Activity, 'progress-group': Activity,
  calculator: Calculator, calculation: Calculator, gauge: Gauge, comparison: BarChart3, 'key-value': ListChecks,
  checklist: ListChecks, steps: ListChecks, scorecard: Gauge, ranking: BarChart3,
  tabs: LayoutDashboard, accordion: ListChecks, 'file-tree': FolderTree, calendar: CalendarDays,
  'source-list': ExternalLink, 'card-grid': LayoutDashboard, tree: FolderTree, json: Braces,
  'api-request': Code2, table: Table2, chart: BarChart3, timeline: Clock3, graph: FolderTree,
  map: MapPin, form: ListChecks, choice: ListChecks, gallery: Image, image: Image,
  audio: AudioLines, video: Video, dashboard: LayoutDashboard, document: FileText,
  spreadsheet: Table2, presentation: LayoutDashboard, board: LayoutDashboard, database: Table2, pdf: FileText,
  'decision-matrix': SlidersHorizontal,
};

function ResponseBlockIcon({ block }: { block: XrogaBlock }) {
  const Fallback = typeIcons[block.type] ?? Sparkles;
  return <span className="xv-response-block-icon mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)]" aria-hidden="true">
    {block.icon ? <Suspense fallback={<Fallback className="h-4 w-4" />}><CustomLucideIcon name={block.icon} fallback={Fallback} /></Suspense> : <Fallback className="h-4 w-4" />}
  </span>;
}

function TextRenderer({ block }: { block: XrogaBlock }) {
  if (!['narrative', 'notice', 'status', 'error', 'empty-state'].includes(block.type)) return null;
  const tone = 'tone' in block ? block.tone : undefined;
  const Icon = block.type === 'error' || tone === 'danger' ? AlertCircle : tone === 'warning' ? TriangleAlert : tone === 'success' ? Check : null;
  return (
    <section className="flex max-w-[820px] gap-2.5 rounded-xl py-1 text-sm text-[var(--foreground)]" role={block.type === 'error' ? 'alert' : undefined}>
      {Icon ? <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : null}
      <div>
        {block.title ? <h3 className="font-medium">{block.title}</h3> : null}
        {block.type === 'narrative' ? (
          <div className="xv-response-text"><FormattedAiMarkdown content={block.text} /></div>
        ) : (
          <p className="whitespace-pre-wrap leading-6">{'text' in block ? block.text : ''}</p>
        )}
      </div>
    </section>
  );
}

function ListRenderer({ block }: { block: XrogaBlock }) {
  if (block.type !== 'plan' && block.type !== 'activity') return null;
  return (
    <section className="max-w-[820px] space-y-2 py-1">
      {block.title ? <h3 className="text-sm font-medium text-[var(--foreground)]">{block.title}</h3> : null}
      <ul className="space-y-1.5" aria-label={block.title ?? block.type}>
        {block.items.map((item) => {
          const Icon = item.status === 'completed' ? Check : item.status === 'failed' ? AlertCircle : item.status === 'waiting' ? Clock3 : LoaderCircle;
          return <li key={item.id} className="flex gap-2 text-sm"><Icon className={`mt-0.5 h-4 w-4 shrink-0 ${item.status === 'running' ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" /><span>{item.label}{item.detail ? <span className="ml-2 text-xs text-[var(--muted)]">{item.detail}</span> : null}</span></li>;
        })}
      </ul>
    </section>
  );
}

function EvidenceRenderer({ block }: { block: XrogaBlock }) {
  if (block.type !== 'evidence') return null;
  return (
    <details className="xv-response-surface max-w-[820px] rounded-xl border border-[var(--border)] p-3 text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium"><FileCheck2 className="h-4 w-4" aria-hidden="true" />{block.evidence.title}</summary>
      {block.evidence.summary ? <p className="mt-2 text-[var(--muted)]">{block.evidence.summary}</p> : null}
      {block.evidence.locator ? <code className="mt-2 block break-all text-xs">{block.evidence.locator}</code> : null}
    </details>
  );
}

function LinkRenderer({ block }: { block: XrogaBlock }) {
  if (block.type !== 'citation' && block.type !== 'source') return null;
  const href = safeArtifactUri(block.url);
  return href ? <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-[var(--accent)] underline-offset-4 hover:underline">{block.label}<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a> : <span className="text-sm text-[var(--muted)]">{block.label} · unsafe source link omitted</span>;
}

function ApprovalRenderer({ block }: { block: XrogaBlock }) {
  if (block.type !== 'approval') return null;
  return <section className="xv-response-surface max-w-[820px] rounded-xl border border-amber-500/35 p-3 text-sm" aria-label="Approval required"><div className="flex items-center gap-2"><CircleHelp className="h-4 w-4 text-amber-500" aria-hidden="true" /><h3 className="font-medium">{block.approval.title}</h3></div>{block.approval.description ? <p className="mt-1 text-[var(--muted)]">{block.approval.description}</p> : null}<p className="mt-2 text-xs font-medium text-[var(--muted)]">{block.approval.status === 'requested' ? 'Review this action before Xroga continues.' : `Approval ${block.approval.status}.`}</p></section>;
}

function ReceiptRenderer({ block }: { block: XrogaBlock }) {
  if (block.type !== 'receipt') return null;
  const href = safeArtifactUri(block.receipt.viewUrl);
  return <section className="xv-response-surface max-w-[820px] rounded-xl border border-[var(--border)] p-3 text-sm"><div className="flex items-center gap-2"><Check className="h-4 w-4" aria-hidden="true" /><h3 className="font-medium">{block.receipt.action}</h3></div><p className="mt-1 text-[var(--muted)]">{block.receipt.target} · {block.receipt.service} · {block.receipt.status}</p>{href ? <a href={href} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-[var(--accent)]">View result<ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a> : null}</section>;
}

function ContentRenderer({ block }: { block: XrogaBlock }) {
  if (block.type !== 'code' && block.type !== 'diff' && block.type !== 'terminal' && block.type !== 'file') return null;
  return <section className="xv-response-surface max-w-[820px] overflow-hidden rounded-xl border border-[var(--border)]"><header className="flex min-h-10 items-center justify-between gap-3 border-b border-[var(--border)] px-3"><span className="truncate text-xs font-medium">{block.title ?? block.path ?? block.type}</span><InlineCopyButton value={block.content} /></header><pre className="max-h-96 overflow-auto whitespace-pre-wrap p-3 font-mono text-[13px] leading-5">{block.content}</pre></section>;
}

function ConnectionRenderer({ block }: { block: XrogaBlock }) {
  if (block.type !== 'connection-request') return null;
  return <section className="xv-response-surface max-w-[820px] rounded-xl border border-amber-500/35 p-3 text-sm" aria-label={`Connect ${block.service}`}><div className="flex items-center gap-2"><PlugZap className="h-4 w-4 text-amber-500" aria-hidden="true" /><h3 className="font-medium">Connect {block.service}</h3></div><dl className="mt-3 grid gap-2 text-[13px]"><div><dt className="font-medium">Why</dt><dd className="text-[var(--muted)]">{block.reason}</dd></div><div><dt className="font-medium">Access</dt><dd className="text-[var(--muted)]">{block.access ?? `Only the ${block.service} data you authorize.`}</dd></div><div><dt className="font-medium">Next</dt><dd className="text-[var(--muted)]">{block.next ?? `Xroga will continue your request after ${block.service} is connected.`}</dd></div></dl></section>;
}

function WebsiteRenderer({ block }: { block: XrogaBlock }) {
  if (block.type !== 'website') return null;
  if (block.artifactKind === 'engineering' && isRenderableArtifact(block.artifact)) return <EngineeringArtifactView artifact={block.artifact} />;
  if (block.artifactKind === 'legacy-landing' && block.artifact && typeof block.artifact === 'object') return <LegacyLandingOutputView output={block.artifact as Record<string, unknown>} />;
  return <UnknownBlockRenderer block={block} />;
}

function ArtifactRenderer({ block }: { block: XrogaBlock }) {
  if (block.type !== 'artifact') return null;
  const uri = safeArtifactUri(block.uri);
  const source = uri ?? (block.inline && !block.mediaType.startsWith('text/') ? `data:${block.mediaType};base64,${block.inline}` : null);
  return <article className="xv-response-surface max-w-[820px] rounded-xl border border-[var(--border)] p-3"><header className="flex items-center justify-between gap-3"><span className="truncate text-sm font-medium">{block.name}</span><span className="text-xs text-[var(--muted)]">{block.mediaType}</span></header>{source && block.mediaType.startsWith('image/') ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={source} alt={block.name} className="mt-2 max-h-72 rounded-lg object-contain" /> : null}{source && block.mediaType.startsWith('audio/') ? <audio src={source} controls className="mt-2 w-full" /> : null}{source && block.mediaType.startsWith('video/') ? <video src={source} controls className="mt-2 max-h-72 w-full rounded-lg" /> : null}{block.inline && block.mediaType.startsWith('text/') ? <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-black/5 p-2 text-xs dark:bg-white/5">{block.inline}</pre> : null}{uri && !block.mediaType.match(/^(image|audio|video|text)\//) ? <a href={uri} className="mt-2 inline-flex text-sm text-[var(--accent)]" download>Download artifact</a> : null}{block.metadataOnly ? <p className="mt-2 text-xs text-[var(--muted)]">Metadata only. Open Files or task details to inspect this artifact.</p> : null}</article>;
}

export function UnknownBlockRenderer({ block }: { block: XrogaBlock }) {
  return <section className="xv-response-surface max-w-[820px] rounded-xl border border-[var(--border)] p-3 text-sm text-[var(--muted)]"><p>{block.title ?? 'This output is not previewable yet.'}</p><p className="mt-1 text-xs">Open task details to inspect the saved output.</p></section>;
}

for (const type of ['narrative', 'notice', 'status', 'error', 'empty-state'] as const) registerRenderer(type, TextRenderer);
for (const type of ['plan', 'activity'] as const) registerRenderer(type, ListRenderer);
registerRenderer('evidence', EvidenceRenderer);
registerRenderer('citation', LinkRenderer);
registerRenderer('source', LinkRenderer);
registerRenderer('approval', ApprovalRenderer);
registerRenderer('receipt', ReceiptRenderer);
for (const type of ['code', 'diff', 'terminal', 'file'] as const) registerRenderer(type, ContentRenderer);
registerRenderer('connection-request', ConnectionRenderer);
registerRenderer('website', WebsiteRenderer);
registerRenderer('artifact', ArtifactRenderer);
registerRenderer('decision-matrix', DecisionMatrixRenderer);
for (const type of ['metric', 'metric-group', 'progress', 'progress-group', 'calculator', 'calculation', 'gauge', 'comparison', 'key-value', 'checklist', 'steps', 'scorecard', 'ranking', 'tabs', 'accordion', 'file-tree', 'calendar', 'source-list', 'card-grid', 'tree', 'json', 'api-request', 'table', 'chart', 'timeline', 'graph', 'map', 'form', 'choice', 'gallery', 'image', 'audio', 'video', 'dashboard', 'document', 'spreadsheet', 'presentation', 'board', 'database', 'pdf'] as const) registerRenderer(type, RichBlockRenderer);

export function XrogaOutputView({ output }: { output: XrogaOutputDocument }) {
  return <section className="xv-ai-output-block space-y-4 py-3" aria-label="Xroga output">{output.artifact ? <XrogaArtifactHeader artifact={output.artifact} status={output.status} /> : null}{output.blocks.map((candidate) => {
    const block = parseXrogaBlock(candidate);
    return <div key={candidate.id} className="flex min-w-0 items-start gap-2.5">{block ? <ResponseBlockIcon block={block} /> : null}<div className="min-w-0 flex-1">{block ? <Suspense fallback={<div className="h-24 max-w-[960px] animate-pulse rounded-2xl border border-[var(--border)] bg-black/5 dark:bg-white/5" />}>{renderBlock(block)}</Suspense> : <UnknownBlockRenderer block={candidate} />}</div></div>;
  })}</section>;
}
