'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare } from 'lucide-react';
import { SectionCompactCard } from '@/components/dashboard/SectionCompactCard';
import { loadChatArchive, removeChatArchiveEntry, type ChatArchiveEntry } from '@/lib/chatArchive';
import { resumeToDashboard } from '@/lib/workspacePersistence';
import { useTerminalChat } from '@/context/TerminalChatContext';
import toast from 'react-hot-toast';

export function ChatArchiveList({ search = '' }: { search?: string }) {
  const [entries, setEntries] = useState<ChatArchiveEntry[]>(() => loadChatArchive());
  const router = useRouter();
  const { setPrompt } = useTerminalChat();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) => e.prompt.toLowerCase().includes(q) || e.preview.toLowerCase().includes(q),
    );
  }, [entries, search]);

  function openEntry(entry: ChatArchiveEntry) {
    setPrompt(entry.prompt);
    resumeToDashboard({
      prompt: entry.prompt,
      messages: entry.messages,
      selectedId: entry.id,
      selectedLabel: entry.title,
      source: 'chats',
      jumpMessageId: entry.assistantMessageId ?? entry.userMessageId,
    });
    router.push('/dashboard');
  }

  function deleteEntry(id: string) {
    removeChatArchiveEntry(id);
    setEntries(loadChatArchive());
    toast.success('Chat removed');
  }

  if (entries.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold flex items-center gap-2 px-1">
        <MessageSquare className="w-4 h-4 text-[var(--accent)]" />
        Saved chats, reports & documents
      </h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((entry) => (
          <SectionCompactCard
            key={entry.id}
            title={entry.title}
            subtitle={entry.preview.slice(0, 64)}
            dateIso={entry.createdAt}
            onOpen={() => openEntry(entry)}
            onDelete={() => deleteEntry(entry.id)}
            openLabel="Open in terminal"
          />
        ))}
      </div>
    </div>
  );
}
