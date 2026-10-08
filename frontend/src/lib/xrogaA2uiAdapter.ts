import { parseXrogaBlock, type XrogaBlock } from './xrogaBlocks';

const ALLOWED_A2UI_TYPES = new Set<XrogaBlock['type']>([
  'narrative', 'notice', 'status', 'error', 'empty-state', 'code', 'diff', 'terminal', 'file',
  'citation', 'source', 'metric', 'metric-group', 'table', 'chart',
  'timeline', 'graph', 'map', 'form', 'choice', 'gallery', 'image', 'audio', 'video', 'dashboard',
  'document', 'spreadsheet', 'presentation', 'board', 'database', 'pdf', 'progress', 'progress-group',
  'calculator', 'calculation', 'gauge', 'comparison', 'key-value', 'checklist', 'steps', 'scorecard', 'ranking',
  'tabs', 'accordion', 'file-tree', 'calendar', 'source-list',
]);

/** Safe A2UI boundary: data-only canonical blocks, no scripts, HTML, or arbitrary actions. */
export function adaptTrustedA2uiBlock(value: unknown): XrogaBlock | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.type !== 'string' || !ALLOWED_A2UI_TYPES.has(candidate.type as XrogaBlock['type'])) return null;
  if ('html' in candidate || 'script' in candidate || 'onClick' in candidate || 'actionUrl' in candidate) return null;
  return parseXrogaBlock(value);
}
