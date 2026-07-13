'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { History } from 'lucide-react';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { getSelectedRepoContext } from '@/lib/repoContext';
import { loadTerminalHistory, type TerminalHistoryEntry } from '@/lib/terminalHistory';
import { loadTerminalHistoryEntry } from '@/lib/terminalSessionStorage';
import { GITHUB_PROJECT_SAVED_EVENT, GITHUB_REPO_CONTEXT_EVENT } from '@/lib/githubProjectEvents';
import { cn } from '@/lib/utils';

export function RepoSessionRail() {
  const router = useRouter();
  const { restoreTerminalSession } = useTerminalChat();
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [entries, setEntries] = useState<TerminalHistoryEntry[]>([]);

  useEffect(() => {
    const refresh = () => {
      setSelectedRepo(getSelectedRepoContext()?.repo ?? null);
      setEntries(loadTerminalHistory());
    };
    refresh();
    window.addEventListener(GITHUB_REPO_CONTEXT_EVENT, refresh);
    window.addEventListener(GITHUB_PROJECT_SAVED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(GITHUB_REPO_CONTEXT_EVENT, refresh);
      window.removeEventListener(GITHUB_PROJECT_SAVED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const repoEntries = useMemo(() => {
    const filtered = selectedRepo
      ? entries.filter((entry) => entry.githubRepoName === selectedRepo)
      : entries.filter((entry) => entry.githubRepoName);
    return filtered.slice(0, 8);
  }, [entries, selectedRepo]);

  async function openEntry(entry: TerminalHistoryEntry) {
    const full = await loadTerminalHistoryEntry(entry.id);
    const resolved = full ?? entry;
    if (!resolved.messages?.length) return;
    await restoreTerminalSession({
      sessionId: resolved.id,
      prompt: resolved.prompt,
      messages: resolved.messages,
      selectedId: resolved.id,
      selectedLabel: resolved.title,
      source: 'projects',
      jumpMessageId: resolved.messages[resolved.messages.length - 1]?.id,
    });
    router.push('/workspace');
  }

  if (repoEntries.length === 0) return null;

  return (
    <div className="hidden lg:flex flex-col items-center gap-3 pt-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--card-border)] bg-[var(--card)]/80 text-[var(--muted)]">
        <History className="h-3.5 w-3.5" />
      </div>
      <div className="flex flex-col items-center gap-3">
        {repoEntries.map((entry, idx) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => void openEntry(entry)}
            title={entry.title}
            aria-label={`Open ${entry.title}`}
            className={cn(
              'h-1.5 rounded-full transition-all hover:bg-[var(--accent)]',
              idx === 0
                ? 'w-7 bg-[var(--accent)]'
                : 'w-4 bg-[var(--muted)]/45 hover:w-7'
            )}
          />
        ))}
      </div>
    </div>
  );
}
