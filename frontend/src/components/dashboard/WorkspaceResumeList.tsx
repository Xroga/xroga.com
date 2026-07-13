'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { FolderGit2, History, Play } from 'lucide-react';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { getSelectedRepoContext, saveSelectedRepoContext } from '@/lib/repoContext';
import { loadTerminalHistory, type TerminalHistoryEntry } from '@/lib/terminalHistory';
import { loadTerminalHistoryEntry } from '@/lib/terminalSessionStorage';
import { GITHUB_PROJECT_SAVED_EVENT, GITHUB_REPO_CONTEXT_EVENT, notifyGithubRepoContext } from '@/lib/githubProjectEvents';
import { formatSafeDistance } from '@/lib/safeDates';
import { cn } from '@/lib/utils';

function oneLine(text: string, max = 88): string {
  const line = text.replace(/\s+/g, ' ').trim();
  if (line.length <= max) return line;
  return `${line.slice(0, max - 1)}…`;
}

export function WorkspaceResumeList({ className }: { className?: string }) {
  const { messages, restoreTerminalSession } = useTerminalChat();
  const [entries, setEntries] = useState<TerminalHistoryEntry[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setSelectedRepo(getSelectedRepoContext()?.repo ?? null);
    setEntries(loadTerminalHistory().filter((e) => e.messageCount > 0));
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(GITHUB_REPO_CONTEXT_EVENT, refresh);
    window.addEventListener(GITHUB_PROJECT_SAVED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    window.addEventListener('xroga-resume-workspace', refresh);
    return () => {
      window.removeEventListener(GITHUB_REPO_CONTEXT_EVENT, refresh);
      window.removeEventListener(GITHUB_PROJECT_SAVED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('xroga-resume-workspace', refresh);
    };
  }, [refresh]);

  const visible = useMemo(() => {
    const scoped = selectedRepo
      ? entries.filter((e) => e.githubRepoName === selectedRepo)
      : entries;
    return scoped.slice(0, 8);
  }, [entries, selectedRepo]);

  async function resume(entry: TerminalHistoryEntry) {
    const full = await loadTerminalHistoryEntry(entry.id);
    const resolved = full ?? entry;
    if (!resolved.messages?.length) return;

    if (resolved.githubRepoName?.includes('/')) {
      saveSelectedRepoContext({ repo: resolved.githubRepoName, branch: 'main' });
      notifyGithubRepoContext(resolved.githubRepoName, 'main');
    }

    await restoreTerminalSession({
      sessionId: resolved.id,
      prompt: resolved.prompt,
      messages: resolved.messages,
      selectedId: resolved.id,
      selectedLabel: resolved.title,
      source: 'projects',
      jumpMessageId: resolved.messages[resolved.messages.length - 1]?.id,
    });
  }

  if (messages.length > 0 || visible.length === 0) return null;

  return (
    <div className={cn('xv-workspace-resume mt-4 pt-3 border-t border-[var(--card-border)]/50', className)}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <History className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
            Continue where you left off
          </span>
        </div>
        <Link
          href="/dashboard/projects?tab=conversations"
          className="text-[10px] font-semibold text-[var(--accent)] hover:underline shrink-0"
        >
          View all
        </Link>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {visible.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => void resume(entry)}
            className="group min-w-[min(100%,240px)] max-w-[280px] shrink-0 rounded-xl border border-[var(--card-border)]/70 bg-[var(--card)]/35 px-3 py-2.5 text-left transition-all hover:border-[var(--accent)]/45 hover:bg-[var(--accent)]/8"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-[11px] font-semibold text-[var(--foreground)] line-clamp-1 group-hover:text-[var(--accent)]">
                {entry.title}
              </p>
              <Play className="h-3 w-3 shrink-0 text-[var(--accent)] opacity-70 group-hover:opacity-100" />
            </div>
            <p className="mt-1 text-[10px] text-[var(--muted)] line-clamp-2 leading-snug">
              {oneLine(entry.preview || entry.prompt)}
            </p>
            <div className="mt-2 flex items-center justify-between gap-2 text-[9px] text-[var(--muted)]">
              {entry.githubRepoName ? (
                <span className="inline-flex items-center gap-1 font-mono text-[var(--accent)]/90 truncate">
                  <FolderGit2 className="h-3 w-3 shrink-0" />
                  {entry.githubRepoName}
                </span>
              ) : (
                <span>Saved workspace</span>
              )}
              <span className="shrink-0">{formatSafeDistance(entry.updatedAt)}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
