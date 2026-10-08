import { adaptTrustedA2uiBlock } from './xrogaA2uiAdapter';
import type { XrogaBlock, XrogaOutputDocument } from './xrogaBlocks';

const XROGA_UI_FENCE = /```xroga-ui\s*\n?([\s\S]*?)```/gi;
const TABLE_DIVIDER = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;
const RICH_TYPES = new Set([
  'metric', 'metric-group', 'table', 'chart', 'timeline', 'graph', 'map', 'form', 'choice',
  'gallery', 'image', 'audio', 'video', 'dashboard', 'document', 'spreadsheet', 'presentation',
  'board', 'database', 'pdf',
]);
const UNSAFE_KEYS = new Set(['html', 'script', 'onclick', 'actionurl', '__proto__', 'prototype', 'constructor']);
const MAX_PROTOCOL_CHARS = 50_000;
const MAX_RICH_BLOCKS = 8;

type Scalar = string | number | boolean | null;

export interface EnhancedAiResponse {
  content: string;
  output?: XrogaOutputDocument;
}

function compactWhitespace(value: string): string {
  return value.replace(/\n{3,}/g, '\n\n').trim();
}

/** Hide the private data protocol while the answer is streaming, including an unfinished fence. */
export function stripXrogaUiProtocol(content: string): string {
  const complete = content.replace(XROGA_UI_FENCE, '');
  const open = complete.search(/```xroga-ui\b/i);
  return compactWhitespace(open >= 0 ? complete.slice(0, open) : complete);
}

function containsUnsafeKey(value: unknown, depth = 0): boolean {
  if (depth > 12 || value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((item) => containsUnsafeKey(item, depth + 1));
  return Object.entries(value as Record<string, unknown>).some(
    ([key, nested]) => UNSAFE_KEYS.has(key.toLowerCase()) || containsUnsafeKey(nested, depth + 1),
  );
}

function safeIdPart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'output';
}

function canonicalRichBlock(value: unknown, documentId: string, index: number): XrogaBlock | null {
  if (!value || typeof value !== 'object' || Array.isArray(value) || containsUnsafeKey(value)) return null;
  const input = value as Record<string, unknown>;
  if (typeof input.type !== 'string' || !RICH_TYPES.has(input.type)) return null;
  const candidate = {
    ...input,
    schemaVersion: 1,
    id: typeof input.id === 'string' && input.id.trim()
      ? safeIdPart(input.id)
      : `${safeIdPart(documentId)}-${safeIdPart(input.type)}-${index + 1}`,
    ...('state' in input ? {} : { state: 'ready' }),
  };
  return adaptTrustedA2uiBlock(candidate);
}

function parseProtocolBlocks(content: string, documentId: string): XrogaBlock[] {
  const blocks: XrogaBlock[] = [];
  for (const match of content.matchAll(XROGA_UI_FENCE)) {
    if (blocks.length >= MAX_RICH_BLOCKS) break;
    const raw = match[1]?.trim() ?? '';
    if (!raw || raw.length > MAX_PROTOCOL_CHARS) continue;
    try {
      const decoded = JSON.parse(raw) as unknown;
      const candidates = Array.isArray(decoded) ? decoded : [decoded];
      for (const candidate of candidates) {
        if (blocks.length >= MAX_RICH_BLOCKS) break;
        const block = canonicalRichBlock(candidate, documentId, blocks.length);
        if (block) blocks.push(block);
      }
    } catch {
      // The protocol is never rendered as prose. A malformed payload simply has no UI effect.
    }
  }
  return blocks;
}

function splitTableRow(line: string): string[] {
  let value = line.trim();
  if (value.startsWith('|')) value = value.slice(1);
  if (value.endsWith('|')) value = value.slice(0, -1);
  return value
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, '|').replace(/^`|`$/g, '').replace(/^\*\*|\*\*$/g, ''));
}

function keyFor(label: string, index: number, used: Set<string>): string {
  const base = safeIdPart(label).replace(/-/g, '_') || `column_${index + 1}`;
  let key = base;
  let suffix = 2;
  while (used.has(key)) key = `${base}_${suffix++}`;
  used.add(key);
  return key;
}

function scalar(value: string): Scalar {
  const trimmed = value.trim();
  if (!trimmed || /^(?:n\/a|null|—|-)$/i.test(trimmed)) return trimmed || null;
  if (/^(?:true|false)$/i.test(trimmed)) return trimmed.toLowerCase() === 'true';
  const numeric = trimmed
    .replace(/^[$€£¥]\s*/, '')
    .replace(/,/g, '')
    .replace(/%$/, '')
    .match(/^(-?\d+(?:\.\d+)?)\s*([kmb])?$/i);
  if (numeric) {
    const multiplier = numeric[2]?.toLowerCase() === 'k' ? 1_000
      : numeric[2]?.toLowerCase() === 'm' ? 1_000_000
        : numeric[2]?.toLowerCase() === 'b' ? 1_000_000_000
          : 1;
    return Number(numeric[1]) * multiplier;
  }
  return trimmed;
}

function precedingTableTitle(lines: string[], headerIndex: number, ordinal: number): string {
  for (let index = headerIndex - 1; index >= Math.max(0, headerIndex - 4); index -= 1) {
    const line = lines[index]?.trim();
    if (!line) continue;
    const heading = line.match(/^#{1,6}\s+(.+)$/)?.[1]?.trim();
    if (heading) return heading;
    break;
  }
  return `Data table ${ordinal + 1}`;
}

function tableBlocksFromMarkdown(content: string, documentId: string): { content: string; blocks: XrogaBlock[] } {
  const lines = content.split('\n');
  const removed = new Set<number>();
  const blocks: XrogaBlock[] = [];

  for (let index = 0; index < lines.length - 2 && blocks.length < MAX_RICH_BLOCKS; index += 1) {
    if (!lines[index]?.includes('|') || !TABLE_DIVIDER.test(lines[index + 1] ?? '')) continue;
    const labels = splitTableRow(lines[index] ?? '');
    const dividers = splitTableRow(lines[index + 1] ?? '');
    if (labels.length < 2 || labels.length !== dividers.length) continue;

    let end = index + 2;
    const rawRows: string[][] = [];
    while (end < lines.length && lines[end]?.includes('|') && lines[end]?.trim()) {
      const cells = splitTableRow(lines[end] ?? '');
      if (cells.length !== labels.length) break;
      rawRows.push(cells);
      end += 1;
    }
    if (!rawRows.length) continue;

    const used = new Set<string>();
    const keys = labels.map((label, column) => keyFor(label, column, used));
    const rows = rawRows.slice(0, 250).map((cells) => Object.fromEntries(
      cells.map((cell, column) => [keys[column], scalar(cell)]),
    ));
    const title = precedingTableTitle(lines, index, blocks.length);
    const columnTypes = keys.map((key) => {
      const values = rows.map((row) => row[key]).filter((value) => value !== null && value !== '');
      if (values.length && values.every((value) => typeof value === 'number')) return 'number' as const;
      if (values.length && values.every((value) => typeof value === 'boolean')) return 'boolean' as const;
      if (values.length && values.every((value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value))) return 'date' as const;
      return 'text' as const;
    });

    blocks.push({
      schemaVersion: 1,
      id: `${safeIdPart(documentId)}-table-${blocks.length + 1}`,
      type: 'table',
      title,
      state: 'ready',
      searchable: rows.length > 5,
      selectable: true,
      columns: labels.map((label, column) => ({ key: keys[column]!, label, type: columnTypes[column] })),
      rows,
    });

    const numericKeys = keys.filter((_, column) => columnTypes[column] === 'number');
    const xKey = keys.find((_, column) => columnTypes[column] !== 'number');
    if (rows.length >= 3 && xKey && numericKeys.length && blocks.length < MAX_RICH_BLOCKS) {
      const timeSeries = rows.every((row) => /(?:^|\b)(?:\d{4}|q[1-4]|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(String(row[xKey])));
      blocks.push({
        schemaVersion: 1,
        id: `${safeIdPart(documentId)}-chart-${blocks.length + 1}`,
        type: 'chart',
        title,
        state: 'ready',
        chartType: timeSeries ? 'line' : 'bar',
        xKey,
        data: rows,
        series: numericKeys.slice(0, 5).map((key) => ({ key, label: labels[keys.indexOf(key)] ?? key })),
        summary: `${numericKeys.slice(0, 5).map((key) => labels[keys.indexOf(key)] ?? key).join(', ')} by ${labels[keys.indexOf(xKey)] ?? xKey}`,
      });
    }

    for (let rowIndex = index; rowIndex < end; rowIndex += 1) removed.add(rowIndex);
    index = end - 1;
  }

  return {
    content: compactWhitespace(lines.filter((_, index) => !removed.has(index)).join('\n')),
    blocks,
  };
}

/** Convert a completed assistant answer into the canonical, persisted Xroga output document. */
export function enhanceAiResponse(content: string, documentId: string): EnhancedAiResponse {
  const source = typeof content === 'string' ? content : '';
  const protocolBlocks = parseProtocolBlocks(source, documentId);
  const withoutProtocol = stripXrogaUiProtocol(source);
  const markdown = tableBlocksFromMarkdown(withoutProtocol, documentId);
  const richBlocks = [...markdown.blocks, ...protocolBlocks].slice(0, MAX_RICH_BLOCKS);
  if (!richBlocks.length) return { content: withoutProtocol || source.trim() };

  const narrative = compactWhitespace(markdown.content);
  const blocks: XrogaBlock[] = [
    ...(narrative
      ? [{ schemaVersion: 1 as const, id: `${safeIdPart(documentId)}-narrative`, type: 'narrative' as const, text: narrative }]
      : []),
    ...richBlocks,
  ];
  return {
    content: narrative,
    output: {
      schemaVersion: 1,
      id: `response-${safeIdPart(documentId)}`,
      status: 'completed',
      blocks,
    },
  };
}
