import { readWorkspaceHistory, selectWorkspaceHistory, type WorkspaceHistoryTurn } from '../workspaceConversation.js';

export const SEMANTIC_HISTORY_MAX_ITEMS = 12;
export const SEMANTIC_HISTORY_MAX_ITEM_CHARS = 2_000;
export const SEMANTIC_HISTORY_MAX_TOTAL_CHARS = 16_000;

const formatTurn = ({ role, content }: WorkspaceHistoryTurn) => `${role}: ${content}`;

export function semanticHistory(value: unknown): string[] {
  return readWorkspaceHistory(value).map(formatTurn);
}

function semanticHistoryTurns(history: readonly string[]): WorkspaceHistoryTurn[] {
  return history.map((line) => {
    const prefix = /^(user|assistant): /.exec(line);
    return { role: prefix?.[1] === 'assistant' ? 'assistant' : 'user', content: prefix ? line.slice(prefix[0].length) : line };
  });
}

export function semanticHistoryForPlanner(history: readonly string[], capacity: number) {
  const selected = selectWorkspaceHistory(semanticHistoryTurns(history), capacity, turn =>
    Math.ceil(Buffer.byteLength(JSON.stringify(formatTurn(turn)), 'utf8') / 3) + 1,
  );
  return { entries: selected.history.map(formatTurn), omitted: selected.omitted };
}

export function semanticHistorySnapshot(history: readonly string[]): string[] {
  return boundedSemanticHistory(semanticHistoryTurns(history));
}

/**
 * Keep the signed plan's handoff snapshot bounded independently of the history
 * the planner receives from the current Workspace request.
 */
export function boundedSemanticHistory(value: unknown): string[] {
  const recent = readWorkspaceHistory(value).slice(-SEMANTIC_HISTORY_MAX_ITEMS);
  const selected: string[] = [];
  let remaining = SEMANTIC_HISTORY_MAX_TOTAL_CHARS;
  for (let index = recent.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const item = recent[index]!;
    const prefix = `${item.role}: `;
    const available = Math.min(SEMANTIC_HISTORY_MAX_ITEM_CHARS, Math.max(0, remaining - prefix.length));
    if (!available) break;
    const content = item.content.slice(0, available);
    selected.unshift(`${prefix}${content}`);
    remaining -= prefix.length + content.length;
  }
  return selected;
}
