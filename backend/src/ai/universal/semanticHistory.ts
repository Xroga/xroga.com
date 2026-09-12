export const SEMANTIC_HISTORY_MAX_ITEMS = 12;
export const SEMANTIC_HISTORY_MAX_ITEM_CHARS = 2_000;
export const SEMANTIC_HISTORY_MAX_TOTAL_CHARS = 16_000;

/**
 * Keep recent conversational intent without resending whole research reports,
 * source excerpts, or build artifacts to the semantic planner on every turn.
 */
export function boundedSemanticHistory(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const recent = value.slice(-SEMANTIC_HISTORY_MAX_ITEMS) as Array<{ role?: unknown; content?: unknown }>;
  const selected: string[] = [];
  let remaining = SEMANTIC_HISTORY_MAX_TOTAL_CHARS;
  for (let index = recent.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const item = recent[index]!;
    const role = item.role === 'assistant' ? 'assistant' : 'user';
    const prefix = `${role}: `;
    const available = Math.min(SEMANTIC_HISTORY_MAX_ITEM_CHARS, Math.max(0, remaining - prefix.length));
    if (!available) break;
    const content = String(item.content ?? '').slice(0, available);
    selected.unshift(`${prefix}${content}`);
    remaining -= prefix.length + content.length;
  }
  return selected;
}
