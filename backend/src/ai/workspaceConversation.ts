import { resolveModelSpec, type ModelId } from './models.js';
import { estimateTokens, type ChatMessage } from './openaiCompat.js';
import { containsCredentialSecretText } from '../security/egress/dataClassification.js';

export type WorkspaceHistoryTurn = { role: 'user' | 'assistant'; content: string };

export function readWorkspaceHistory(value: unknown): WorkspaceHistoryTurn[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): WorkspaceHistoryTurn[] => {
    if (!item || typeof item !== 'object') return [];
    const { role, content } = item as { role?: unknown; content?: unknown };
    return (role === 'user' || role === 'assistant') && typeof content === 'string' && content.trim()
      ? [{ role, content }] : [];
  });
}

const omittedHistoryNotice = 'Some earlier conversation turns are unavailable. If you need a missing task detail, ask for it rather than guessing. Never ask for credentials.';

function textEstimate(text: string): number {
  // The four-character estimator undercounts some non-ASCII and dense input.
  // An estimate based on UTF-8 size allows for these while still leaving the
  // provider as the authority for the actual token count.
  return Math.max(estimateTokens(text), Math.ceil(Buffer.byteLength(text, 'utf8') / 3));
}

function messageEstimate({ content }: ChatMessage): number {
  const body = typeof content === 'string' ? textEstimate(content)
    : content.reduce((sum, part) => sum + (part.type === 'text' ? textEstimate(part.text) : 1200), 0);
  return body + 4;
}

export function workspaceHistoryCapacity(
  modelId: ModelId,
  maximumOutputTokens: number,
  fixedMessages: readonly ChatMessage[],
): number {
  const contextWindow = resolveModelSpec(modelId)?.contextWindow ?? 0;
  return Math.max(0, contextWindow - maximumOutputTokens
    - fixedMessages.reduce((sum, message) => sum + messageEstimate(message), 0)
    - textEstimate(omittedHistoryNotice) - 4);
}

export function selectWorkspaceHistory(
  history: readonly WorkspaceHistoryTurn[],
  capacity: number,
  measure: (turn: WorkspaceHistoryTurn) => number = messageEstimate,
): { history: WorkspaceHistoryTurn[]; omitted: number } {
  const groups: WorkspaceHistoryTurn[][] = [];
  for (const turn of history) {
    const last = groups.at(-1);
    if (turn.role === 'assistant' && last?.[0]?.role === 'user') {
      last.push(turn);
    } else {
      groups.push([turn]);
    }
  }
  const eligible = groups.map(group => {
    const turns = group.filter(turn => !containsCredentialSecretText(turn.content));
    return { turns, size: turns.reduce((sum, turn) => sum + measure(turn), 0) };
  }).filter(group => group.turns.length);
  if (eligible.reduce((sum, group) => sum + group.size, 0) <= capacity) {
    const retained = eligible.flatMap(group => group.turns);
    return { history: retained, omitted: history.length - retained.length };
  }

  // Give the latest exchange first choice and keep the opening task when it
  // still fits. Fill in from newest to oldest, preserving complete exchanges.
  const newest = eligible.length - 1;
  const priority = [newest, 0, ...eligible.slice(1, -1).map((_, index) => newest - index - 1)];
  const selected = new Set<number>();
  for (const index of new Set(priority)) {
    const group = eligible[index];
    if (group && group.size <= capacity) {
      selected.add(index);
      capacity -= group.size;
    }
  }
  const retained = eligible.flatMap((group, index) => selected.has(index) ? group.turns : []);
  return { history: retained, omitted: history.length - retained.length };
}

export function withWorkspaceHistory(
  history: readonly WorkspaceHistoryTurn[],
  modelId: ModelId,
  maximumOutputTokens: number,
  system: string,
  userMessage: ChatMessage,
): ChatMessage[] {
  const systemMessage: ChatMessage = { role: 'system', content: system };
  const selected = selectWorkspaceHistory(history, workspaceHistoryCapacity(modelId, maximumOutputTokens, [systemMessage, userMessage]));
  if (selected.omitted) systemMessage.content += '\n\n' + omittedHistoryNotice;
  return [systemMessage, ...selected.history, userMessage];
}
