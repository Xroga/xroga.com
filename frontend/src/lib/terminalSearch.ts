import type { ChatMessage } from '@/context/TerminalChatContext';

export interface TerminalSearchEntry {
  id: string;
  messageId: string;
  title: string;
  preview: string;
  role: ChatMessage['role'];
  createdAt: number;
  agent?: string;
}

function titleForMessage(msg: ChatMessage): string {
  const text = msg.content.trim().replace(/\s+/g, ' ');
  if (!text) return msg.role === 'user' ? 'Your command' : 'Empty message';
  if (msg.role === 'user') {
    const line = text.split('\n')[0];
    return line.length > 72 ? `${line.slice(0, 72)}…` : line;
  }
  if (msg.role === 'system') {
    const agent = msg.agent?.replace(/_/g, ' ') ?? 'System';
    return `[${agent}] ${text.slice(0, 48)}${text.length > 48 ? '…' : ''}`;
  }
  return text.length > 72 ? `${text.slice(0, 72)}…` : text;
}

export function buildTerminalSearchEntries(messages: ChatMessage[]): TerminalSearchEntry[] {
  const base = Date.now() - messages.length * 60_000;
  return messages
    .filter((m) => m.content.trim().length > 0 || m.role === 'system')
    .map((msg, idx) => ({
      id: `search-${msg.id}`,
      messageId: msg.id,
      title: titleForMessage(msg),
      preview: msg.content.trim().slice(0, 120),
      role: msg.role,
      createdAt: msg.createdAt ?? base + idx * 60_000,
      agent: msg.agent,
    }))
    .reverse();
}

export function filterTerminalSearchEntries(entries: TerminalSearchEntry[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter(
    (e) =>
      e.title.toLowerCase().includes(q) ||
      e.preview.toLowerCase().includes(q) ||
      e.role.includes(q) ||
      (e.agent?.toLowerCase().includes(q) ?? false)
  );
}

export function formatTerminalSearchTime(ts: number) {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
