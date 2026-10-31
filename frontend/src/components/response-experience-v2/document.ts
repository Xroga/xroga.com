import { z } from 'zod';
import { parseXrogaOutput } from '@/lib/xrogaBlocks';
import type { CitationSource } from '@/lib/xrogaCitations';

const text = z.string().max(200_000);
const label = z.string().max(500);
const scalar = z.union([z.string().max(10_000), z.number().finite(), z.boolean(), z.null()]);
const row = z.record(z.string().max(120), scalar);
const base = z.object({ id: z.string().min(1).max(200), title: label.optional(), description: text.optional() });
const column = z.object({ key: label, label });
const series = z.object({ key: label, label });
export const nodeSchema = z.discriminatedUnion('kind', [
  base.extend({ kind: z.literal('prose'), text }),
  base.extend({ kind: z.literal('code'), text, language: label.optional() }),
  base.extend({ kind: z.literal('table'), columns: z.array(column).min(1).max(40), rows: z.array(row).max(10_000) }),
  base.extend({ kind: z.literal('chart'), shape: z.enum(['line', 'bar', 'area', 'pie', 'scatter']), xKey: label, series: z.array(series).min(1).max(8), rows: z.array(row).max(2_000), summary: text }),
  base.extend({ kind: z.literal('calculator'), operation: z.enum(['sum', 'difference', 'product', 'quotient', 'average', 'percentage', 'percentage-change', 'minimum', 'maximum']), inputs: z.array(z.object({ id: label, label, value: z.number().finite(), min: z.number().finite().optional(), max: z.number().finite().optional(), step: z.number().positive().optional(), unit: label.optional() })).min(1).max(12), resultLabel: label, unit: label.optional(), precision: z.number().int().min(0).max(8) }),
  base.extend({ kind: z.literal('graph'), nodes: z.array(z.object({ id: label, label, detail: text.optional() })).max(100), edges: z.array(z.object({ source: label, target: label, label: label.optional() })).max(200) }),
  base.extend({ kind: z.literal('metrics'), items: z.array(z.object({ id: label, label, value: scalar, unit: label.optional() })).max(30) }),
  base.extend({ kind: z.literal('tabs'), items: z.array(z.object({ id: label, label, content: text })).min(1).max(12) }),
  base.extend({ kind: z.literal('citation'), label, url: text, excerpt: text.optional() }),
  base.extend({ kind: z.literal('notice'), text, tone: z.enum(['neutral', 'info', 'success', 'warning', 'danger']) }),
  base.extend({ kind: z.literal('accordion'), items: z.array(z.object({ id: label, title: label, content: text })).max(24) }),
  base.extend({ kind: z.literal('timeline'), items: z.array(z.object({ id: label, label, detail: text.optional(), status: label.optional(), date: label.optional() })).max(100) }),
  base.extend({ kind: z.literal('progress'), items: z.array(z.object({ id: label, label, value: z.number().finite().nonnegative(), max: z.number().finite().positive(), detail: text.optional(), unit: label.optional(), status: label.optional() })).max(30) }),
]);
export const responseDocumentSchema = z.object({ version: z.literal(2), id: label, originalText: text, streaming: z.boolean(), nodes: z.array(nodeSchema).max(100), sources: z.array(z.object({ title: label, url: text, snippet: text })).max(100) });
export type ResponseNodeV2 = z.infer<typeof nodeSchema>;
export type ResponseDocumentV2 = z.infer<typeof responseDocumentSchema>;
export type ResponseInputV2 = { id: string; content: string; featureOutput?: unknown; webSources?: CitationSource[] };
export type AdaptedResponse = { supported: true; document: ResponseDocumentV2 } | { supported: false; reason: string };

/** No network, persistence, prompt rewriting or action inference. Unknown shapes
 * stay with the unchanged legacy surface, including their files and approvals. */
export function adaptResponseV2(input: ResponseInputV2, streaming = false): AdaptedResponse {
  try {
    if (input.content.length > 200_000) return { supported: false, reason: 'text-limit' };
    const nodes: unknown[] = [];
    if (input.content) nodes.push({ id: `${input.id}:text`, kind: 'prose', text: input.content });
    if (input.featureOutput != null) {
      // Bound raw depth/size before invoking the canonical parser.
      if (!boundedData(input.featureOutput)) return { supported: false, reason: 'payload-limit' };
      const raw = input.featureOutput as Record<string, unknown>;
      if (raw.type === 'chat' && typeof raw.content === 'string') {
        // Two different payloads can occur during stream completion. Preserve
        // the canonical fallback instead of guessing which text to discard.
        if (input.content && raw.content !== input.content) return { supported: false, reason: 'conflicting-chat-content' };
        if (!input.content) nodes.push({ id: `${input.id}:text`, kind: 'prose', text: raw.content });
      } else {
        const output = parseXrogaOutput(input.featureOutput);
        if (!output) return { supported: false, reason: 'legacy-contract' };
        for (const b of output.blocks) {
          const common = { id: b.id, title: b.title, description: 'description' in b ? b.description : undefined };
          switch (b.type) {
            case 'narrative': if (b.text !== input.content) nodes.push({ ...common, kind: 'prose', text: b.text }); break;
            case 'document': nodes.push({ ...common, kind: 'prose', text: b.content }); break;
            case 'code': case 'diff': case 'terminal': case 'file': nodes.push({ ...common, kind: 'code', title: b.path ?? b.title, text: b.content, language: b.language ?? b.type }); break;
            case 'notice': case 'status': case 'error': case 'empty-state': nodes.push({ ...common, kind: 'notice', text: b.text, tone: b.tone ?? 'neutral' }); break;
            case 'table': nodes.push({ ...common, kind: 'table', columns: b.columns, rows: b.rows }); break;
            case 'chart':
              if (!['line', 'bar', 'area', 'pie', 'scatter'].includes(b.chartType)) return { supported: false, reason: 'chart-shape' };
              nodes.push({ ...common, kind: 'chart', shape: b.chartType, xKey: b.xKey, series: b.series, rows: b.data, summary: b.summary }); break;
            case 'calculator': nodes.push({ ...common, kind: 'calculator', operation: b.operation, inputs: b.inputs, resultLabel: b.resultLabel, unit: b.resultUnit, precision: b.precision ?? 2 }); break;
            case 'graph': nodes.push({ ...common, kind: 'graph', nodes: b.nodes, edges: b.edges }); break;
            case 'metric': nodes.push({ ...common, kind: 'metrics', items: [b.metric] }); break;
            case 'metric-group': nodes.push({ ...common, kind: 'metrics', items: b.metrics }); break;
            case 'tabs': nodes.push({ ...common, kind: 'tabs', items: b.tabs }); break;
            case 'accordion': nodes.push({ ...common, kind: 'accordion', items: b.items }); break;
            case 'plan': case 'activity': case 'checklist': nodes.push({ ...common, kind: 'timeline', items: b.items }); break;
            case 'timeline': nodes.push({ ...common, kind: 'timeline', items: b.events.map(e => ({ ...e, label: e.title })) }); break;
            case 'steps': nodes.push({ ...common, kind: 'timeline', items: b.steps.map(e => ({ ...e, label: e.title, detail: e.description })) }); break;
            case 'progress': nodes.push({ ...common, kind: 'progress', items: [b.progress] }); break;
            case 'progress-group': nodes.push({ ...common, kind: 'progress', items: b.items }); break;
            case 'citation': case 'source': nodes.push({ ...common, kind: 'citation', label: b.label, url: b.url, excerpt: b.excerpt }); break;
            // Existing actions/artifacts retain their canonical authorization UI.
            default: return { supported: false, reason: `unsupported:${b.type}` };
          }
        }
      }
    }
    const parsed = responseDocumentSchema.safeParse({ version: 2, id: input.id, originalText: input.content, streaming, nodes, sources: input.webSources ?? [] });
    if (!parsed.success || new Set(parsed.data.nodes.map(n => n.id)).size !== parsed.data.nodes.length) return { supported: false, reason: 'invalid-document' };
    for (const n of parsed.data.nodes) {
      if (n.kind === 'tabs' && new Set(n.items.map(v => v.id)).size !== n.items.length) return { supported: false, reason: 'duplicate-tabs' };
      if (n.kind === 'progress' && n.items.some(v => v.value > v.max)) return { supported: false, reason: 'invalid-progress' };
      if (n.kind === 'chart' && (new Set(n.series.map(s => s.key)).size !== n.series.length || n.rows.some(r => !Object.hasOwn(r, n.xKey) || n.series.some(s => r[s.key] !== null && typeof r[s.key] !== 'number')) || (['pie', 'scatter'].includes(n.shape) && n.series.length !== 1) || (n.shape === 'scatter' && n.rows.some(r => typeof r[n.xKey] !== 'number')) || (n.shape === 'pie' && n.rows.some(r => typeof r[n.series[0].key] !== 'number' || Number(r[n.series[0].key]) < 0)))) return { supported: false, reason: 'invalid-chart-data' };
      if (n.kind === 'graph' && (new Set(n.nodes.map(v => v.id)).size !== n.nodes.length || n.edges.some(e => !n.nodes.some(v => v.id === e.source) || !n.nodes.some(v => v.id === e.target)))) return { supported: false, reason: 'invalid-graph' };
      if (n.kind === 'calculator' && (new Set(n.inputs.map(v => v.id)).size !== n.inputs.length || n.inputs.some(v => (v.min != null && v.max != null && v.min > v.max) || (v.min != null && v.value < v.min) || (v.max != null && v.value > v.max)))) return { supported: false, reason: 'invalid-inputs' };
    }
    return { supported: true, document: parsed.data };
  } catch { return { supported: false, reason: 'malformed-output' }; }
}

export function boundedData(value: unknown, depth = 0, budget = { remaining: 60_000, text: 2_000_000 }): boolean {
  if (depth > 16 || --budget.remaining < 0) return false;
  if (typeof value === 'string') { budget.text -= value.length; return value.length <= 200_000 && budget.text >= 0; }
  if (typeof value === 'number') return Number.isFinite(value);
  if (value == null || typeof value === 'boolean') return true;
  if (typeof value !== 'object') return false;
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return false;
  return Object.entries(value).every(([key, item]) => !['__proto__', 'prototype', 'constructor'].includes(key) && boundedData(item, depth + 1, budget));
}

/** Hide generated UI captions, never alter the source document or infer a title. */
export function displayTitleV2(title?: string): string | undefined {
  const value = title?.trim();
  return !value || /^(?:(?:data )?table|chart|output|widget)\s+\d+$/i.test(value) || /^untitled(?: block)?$/i.test(value) ? undefined : title;
}
export type PresentationGroupV2 = { id: string; kind: 'reading' | 'evidence' | 'scenario' | 'content'; width: 'wide' | 'prose'; nodes: ResponseNodeV2[] };
export function sameChartTableV2(chart: Extract<ResponseNodeV2, {kind:'chart'}>, table: Extract<ResponseNodeV2, {kind:'table'}>) {
  const keys = [chart.xKey, ...chart.series.map(s => s.key)];
  return table.columns.length === keys.length && table.columns.every((c, i) => c.key === keys[i]) && table.rows.length === chart.rows.length && table.rows.every((r, i) => keys.every(k => r[k] === chart.rows[i][k]));
}
/** Preserve ordering and wording. Only group adjacent, structurally related
 * content. No topic guessing, generated metrics, model calls or hidden actions. */
export function planPresentationV2(document: ResponseDocumentV2): PresentationGroupV2[] {
  const groups: PresentationGroupV2[] = [];
  for (const node of document.nodes) {
    const last = groups[groups.length - 1];
    const previous = last?.nodes[last.nodes.length - 1];
    if (node.kind === 'table' && previous?.kind === 'chart' && sameChartTableV2(previous, node)) {
      last.nodes.push(node); last.kind = 'evidence'; continue;
    }
    if (node.kind === 'tabs' && previous?.kind === 'calculator') {
      last.nodes.push(node); last.kind = 'scenario'; continue;
    }
    const kind = node.kind === 'prose' ? 'reading' : node.kind === 'chart' || node.kind === 'table' ? 'evidence' : node.kind === 'calculator' ? 'scenario' : 'content';
    groups.push({ id: node.id, kind, width: ['chart', 'table', 'graph', 'calculator'].includes(node.kind) ? 'wide' : 'prose', nodes: [node] });
  }
  return groups;
}
export function presentationFamilyV2(document: ResponseDocumentV2) {
  if (document.nodes.some(n => n.kind === 'calculator')) return 'interactive';
  if (document.nodes.some(n => n.kind === 'chart' || n.kind === 'table')) return 'data';
  if (document.sources.length) return 'research';
  return document.nodes.every(n => n.kind === 'prose') && document.originalText.length < 240 ? 'brief' : 'editorial';
}

export function safeLinkV2(value: string): string | undefined {
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : undefined; } catch { return undefined; }
}
