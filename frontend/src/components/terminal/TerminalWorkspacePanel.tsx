'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FolderGit2 } from 'lucide-react';
import { api, type Project } from '@/lib/api';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { getSelectedRepoContext } from '@/lib/repoContext';
import { loadTerminalHistory, type TerminalHistoryEntry } from '@/lib/terminalHistory';
import { loadTerminalHistoryEntry } from '@/lib/terminalSessionStorage';
import { GITHUB_PROJECT_SAVED_EVENT, GITHUB_REPO_CONTEXT_EVENT } from '@/lib/githubProjectEvents';
import { cn } from '@/lib/utils';

type Tab = 'projects' | 'all';

function oneLine(text: string, max = 96): string {
  const line = text.replace(/\s+/g, ' ').trim();
  if (line.length <= max) return line;
  return `${line.slice(0, max - 1)}…`;
}

export function TerminalWorkspacePanel() {
  const router = useRouter();
  const { restoreTerminalSession } = useTerminalChat();
  const [tab, setTab] = useState<Tab>('projects');
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [history, setHistory] = useState<TerminalHistoryEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  const refresh = useCallback(() => {
    setSelectedRepo(getSelectedRepoContext()?.repo ?? null);
    setHistory(loadTerminalHistory());
    void api.projects
      .listGithub()
      .then((list) => setProjects(list.filter((p) => p.github_repo_name?.includes('/'))))
      .catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(GITHUB_REPO_CONTEXT_EVENT, refresh);
    window.addEventListener(GITHUB_PROJECT_SAVED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(GITHUB_REPO_CONTEXT_EVENT, refresh);
      window.removeEventListener(GITHUB_PROJECT_SAVED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [refresh]);

  const repoHistory = useMemo(
    () =>
      selectedRepo
        ? history.filter((entry) => entry.githubRepoName === selectedRepo)
        : [],
    [history, selectedRepo]
  );

  const allHistory = useMemo(
    () => history.filter((entry) => entry.githubRepoName?.includes('/')),
    [history]
  );

  const allProjects = useMemo(
    () => projects.filter((p) => p.github_repo_name?.includes('/')),
    [projects]
  );

  async function openHistoryEntry(entry: TerminalHistoryEntry) {
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

  const emptyRepoMessage =
    'No saved workspace yet for this repository. Start a new terminal in this repo to create one.';

  return (
    <div className="mb-2 rounded-xl border border-[var(--card-border)]/70 bg-[var(--card)]/40 backdrop-blur-md overflow-hidden">
      <div className="flex items-center gap-2 px-2.5 py-2 border-b border-[var(--card-border)]/60">
        <FolderGit2 className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
        <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">Projects</span>
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-[var(--card-border)]/60 p-0.5">
          <button
            type="button"
            onClick={() => setTab('projects')}
            className={cn(
              'rounded-md px-2 py-0.5 text-[10px] font-semibold transition-colors',
              tab === 'projects'
                ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
                : 'text-[var(--muted)] hover:text-[var(--foreground)]'
            )}
          >
            Projects
          </button>
          <button
            type="button"
            onClick={() => setTab('all')}
            className={cn(
              'rounded-md px-2 py-0.5 text-[10px] font-semibold transition-colors',
              tab === 'all'
                ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
                : 'text-[var(--muted)] hover:text-[var(--foreground)]'
            )}
          >
            All
          </button>
        </div>
      </div>

      {tab === 'projects' && selectedRepo ? (
        <p className="px-2.5 pt-1.5 text-[10px] font-mono font-semibold text-[var(--accent)] truncate">
          {selectedRepo}
        </p>
      ) : null}

      <div className="max-h-[min(28vh,200px)] overflow-y-auto px-2 py-2 space-y-1 scrollbar-thin">
        {tab === 'projects' ? (
          !selectedRepo ? (
            <p className="text-[10px] text-[var(--muted)] leading-relaxed px-0.5">
              Select a GitHub repository above to view saved workspaces for that repo.
            </p>
          ) : repoHistory.length === 0 ? (
            <p className="text-[10px] text-[var(--muted)] leading-relaxed px-0.5">{emptyRepoMessage}</p>
          ) : (
            repoHistory.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => void openHistoryEntry(entry)}
                className="w-full rounded-lg border border-[var(--card-border)]/50 bg-[var(--card)]/30 px-2.5 py-2 text-left hover:border-[var(--accent)]/35 hover:bg-[var(--accent)]/8 transition-colors"
              >
                <p className="text-[11px] font-medium text-[var(--foreground)] line-clamp-1">{entry.title}</p>
                <p className="mt-0.5 text-[10px] text-[var(--muted)] line-clamp-1">
                  {oneLine(entry.prompt || entry.title)}
                </p>
              </button>
            ))
          )
        ) : allHistory.length === 0 && allProjects.length === 0 ? (
          <p className="text-[10px] text-[var(--muted)] leading-relaxed px-0.5">
            No saved workspaces yet. Pick a repo, build in the terminal, and your history appears here with the
            connected repository attached.
          </p>
        ) : (
          <>
            {allHistory.map((entry) => (
              <button
                key={`all-h-${entry.id}`}
                type="button"
                onClick={() => void openHistoryEntry(entry)}
                className="w-full rounded-lg border border-[var(--card-border)]/50 bg-[var(--card)]/30 px-2.5 py-2 text-left hover:border-[var(--accent)]/35 hover:bg-[var(--accent)]/8 transition-colors"
              >
                <p className="text-[11px] font-medium text-[var(--foreground)] line-clamp-1">{entry.title}</p>
                <p className="mt-0.5 text-[10px] font-mono text-[var(--accent)]/80 truncate">
                  {entry.githubRepoName}
                </p>
                <p className="mt-0.5 text-[10px] text-[var(--muted)] line-clamp-1">
                  {oneLine(entry.prompt || entry.title)}
                </p>
              </button>
            ))}
            {allProjects.map((project) => (
              <div
                key={`all-p-${project.id}`}
                className="rounded-lg border border-[var(--card-border)]/50 bg-[var(--card)]/20 px-2.5 py-2"
              >
                <p className="text-[11px] font-medium text-[var(--foreground)] line-clamp-1">{project.name}</p>
                <p className="mt-0.5 text-[10px] font-mono text-[var(--accent)]/80 truncate">
                  {project.github_repo_name}
                </p>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
