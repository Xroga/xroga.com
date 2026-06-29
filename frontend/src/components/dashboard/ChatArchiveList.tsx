'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare } from 'lucide-react';
import { UiverseTableCard } from '@/components/ui/UiverseTableCard';
import { SectionRowActions, copyText } from '@/components/ui/SectionRowActions';
import { getItemMeta, markItemSeen, splitDateParts, recentlyLabel } from '@/lib/itemMeta';
import { loadChatArchive, removeChatArchiveEntry, type ChatArchiveEntry } from '@/lib/chatArchive';
import { resumeToDashboard } from '@/lib/workspacePersistence';
import { useTerminalChat } from '@/context/TerminalChatContext';
import toast from 'react-hot-toast';

function localChatRows(entry: ChatArchiveEntry) {
  const created = splitDateParts(entry.createdAt);
  const meta = getItemMeta(entry.id);
  return [
    { left: 'prompt', right: entry.title.slice(0, 32) },
    { left: 'type', right: 'chat' },
    { left: 'date', right: created.date },
    { left: 'time', right: created.time },
    { left: 'year', right: created.year },
    { left: 'recently seen', right: recentlyLabel(meta.seenAt) },
  ];
}

export function ChatArchiveList({ search = '' }: { search?: string }) {
  const [entries, setEntries] = useState<ChatArchiveEntry[]>(() => loadChatArchive());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const router = useRouter();
  const { setPrompt } = useTerminalChat();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.prompt.toLowerCase().includes(q) ||
        e.preview.toLowerCase().includes(q)
    );
  }, [entries, search]);

  function openEntry(entry: ChatArchiveEntry) {
    markItemSeen(entry.id);
    setSelectedId(entry.id);
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

  if (entries.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold flex items-center gap-2 px-1">
        <MessageSquare className="w-4 h-4 text-[var(--accent)]" />
        Saved from this device
      </h2>
      <div className="grid sm:grid-cols-2 gap-4 p-4 pt-0">
        {filtered.map((entry) => (
          <div key={entry.id} className="space-y-2">
            <UiverseTableCard
              title={entry.title.slice(0, 36) || 'chat'}
              rows={localChatRows(entry)}
              selected={selectedId === entry.id}
              onClick={() => openEntry(entry)}
            />
            <SectionRowActions
              onCopy={() => void copyText(entry.prompt, 'Prompt copied')}
              onEdit={() => openEntry(entry)}
              onDelete={() => {
                removeChatArchiveEntry(entry.id);
                setEntries(loadChatArchive());
                toast.success('Removed from list');
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
