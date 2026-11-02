import { adaptResponseV2, validateResponseDocumentV2, type ResponseInputV2, type ResponseDocumentV2 } from './document';

export const RICH_SHARE_PREFIX = 'XROGA_RESPONSE_V2\n';
const SHARE_LIMIT = 100_000;

/** A snapshot of already received, read-only presentation data. No auth context,
 * action handlers, provider receipts or another model request are serialized. */
export function richShareSnapshot(input: ResponseInputV2, text: string): string | undefined {
  const result = adaptResponseV2(input, false);
  if (!result.supported || !result.document.nodes.length) return undefined;
  const snapshot = RICH_SHARE_PREFIX + JSON.stringify({ version: 2, text, document: result.document });
  return snapshot.length <= SHARE_LIMIT ? snapshot : undefined;
}

export function readRichShareSnapshot(value: string): { text: string; document?: ResponseDocumentV2 } {
  if (!value.startsWith(RICH_SHARE_PREFIX) || value.length > SHARE_LIMIT) return { text: value };
  try {
    const raw = JSON.parse(value.slice(RICH_SHARE_PREFIX.length));
    if (raw?.version !== 2 || typeof raw.text !== 'string') return { text: value };
    const result = validateResponseDocumentV2(raw.document);
    return { text: raw.text, document: result.supported && !result.document.streaming ? result.document : undefined };
  } catch { return { text: value }; }
}
