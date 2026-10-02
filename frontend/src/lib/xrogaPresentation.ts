import type { XrogaBlock } from './xrogaBlocks';

export type PresentationIntent = XrogaBlock['type'];

type IntentInput = {
  kind?: string;
  mimeType?: string;
  rows?: unknown[];
  columns?: unknown[];
  series?: unknown[];
  metrics?: unknown[];
  events?: unknown[];
  nodes?: unknown[];
  fields?: unknown[];
  slides?: unknown[];
  locations?: unknown[];
};

/**
 * Chooses a presentation from structured result shape, never from prompt words.
 * It does not synthesize missing values or change execution routing.
 */
export function resolvePresentationIntent(input: IntentInput): PresentationIntent {
  const kind = input.kind?.toLowerCase();
  const mime = input.mimeType?.toLowerCase();
  if (kind === 'dashboard') return 'dashboard';
  if (kind === 'spreadsheet') return 'spreadsheet';
  if (kind === 'database') return 'database';
  if (kind === 'board') return 'board';
  if (input.slides?.length || kind === 'presentation') return 'presentation';
  if (input.nodes?.length || kind === 'graph') return 'graph';
  if (input.locations?.length || kind === 'map') return 'map';
  if (input.fields?.length || kind === 'form') return 'form';
  if (input.events?.length || kind === 'timeline') return 'timeline';
  if (input.series?.length && input.rows?.length) return 'chart';
  if (input.columns?.length && input.rows) return 'table';
  if (input.metrics?.length) return 'metric-group';
  if (mime === 'application/pdf') return 'pdf';
  if (mime?.startsWith('image/')) return 'image';
  if (mime?.startsWith('audio/')) return 'audio';
  if (mime?.startsWith('video/')) return 'video';
  if (mime?.includes('sheet') || mime === 'text/csv') return 'spreadsheet';
  if (mime?.startsWith('text/')) return 'document';
  return 'artifact';
}
export function shouldVirtualizeRows(count: number): boolean {
  return count > 100;
}
