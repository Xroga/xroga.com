// What a conversation has already done, as a short list built from its stored tool calls and their results. A run that continues
// earlier work (after Stop, a lost connection, a closed laptop or a restart) is shown this list first, so it carries on after the last
// step instead of starting over, even when the older messages have been shortened or compacted.
import type { Entry } from '@src/store/types';

/** Calls that change the page or the tabs: the ones whose completion matters for where to continue. */
const CHANGING = new Set(['navigate', 'tabs', 'click', 'set', 'type', 'press', 'fill_form', 'upload', 'drag', 'scroll', 'handle_dialog', 'save_file']);

const firstLine = (text: string, limit = 120) => text.split('\n')[0].replace(/\s+/g, ' ').trim().slice(0, limit);

/** Up to `limit` of the newest page-changing steps, oldest first, one line each; an empty string when there are none. */
export function progressLedger(branch: Entry[], limit = 20): string {
  const calls = new Map<string, { tool: string; intent?: string }>();
  const lines: string[] = [];
  for (const entry of branch) {
    if (entry.type !== 'message') continue;
    for (const part of entry.message.parts) {
      if (part.type === 'tool-call') {
        const input = (part.input ?? {}) as { intent?: unknown };
        calls.set(part.toolCallId, { tool: part.toolName, intent: typeof input.intent === 'string' ? input.intent : undefined });
      } else if (part.type === 'tool-result' && CHANGING.has(part.toolName)) {
        const call = calls.get(part.toolCallId);
        const what = call?.intent?.trim() || firstLine(part.text, 90) || part.toolName;
        lines.push(`${part.isError ? 'failed' : 'done'} · ${part.toolName}: ${what.slice(0, 110)}`);
      }
    }
  }
  if (!lines.length) return '';
  const shown = lines.slice(-limit);
  const omitted = lines.length - shown.length;
  return [
    `Steps already taken in this conversation (${lines.length}${omitted ? `, the newest ${shown.length} listed` : ''}); do not repeat the ones marked done:`,
    ...shown.map((line, i) => `${omitted + i + 1}. ${line}`),
  ].join('\n');
}
