import { z } from 'zod';

export const XROGA_BLOCK_SCHEMA_VERSION = 1 as const;

export const xrogaEvidenceSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['web', 'file', 'database', 'calculation', 'tool', 'command', 'check', 'browser', 'test', 'deployment', 'git', 'action', 'artifact', 'integration']),
  title: z.string().min(1),
  summary: z.string().optional(),
  source: z.string().optional(),
  locator: z.string().optional(),
  timestamp: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  relatedEventIds: z.array(z.string()).optional(),
  relatedBlockIds: z.array(z.string()).optional(),
  relatedArtifactIds: z.array(z.string()).optional(),
});

export type XrogaEvidence = z.infer<typeof xrogaEvidenceSchema>;

export const xrogaApprovalSchema = z.object({
  id: z.string().min(1),
  action: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(['requested', 'approved', 'declined', 'cancelled']),
  risk: z.enum(['low', 'medium', 'high']).optional(),
  service: z.string().optional(),
  resumeContext: z.string().optional(),
});

export type XrogaApproval = z.infer<typeof xrogaApprovalSchema>;

export const xrogaReceiptSchema = z.object({
  id: z.string().min(1),
  action: z.string().min(1),
  target: z.string().min(1),
  service: z.string().min(1),
  account: z.string().optional(),
  status: z.enum(['completed', 'failed', 'pending', 'reversed']),
  timestamp: z.string().datetime(),
  externalReference: z.string().optional(),
  viewUrl: z.string().url().optional(),
  reversible: z.boolean().optional(),
  approvalId: z.string().optional(),
  evidenceRefs: z.array(z.string()).optional(),
});

export type XrogaReceipt = z.infer<typeof xrogaReceiptSchema>;

const blockBase = z.object({
  schemaVersion: z.literal(XROGA_BLOCK_SCHEMA_VERSION),
  id: z.string().min(1),
  title: z.string().optional(),
});

const textBlock = blockBase.extend({
  type: z.enum(['narrative', 'notice', 'status', 'error', 'empty-state']),
  text: z.string(),
  tone: z.enum(['neutral', 'info', 'success', 'warning', 'danger']).optional(),
});

const listBlock = blockBase.extend({
  type: z.enum(['plan', 'activity']),
  items: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    status: z.enum(['pending', 'running', 'waiting', 'completed', 'failed']),
    detail: z.string().optional(),
  })),
});

const evidenceBlock = blockBase.extend({ type: z.literal('evidence'), evidence: xrogaEvidenceSchema });
const linkBlock = blockBase.extend({
  type: z.enum(['citation', 'source']),
  label: z.string().min(1),
  url: z.string().url(),
  excerpt: z.string().optional(),
});
const approvalBlock = blockBase.extend({ type: z.literal('approval'), approval: xrogaApprovalSchema });
const receiptBlock = blockBase.extend({ type: z.literal('receipt'), receipt: xrogaReceiptSchema });
const contentBlock = blockBase.extend({
  type: z.enum(['code', 'diff', 'terminal', 'file']),
  content: z.string(),
  language: z.string().optional(),
  path: z.string().optional(),
});
const connectionBlock = blockBase.extend({
  type: z.literal('connection-request'),
  service: z.string().min(1),
  reason: z.string().min(1),
  access: z.string().optional(),
  next: z.string().optional(),
  capability: z.string().min(1),
  action: z.string().min(1),
  resumeContext: z.string().optional(),
});
const websiteBlock = blockBase.extend({
  type: z.literal('website'),
  artifactKind: z.enum(['engineering', 'legacy-landing']),
  artifact: z.unknown(),
});
const artifactBlock = blockBase.extend({
  type: z.literal('artifact'),
  name: z.string().min(1),
  mediaType: z.string().min(1),
  uri: z.string().optional(),
  inline: z.string().optional(),
  metadataOnly: z.boolean().optional(),
});

const scalarValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const dataRow = z.record(z.string(), scalarValue);
const lifecycleState = z.enum(['loading', 'ready', 'empty', 'partial', 'error', 'unsupported']).optional();
const richBase = blockBase.extend({
  description: z.string().optional(),
  state: lifecycleState,
  evidenceRefs: z.array(z.string()).optional(),
  artifactId: z.string().optional(),
});
const metricItem = z.object({
  id: z.string().min(1), label: z.string().min(1), value: z.union([z.string(), z.number()]),
  unit: z.string().optional(), change: z.number().optional(), trend: z.enum(['up', 'down', 'flat']).optional(),
});
const tableShape = {
  columns: z.array(z.object({ key: z.string().min(1), label: z.string().min(1), type: z.enum(['text', 'number', 'date', 'boolean', 'url']).optional() })).min(1),
  rows: z.array(dataRow), datasetId: z.string().optional(), searchable: z.boolean().optional(), selectable: z.boolean().optional(),
};

const metricBlock = richBase.extend({ type: z.literal('metric'), metric: metricItem });
const metricGroupBlock = richBase.extend({ type: z.literal('metric-group'), metrics: z.array(metricItem).min(1) });
const tableBlock = richBase.extend({ type: z.literal('table'), ...tableShape });
const chartBlock = richBase.extend({
  type: z.literal('chart'), chartType: z.enum(['line', 'area', 'bar']), data: z.array(dataRow), xKey: z.string().min(1),
  series: z.array(z.object({ key: z.string().min(1), label: z.string().min(1), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() })).min(1),
  datasetId: z.string().optional(), summary: z.string().min(1),
});
const timelineBlock = richBase.extend({ type: z.literal('timeline'), events: z.array(z.object({ id: z.string().min(1), title: z.string().min(1), date: z.string().min(1), detail: z.string().optional(), status: z.enum(['pending', 'running', 'completed', 'failed']).optional() })) });
const graphBlock = richBase.extend({
  type: z.literal('graph'), nodes: z.array(z.object({ id: z.string().min(1), label: z.string().min(1), detail: z.string().optional(), status: z.string().optional() })),
  edges: z.array(z.object({ id: z.string().optional(), source: z.string().min(1), target: z.string().min(1), label: z.string().optional() })),
});
const mapBlock = richBase.extend({ type: z.literal('map'), locations: z.array(z.object({ id: z.string().min(1), label: z.string().min(1), latitude: z.number().min(-90).max(90).optional(), longitude: z.number().min(-180).max(180).optional(), detail: z.string().optional() })) });
const formBlock = richBase.extend({ type: z.literal('form'), fields: z.array(z.object({ id: z.string().min(1), label: z.string().min(1), inputType: z.enum(['text', 'email', 'number', 'date', 'textarea']), required: z.boolean().optional(), value: scalarValue.optional() })), submitLabel: z.string().optional(), disabledReason: z.string().optional() });
const choiceBlock = richBase.extend({ type: z.literal('choice'), prompt: z.string().min(1), options: z.array(z.object({ id: z.string().min(1), label: z.string().min(1), description: z.string().optional(), disabled: z.boolean().optional() })).min(1), disabledReason: z.string().optional() });
const mediaItem = z.object({ id: z.string().min(1), label: z.string().min(1), url: z.string().url(), mediaType: z.string().optional(), caption: z.string().optional() });
const galleryBlock = richBase.extend({ type: z.literal('gallery'), items: z.array(mediaItem) });
const imageBlock = richBase.extend({ type: z.literal('image'), image: mediaItem });
const audioBlock = richBase.extend({ type: z.literal('audio'), audio: mediaItem });
const videoBlock = richBase.extend({ type: z.literal('video'), video: mediaItem });
const dashboardBlock = richBase.extend({ type: z.literal('dashboard'), metrics: z.array(metricItem).optional(), charts: z.array(z.object({ id: z.string().min(1), title: z.string().optional(), chartType: z.enum(['line', 'area', 'bar']), data: z.array(dataRow), xKey: z.string().min(1), series: z.array(z.object({ key: z.string().min(1), label: z.string().min(1), color: z.string().optional() })).min(1), summary: z.string().min(1) })).optional(), tables: z.array(z.object({ id: z.string().min(1), title: z.string().optional(), ...tableShape })).optional() });
const documentBlock = richBase.extend({ type: z.literal('document'), content: z.string(), format: z.enum(['markdown', 'text']).default('markdown'), version: z.number().int().positive().optional() });
const spreadsheetBlock = richBase.extend({ type: z.literal('spreadsheet'), ...tableShape, formulas: z.record(z.string(), z.string()).optional() });
const presentationBlock = richBase.extend({ type: z.literal('presentation'), slides: z.array(z.object({ id: z.string().min(1), title: z.string().min(1), body: z.string().optional(), bullets: z.array(z.string()).optional(), imageUrl: z.string().url().optional() })).min(1) });
const boardBlock = richBase.extend({ type: z.literal('board'), columns: z.array(z.object({ id: z.string().min(1), title: z.string().min(1), items: z.array(z.object({ id: z.string().min(1), title: z.string().min(1), detail: z.string().optional() })) })) });
const databaseBlock = richBase.extend({ type: z.literal('database'), ...tableShape });
const pdfBlock = richBase.extend({ type: z.literal('pdf'), name: z.string().min(1), uri: z.string().url().optional(), pageCount: z.number().int().positive().optional(), metadataOnly: z.boolean().optional() });

export const xrogaBlockSchema = z.discriminatedUnion('type', [
  textBlock, listBlock, evidenceBlock, linkBlock, approvalBlock, receiptBlock,
  contentBlock, connectionBlock, websiteBlock, artifactBlock,
  metricBlock, metricGroupBlock, tableBlock, chartBlock, timelineBlock, graphBlock, mapBlock,
  formBlock, choiceBlock, galleryBlock, imageBlock, audioBlock, videoBlock, dashboardBlock,
  documentBlock, spreadsheetBlock, presentationBlock, boardBlock, databaseBlock, pdfBlock,
]);

export type XrogaBlock = z.infer<typeof xrogaBlockSchema>;

export const xrogaOutputSchema = z.object({
  schemaVersion: z.literal(XROGA_BLOCK_SCHEMA_VERSION),
  id: z.string().min(1),
  status: z.enum(['completed', 'partial', 'blocked', 'failed']),
  blocks: z.array(xrogaBlockSchema),
  artifact: z.object({
    id: z.string().min(1), type: z.string().min(1), title: z.string().min(1), projectId: z.string().optional(),
    conversationId: z.string().optional(), runId: z.string().optional(), version: z.number().int().positive().default(1),
    createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
  }).optional(),
});

export type XrogaOutputDocument = z.infer<typeof xrogaOutputSchema>;

export function parseXrogaBlock(value: unknown): XrogaBlock | null {
  const parsed = xrogaBlockSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  // UI/UX Step 1 persisted reserved rich blocks under `data`. Preserve those
  // conversations by lifting only plain data fields into the now-explicit schema.
  if (value && typeof value === 'object' && 'data' in value) {
    const candidate = value as Record<string, unknown>;
    if (candidate.data && typeof candidate.data === 'object' && !Array.isArray(candidate.data)) {
      const { data, ...identity } = candidate;
      const migrated = xrogaBlockSchema.safeParse({ ...identity, ...(data as Record<string, unknown>) });
      if (migrated.success) return migrated.data;
    }
  }
  return null;
}

export function parseXrogaOutput(value: unknown): XrogaOutputDocument | null {
  const parsed = xrogaOutputSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
