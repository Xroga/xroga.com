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
const futureBlock = blockBase.extend({
  type: z.enum(['metric', 'metric-group', 'table', 'chart', 'timeline', 'graph', 'map', 'form', 'choice', 'gallery', 'image', 'audio', 'video', 'dashboard', 'document', 'spreadsheet', 'presentation', 'board', 'database', 'pdf']),
  intent: z.string().optional(),
  data: z.record(z.string(), z.unknown()).default({}),
});

export const xrogaBlockSchema = z.discriminatedUnion('type', [
  textBlock, listBlock, evidenceBlock, linkBlock, approvalBlock, receiptBlock,
  contentBlock, connectionBlock, websiteBlock, artifactBlock, futureBlock,
]);

export type XrogaBlock = z.infer<typeof xrogaBlockSchema>;

export const xrogaOutputSchema = z.object({
  schemaVersion: z.literal(XROGA_BLOCK_SCHEMA_VERSION),
  id: z.string().min(1),
  status: z.enum(['completed', 'partial', 'blocked', 'failed']),
  blocks: z.array(xrogaBlockSchema),
});

export type XrogaOutputDocument = z.infer<typeof xrogaOutputSchema>;

export function parseXrogaBlock(value: unknown): XrogaBlock | null {
  const parsed = xrogaBlockSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseXrogaOutput(value: unknown): XrogaOutputDocument | null {
  const parsed = xrogaOutputSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
