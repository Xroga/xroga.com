'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FolderGit2, GitBranch, History } from 'lucide-react';
import { useTerminalChat } from '@/context/TerminalChatContext';
import {
  loadTerminalHistory,
  type TerminalHistoryEntry,
  type TerminalHistoryStatus,
} from '@/lib/terminalHistory';
import { loadTerminalHistoryEntry } from '@/lib/terminalSessionStorage';
import { getSelectedRepoContext, saveSelectedRepoContext } from '@/lib/repoContext';
import {
  GITHUB_PROJECT_SAVED_EVENT,
  GITHUB_REPO_CONTEXT_EVENT,
  notifyGithubRepoContext,
} from '@/lib/githubProjectEvents';
import { formatSafeDistance } from '@/lib/safeDates';
import { cn } from '@/lib/utils';

function oneLine(text: string, max = 42): string {
  const line = text.replace(/\s+/g, ' ').trim();
  if (line.length <= max) return line;
  return `${line.slice(0, max - 1)}…`;
}

function statusLabel(status?: TerminalHistoryStatus): { label: string; tone: string } {
  if (status === 'stopped') return { label: 'Open', tone: 'bg-emerald-600 text-white' };
  if (status === 'complete') return { label: 'Merged', tone: 'bg-violet-500/80 text-white' };
  return { label: 'Open', tone: 'bg-[var(--muted)]/30 text-[var(--foreground)]' };
}

/** Cursor-style project/agent history in the sidebar — Open resumes where user left off. */
export function SidebarProjectHistory({ expanded }: { expanded: boolean }) {
  const router = useRouter();
  const { restoreTerminalSession, startNewChat } = useTerminalChat();
  const [entries, setEntries] = useState<TerminalHistoryEntry[]>([]);

  const refresh = useCallback(() => {
    setEntries(
      loadTerminalHistory()
        .filter((e) => e.messageCount > 0)
        .slice(0, 24)
    );
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

  const grouped = useMemo(() => {
    const map = new Map<string, TerminalHistoryEntry[]>();
    for (const e of entries) {
      const key = e.githubRepoName?.includes('/') ? e.githubRepoName : 'Recent';
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return Array.from(map.entries()).slice(0, 6);
  }, [entries]);

  async function openEntry(entry: TerminalHistoryEntry) {
    const full = await loadTerminalHistoryEntry(entry.id);
    const resolved = full ?? entry;
    if (!resolved.messages?.length) return;

    if (resolved.githubRepoName?.includes('/')) {
      saveSelectedRepoContext({ repo: resolved.githubRepoName, branch: 'main' });
      notifyGithubRepoContext(resolved.githubRepoName, 'main');
    }

    startNewChat();
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

  if (!expanded || grouped.length === 0) return null;

  const selected = getSelectedRepoContext()?.repo;

  return (
    <div className="mt-2 mb-1 px-1.5">
      <div className="flex items-center gap-1.5 px-1.5 mb-1.5">
        <History className="h-3 w-3 text-[var(--accent)]" />
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
          Projects
        </span>
      </div>
      <div className="space-y-2 max-h-[220px] overflow-y-auto pr-0.5 scrollbar-thin">
        {grouped.map(([folder, items]) => (
          <div key={folder} className="space-y-0.5">
            <div className="flex items-center gap-1 px-1.5 text-[10px] text-[var(--muted)] truncate">
              <FolderGit2 className="h-3 w-3 shrink-0" />
              <span className="truncate">{folder}</span>
            </div>
            {items.slice(0, 4).map((entry) => {
              const st = statusLabel(entry.status);
              const isSelected = selected && entry.githubRepoName === selected;
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => void openEntry(entry)}
                  className={cn(
                    'w-full text-left rounded-lg px-2 py-1.5 transition-colors',
                    'hover:bg-[var(--accent)]/10',
                    isSelected && 'bg-[var(--accent)]/12'
                  )}
                >
                  <div className="flex items-start justify-between gap-1">
                    <p className="text-[11px] font-medium text-[var(--foreground)] truncate leading-snug">
                      {oneLine(entry.title, 36)}
                    </p>
                    <span className="text-[9px] text-[var(--muted)] shrink-0 tabular-nums">
                      {formatSafeDistance(entry.updatedAt)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span
                      className={cn(
                        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold',
                        st.tone
                      )}
                    >
                      <GitBranch className="h-2.5 w-2.5" />
                      {st.label}
                    </span>
                    {entry.status === 'stopped' && (
                      <span className="text-[9px] text-amber-600 dark:text-amber-400">Retry later</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
