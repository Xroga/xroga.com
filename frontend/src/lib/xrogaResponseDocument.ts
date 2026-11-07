import { adaptTrustedA2uiBlock } from './xrogaA2uiAdapter';
import { modelBlockCapabilitySet } from './xrogaCapabilityManifest';
import type { XrogaBlock, XrogaOutputDocument } from './xrogaBlocks';
import { responseCoverageContractSchema } from './responseCoverageContract';

const XROGA_UI_FENCE = /```xroga-ui\s*\n?([\s\S]*?)```/gi;
const TABLE_DIVIDER = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;
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
  if (depth > 12) return true;
  if (value === null || typeof value !== 'object') return false;
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
  if (typeof input.type !== 'string') return null;
  // A model-authored data fence is not a transaction receipt. Only a separately
  // authenticated server adapter may emit a confirmed result.
  if (input.type === 'rich-results' && Array.isArray(input.items) && input.items.some((item) => item && typeof item === 'object' && (item as { status?: unknown }).status === 'confirmed')) return null;
  if (!modelBlockCapabilitySet.has(input.type)) {
    if (!/^[a-z][a-z0-9-]{1,63}$/.test(input.type)) return null;
    return {
      schemaVersion: 1,
      id: `${safeIdPart(documentId)}-unsupported-${index + 1}`,
      type: 'notice',
      title: 'Output format unavailable',
      text: `${input.type} is not a supported Xroga response format. The answer remains available as text.`,
      tone: 'warning',
    };
  }
  const candidate = {
    ...input,
    // Preserve descriptions emitted by the existing primary model contract.
    // Canonical detail wins when both fields are supplied. Validation still
    // runs below, including the normal size and graph-reference bounds.
    ...(input.type === 'graph' && Array.isArray(input.nodes) ? {
      nodes: input.nodes.map(node => {
        if (!node || typeof node !== 'object' || Array.isArray(node)) return node;
        const item = node as Record<string, unknown>;
        return item.detail === undefined && typeof item.subtitle === 'string'
          ? { ...item, detail: item.subtitle } : item;
      }),
    } : {}),
    schemaVersion: 1,
    id: typeof input.id === 'string' && input.id.trim()
      ? safeIdPart(input.id)
      : `${safeIdPart(documentId)}-${safeIdPart(input.type)}-${index + 1}`,
    ...('state' in input ? {} : { state: 'ready' }),
  };
  const block = adaptTrustedA2uiBlock(candidate);
  if (block?.type === 'calculator' && block.derivedResults) {
    const inputs = new Set(block.inputs.map(input => input.id));
    if (inputs.has('$result') || new Set(block.derivedResults.map(item => item.id)).size !== block.derivedResults.length ||
      block.derivedResults.some(item => item.operands.some(value => typeof value === 'string' && value !== '$result' && !inputs.has(value)) ||
        (['quotient', 'percentage', 'percentage-change'].includes(item.operation) && item.operands.length !== 2) ||
        (['loan-payment', 'compound-growth'].includes(item.operation) && item.operands.length !== 3))) return null;
  }
  if (block?.type === 'graph') {
    const ids = new Set(block.nodes.map(node => node.id));
    const edges = new Set(block.edges.map(edge => JSON.stringify([edge.source, edge.target, edge.label ?? ''])));
    // Reject at ingestion so persistence carries the explicit partial notice.
    // Deferring this to V2 would silently switch the entire answer to legacy.
    if (!ids.size || ids.size !== block.nodes.length || edges.size !== block.edges.length ||
      block.edges.some(edge => !ids.has(edge.source) || !ids.has(edge.target))) return null;
  }
  return block;
}

function parseProtocolBlocks(content: string, documentId: string): { blocks: XrogaBlock[]; rejected: boolean } {
  const blocks: XrogaBlock[] = [];
  let rejected = false;
  for (const match of content.matchAll(XROGA_UI_FENCE)) {
    if (blocks.length >= MAX_RICH_BLOCKS) break;
    const raw = match[1]?.trim() ?? '';
    if (!raw || raw.length > MAX_PROTOCOL_CHARS) { rejected = true; continue; }
    try {
      const decoded = JSON.parse(raw) as unknown;
      const candidates = Array.isArray(decoded) ? decoded : [decoded];
      if (!candidates.length || candidates.length > MAX_RICH_BLOCKS) rejected = true;
      for (const candidate of candidates) {
        if (blocks.length >= MAX_RICH_BLOCKS) break;
        const block = canonicalRichBlock(candidate, documentId, blocks.length);
        if (block) blocks.push(block);
        else rejected = true;
      }
    } catch {
      rejected = true;
    }
  }
  return { blocks, rejected };
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
  // Preserve units, precision, leading zeroes and authored formatting. Only a
  // lossless plain-number conversion may participate in an inferred chart.
  const number = Number(trimmed);
  if (trimmed && Number.isFinite(number) && String(number) === trimmed) return number;
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

function tableBlocksFromMarkdown(content: string, documentId: string): { content: string; blocks: XrogaBlock[]; ordered: XrogaBlock[] } {
  const lines = content.split('\n');
  const removed = new Set<number>();
  const blocks: XrogaBlock[] = [];
  const ordered: XrogaBlock[] = [];
  let cursor = 0;
  let codeFence: string | undefined;
  const prose = (value: string) => {
    if (value.trim()) ordered.push({ schemaVersion: 1, id: `${safeIdPart(documentId)}-text-${ordered.length}`, type: 'narrative', text: value.trim() });
  };

  for (let index = 0; index < lines.length - 2 && blocks.length < MAX_RICH_BLOCKS; index += 1) {
    const fence = lines[index]?.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fence) {
      if (!codeFence) codeFence = fence[1];
      else if (fence[1]![0] === codeFence[0] && fence[1]!.length >= codeFence.length) codeFence = undefined;
      continue;
    }
    if (codeFence) continue;
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
    // Keep large tables as Markdown instead of silently truncating their rows.
    if (!rawRows.length || rawRows.length > 250) continue;

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

    prose(lines.slice(cursor, index).join('\n'));
    const blockStart = blocks.length;
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
    ordered.push(...blocks.slice(blockStart));
    cursor = end;
    index = end - 1;
  }

  prose(lines.slice(cursor).join('\n'));
  return {
    content: compactWhitespace(lines.filter((_, index) => !removed.has(index)).join('\n')),
    blocks,
    ordered,
  };
}

/** Convert a completed assistant answer into the canonical, persisted Xroga output document. */
export function enhanceAiResponse(content: string, documentId: string, completion?: { status: string; reason?: string }, received?: { format: string; text: string; contract?:unknown }): EnhancedAiResponse {
  const source = typeof content === 'string' ? content : '';
  if (source.length > 200_000) return { content: source };
  const blocks: XrogaBlock[] = [];
  let cursor = 0;
  let segment = 0;
  const contract = responseCoverageContractSchema.safeParse(received?.contract);
  const responseSource = received?.format === 'xroga-response-json-v1' && typeof received.text === 'string' && received.text.length <= 200_000
    ? { format: 'xroga-response-json-v1' as const, text: received.text,...(contract.success?{contract:contract.data}:{}) } : undefined;
  let rejected = completion?.status === 'partial' || Boolean(received?.contract && (!contract.success || !contract.data.coverage.complete));
  const partialReason = completion?.status === 'partial' ? completion.reason : 'presentation_contract';
  if (rejected) blocks.push({ schemaVersion: 1, id: `${safeIdPart(documentId)}-completion`, type: 'notice', tone: 'warning',
    text: partialReason === 'presentation_contract'
      ? 'This answer may not cover every part of your request. The written explanation is complete as shown.'
      : partialReason === 'authorization_review'
      ? 'Authorization guidance needs review. This answer contains a known unsafe authorization claim. Privileged database roles can bypass RLS, and JWT claims alone do not prove immediate revocation. Verify current server-owned tenant membership and permissions. The original answer is preserved. No automatic retry was made.'
      : partialReason === 'source_attribution'
      ? 'Some numbered citations could not be matched to a retrieved source. Linked citations are verified; treat any unlinked number as unverified. No automatic retry was made.'
      : partialReason === 'output_limit'
      ? 'This answer reached its output limit and is incomplete. The received content is preserved. No automatic retry was made.'
      : 'The provider did not confirm a complete answer. The received content is preserved. No automatic retry was made.' });
  const appendText = (value: string) => blocks.push(...tableBlocksFromMarkdown(value, `${documentId}-${segment++}`).ordered);
  for (const match of source.matchAll(XROGA_UI_FENCE)) {
    appendText(source.slice(cursor, match.index));
    const parsed = parseProtocolBlocks(match[0], `${documentId}-${segment++}`);
    if (parsed.blocks.length) blocks.push(...parsed.blocks);
    if (parsed.rejected || !parsed.blocks.length) {
      rejected = true;
      blocks.push({ schemaVersion: 1, id: `${safeIdPart(documentId)}-invalid-${segment}`, type: 'notice', tone: 'warning', text: 'This response included a visual that could not be validated. Its original data is preserved, but the visual is unavailable.' });
    }
    cursor = match.index! + match[0].length;
  }
  const tail = source.slice(cursor);
  appendText(stripXrogaUiProtocol(tail));
  if (/```xroga-ui\b/i.test(tail)) {
    rejected = true;
    blocks.push({ schemaVersion: 1, id: `${safeIdPart(documentId)}-incomplete`, type: 'notice', tone: 'warning', text: 'The visual data was incomplete. The original response is preserved, but this visual is unavailable.' });
  }
  if (!responseSource && !blocks.some(b => b.type !== 'narrative')) return { content: source.trim() };
  // Match the renderer's bounded document contract. Overflow remains intact as
  // original text rather than silently losing the remainder of an answer.
  if (blocks.length > 100) return { content: source };
  // Block IDs are local presentation identifiers, never action authority. Assign
  // stable unique IDs so repeated model IDs cannot collide during reconciliation.
  blocks.forEach((block, index) => { block.id = `${safeIdPart(documentId)}-block-${index + 1}`; });
  const narrative = compactWhitespace(blocks.flatMap(b => b.type === 'narrative' ? [b.text] : []).join('\n\n'));
  return {
    content: narrative,
    output: {
      schemaVersion: 1,
      id: `response-${safeIdPart(documentId)}`,
      status: rejected ? 'partial' : 'completed',
      sourceText: source,
      ...(responseSource ? { responseSource } : {}),
      composition: 'source-order',
      blocks,
    },
  };
}
