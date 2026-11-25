export interface ChatHistoryMessage {
  role: string;
  content?: string;
}

export interface CompletedChatHistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Return only completed user/assistant pairs for model context.
 * The current prompt is sent separately, and interrupted user-only turns must
 * not be replayed into the next answer.
 */
export function buildCompletedChatHistory(
  messages: ChatHistoryMessage[],
  limit?: number,
): CompletedChatHistoryTurn[] {
  const completed: CompletedChatHistoryTurn[] = [];
  let pendingUser: CompletedChatHistoryTurn | null = null;

  for (const message of messages) {
    const content = message.content;
    if (!content?.trim()) continue;
    if (message.role === 'user') {
      pendingUser = { role: 'user', content };
      continue;
    }
    if (message.role === 'assistant' && pendingUser) {
      completed.push(pendingUser, { role: 'assistant', content });
      pendingUser = null;
    }
  }

  if (limit === undefined) return completed;
  const pairedLimit = Math.max(0, Math.floor(limit / 2) * 2);
  return pairedLimit ? completed.slice(-pairedLimit) : [];
}

// The Phase 1 API and its hosted Workspace bridge both admit 10 MiB of JSON.
const MAX_WORKSPACE_REQUEST_BYTES = 10 * 1024 * 1024;
const historyOmission: CompletedChatHistoryTurn = {
  role: 'assistant',
  content: 'Earlier conversation turns were omitted to fit this request. Ask for any missing details you need.',
};

/** Fit only the transmitted history to the JSON transport. Stored messages and
 * the current request stay unchanged. Size counts escaped JSON in UTF-8. */
export function serializeWorkspaceRequest(body: Record<string, unknown>): string {
  const original = JSON.stringify(body);
  const history = body.history;
  if (!Array.isArray(history) || !history.length) return original;
  const encoder = new TextEncoder();
  const size = (json: string) => encoder.encode(json).byteLength;
  if (size(original) <= MAX_WORKSPACE_REQUEST_BYTES) return original;

  const withNotice = JSON.stringify({ ...body, history: [historyOmission] });
  let remaining = MAX_WORKSPACE_REQUEST_BYTES - size(withNotice);
  if (remaining < 0) {
    // The current payload cannot make room for the notice. Let the server
    // handle any remaining over-limit request without truncating the prompt.
    return JSON.stringify({ ...body, history: [] });
  }

  const complete = buildCompletedChatHistory(history);
  const selected: CompletedChatHistoryTurn[] = [];
  for (let index = complete.length - 2; index >= 0; index -= 2) {
    const user = complete[index];
    const assistant = complete[index + 1];
    // Add both messages and their commas to the existing notice array.
    // JSON.stringify includes two brackets, while only one extra comma is needed.
    const bytes = size(JSON.stringify([user, assistant])) - 1;
    if (bytes > remaining) continue;
    selected.push(assistant, user);
    remaining -= bytes;
  }
  return JSON.stringify({ ...body, history: [historyOmission, ...selected.reverse()] });
}
