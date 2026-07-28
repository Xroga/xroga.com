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
  limit = 10,
): CompletedChatHistoryTurn[] {
  const completed: CompletedChatHistoryTurn[] = [];
  let pendingUser: CompletedChatHistoryTurn | null = null;

  for (const message of messages) {
    const content = message.content?.trim();
    if (!content) continue;
    if (message.role === 'user') {
      pendingUser = { role: 'user', content };
      continue;
    }
    if (message.role === 'assistant' && pendingUser) {
      completed.push(pendingUser, { role: 'assistant', content });
      pendingUser = null;
    }
  }

  return completed.slice(-Math.max(0, limit));
}
