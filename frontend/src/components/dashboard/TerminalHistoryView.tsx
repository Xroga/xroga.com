'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  History,
  MessageSquare,
  Code2,
  Briefcase,
  ExternalLink,
  Trash2,
  Search,
} from 'lucide-react';
import {
  loadTerminalHistory,
  removeTerminalHistoryEntry,
  type TerminalHistoryEntry,
} from '@/lib/terminalHistory';
import { loadChatArchive, type ChatArchiveEntry } from '@/lib/chatArchive';
import { formatSafeDistance } from '@/lib/safeDates';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

const KIND_META = {
  chat: { label: 'Chat', icon: MessageSquare, color: 'text-blue-400 bg-blue-500/10' },
  code: { label: 'Code Project', icon: Code2, color: 'text-emerald-400 bg-emerald-500/10' },
  business: { label: 'Business', icon: Briefcase, color: 'text-violet-400 bg-violet-500/10' },
  mixed: { label: 'Code & Chat', icon: Code2, color: 'text-cyan-400 bg-cyan-500/10' },
};

function HistoryCard({
  entry,
  onOpen,
  onDelete,
}: {
  entry: TerminalHistoryEntry;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const meta = KIND_META[entry.kind] ?? KIND_META.chat;
  const Icon = meta.icon;
  const isProject = entry.kind === 'code' && (entry.githubRepoUrl || entry.deployUrl);

  return (
    <article
      className={cn(
        'group relative flex flex-col rounded-2xl border overflow-hidden transition-all hover:border-[var(--accent)]/40 hover:shadow-lg',
        isProject
          ? 'border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 via-transparent to-[var(--card)]'
          : 'border-[var(--card-border)] glass-panel'
      )}
    >
      {isProject && (
        <div className="h-24 bg-gradient-to-br from-[var(--accent)]/20 via-violet-500/10 to-transparent relative overflow-hidden">
          <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_30%_20%,rgba(0,106,255,0.4),transparent_50%)]" />
          <div className="absolute bottom-2 left-3 right-3 flex items-center gap-2">
            <Code2 className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-semibold truncate">{entry.githubRepoName ?? 'Live Project'}</span>
          </div>
        </div>
      )}

      <div className="p-4 flex flex-col flex-1 gap-2">
        <div className="flex items-start justify-between gap-2">
          <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold', meta.color)}>
            <Icon className="w-3 h-3" />
            {meta.label}
          </span>
          <span className="text-[10px] text-[var(--muted)] shrink-0">
            {formatSafeDistance(entry.updatedAt)}
          </span>
        </div>

        <button type="button" onClick={onOpen} className="text-left flex-1">
          <h3 className="font-semibold text-sm line-clamp-2 group-hover:text-[var(--accent)] transition-colors">
            {entry.title}
          </h3>
          <p className="text-xs text-[var(--muted)] mt-1 line-clamp-2">{entry.preview}</p>
        </button>

        <div className="flex flex-wrap items-center gap-2 text-[10px] text-[var(--muted)]">
          <span>{entry.messageCount} messages</span>
          {entry.githubRepoUrl && (
            <a
              href={entry.githubRepoUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-0.5 text-emerald-400 hover:underline"
            >
              {entry.githubRepoName ?? 'Repo'}
            </a>
          )}
          {entry.deployUrl && (
            <a
              href={entry.deployUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-0.5 text-[var(--accent)] hover:underline"
            >
              <ExternalLink className="w-3 h-3" />
              Live
            </a>
          )}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onOpen}
            className="flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--accent)]/15 text-[var(--accent)] hover:bg-[var(--accent)]/25 transition-colors"
          >
            Open in terminal
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-1.5 rounded-lg text-[var(--muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
            aria-label="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </article>
  );
}

export function TerminalHistoryView() {
  const [entries, setEntries] = useState<TerminalHistoryEntry[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | TerminalHistoryEntry['kind']>('all');
  const router = useRouter();
  const { restoreTerminalSession } = useTerminalChat();

  const reload = useCallback(() => {
    const history = loadTerminalHistory();
    const archive = loadChatArchive();
    const archiveAsHistory: TerminalHistoryEntry[] = archive
      .filter((a) => a.messages?.length)
      .filter((a) => !history.some((h) => h.id === a.id))
      .map((a: ChatArchiveEntry) => ({
        id: a.id,
        title: a.title,
        preview: a.preview,
        prompt: a.prompt,
        messages: a.messages,
        kind: 'chat' as const,
        messageCount: a.messages.length,
        createdAt: a.createdAt,
        updatedAt: a.createdAt,
      }));
    setEntries([...history, ...archiveAsHistory].sort(
      (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
    ));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (filter !== 'all' && e.kind !== filter) return false;
      if (!q) return true;
      return (
        e.title.toLowerCase().includes(q) ||
        e.preview.toLowerCase().includes(q) ||
        e.githubRepoName?.toLowerCase().includes(q)
      );
    });
  }, [entries, query, filter]);

  async function openEntry(entry: TerminalHistoryEntry) {
    const { loadTerminalHistoryEntry } = await import('@/lib/terminalSessionStorage');
    const full = await loadTerminalHistoryEntry(entry.id);
    const resolved = full ?? entry;
    if (!resolved.messages?.length) {
      toast.error('This session has no saved messages to restore.');
      return;
    }
    await restoreTerminalSession({
      sessionId: resolved.id,
      prompt: resolved.prompt,
      messages: resolved.messages,
      selectedId: resolved.id,
      selectedLabel: resolved.title,
      source: 'dashboard',
      jumpMessageId: resolved.messages[resolved.messages.length - 1]?.id,
    });
    router.push('/workspace');
  }

  function deleteEntry(id: string) {
    removeTerminalHistoryEntry(id);
    reload();
    toast.success('Removed from history');
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 universe-fade-in">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <History className="w-7 h-7 text-[var(--accent)]" />
          Terminal History
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          All your saved chats, code projects, and business conversations. Click any session to restore it in the workspace terminal.
        </p>
      </header>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
          <input
            type="search"
            placeholder="Search history…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-white/5 border border-[var(--card-border)] text-sm focus:outline-none focus:border-[var(--accent)]/50"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(['all', 'chat', 'code', 'business', 'mixed'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors',
                filter === f
                  ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
                  : 'text-[var(--muted)] hover:bg-white/5'
              )}
            >
              {f === 'all' ? 'All' : f}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="glass-panel rounded-2xl p-12 text-center border border-dashed border-[var(--card-border)]">
          <History className="w-10 h-10 mx-auto text-[var(--muted)] mb-3" />
          <p className="font-medium">No terminal history yet</p>
          <p className="text-sm text-[var(--muted)] mt-1">
            Start a conversation in Workspace — every chat and project is saved automatically.
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((entry) => (
            <HistoryCard
              key={entry.id}
              entry={entry}
              onOpen={() => openEntry(entry)}
              onDelete={() => deleteEntry(entry.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
