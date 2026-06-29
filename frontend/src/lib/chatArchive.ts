import type { ChatMessage } from '@/context/TerminalChatContext';

const KEY = 'xroga_chat_archive';

export interface ChatArchiveEntry {
  id: string;
  title: string;
  prompt: string;
  preview: string;
  messages: ChatMessage[];
  userMessageId: string;
  assistantMessageId?: string;
  createdAt: string;
}

export function loadChatArchive(): ChatArchiveEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatArchiveEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(entries: ChatArchiveEntry[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(entries.slice(0, 200)));
}

export function archiveChatTurn(opts: {
  prompt: string;
  messages: ChatMessage[];
  userMessageId: string;
  assistantMessageId?: string;
}) {
  const preview =
    opts.messages
      .filter((m) => m.role === 'assistant')
      .map((m) => m.content)
      .join(' ')
      .slice(0, 160) || opts.prompt.slice(0, 160);

  const entry: ChatArchiveEntry = {
    id: `chat-${opts.userMessageId}`,
    title: opts.prompt.slice(0, 48) || 'Chat',
    prompt: opts.prompt,
    preview,
    messages: opts.messages,
    userMessageId: opts.userMessageId,
    assistantMessageId: opts.assistantMessageId,
    createdAt: new Date().toISOString(),
  };

  const existing = loadChatArchive().filter((e) => e.id !== entry.id);
  save([entry, ...existing]);
  return entry;
}

export function removeChatArchiveEntry(id: string) {
  save(loadChatArchive().filter((e) => e.id !== id));
}
