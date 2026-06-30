import type { ChatMessage } from '@/context/TerminalChatContext';
import { messagesForStorage, safeStorageSet } from '@/lib/storageSafe';

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
  const slim = entries.slice(0, 200).map((e) => ({
    ...e,
    messages: messagesForStorage(e.messages),
  }));
  safeStorageSet(localStorage, KEY, JSON.stringify(slim));
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

export function findChatArchiveByMessageId(messageId: string): ChatArchiveEntry | undefined {
  return loadChatArchive().find(
    (e) => e.userMessageId === messageId || e.assistantMessageId === messageId,
  );
}

/** Chats section: conversations, reports, documents — not image/video/build projects. */
export function isChatSectionArchive(prompt: string): boolean {
  const p = prompt.toLowerCase();
  if (/\b(generate|create|make|draw|design)\b.{0,40}\b(image|picture|photo|logo|icon|thumbnail|poster|banner)\b/i.test(prompt)) {
    return false;
  }
  if (/\b(video|clip|animation|movie|film|reel)\b/i.test(p) && /\b(generate|create|make|produce|render)\b/i.test(p)) {
    return false;
  }
  if (/\b(website|web app|landing page|saas|store|shop|game|software|mobile app)\b/i.test(p) && /\b(build|create|make|generate|deploy)\b/i.test(p)) {
    return false;
  }
  return true;
}
