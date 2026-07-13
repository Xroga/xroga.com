'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { History } from 'lucide-react';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { getSelectedRepoContext } from '@/lib/repoContext';
import { loadTerminalHistory, type TerminalHistoryEntry } from '@/lib/terminalHistory';
import { loadTerminalHistoryEntry } from '@/lib/terminalSessionStorage';
import { loadWorkspaceSession } from '@/lib/workspacePersistence';
import { GITHUB_PROJECT_SAVED_EVENT, GITHUB_REPO_CONTEXT_EVENT } from '@/lib/githubProjectEvents';
import { cn } from '@/lib/utils';

export function RepoSessionRail() {
  const router = useRouter();
  const { restoreTerminalSession } = useTerminalChat();
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [entries, setEntries] = useState<TerminalHistoryEntry[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

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
    return filtered.slice(0, 12);
  }, [entries, selectedRepo]);

  const otherEntries = useMemo(() => {
    if (!selectedRepo) return [];
    return entries.filter((entry) => entry.githubRepoName && entry.githubRepoName !== selectedRepo).slice(0, 6);
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
    setPanelOpen(false);
    router.push('/workspace');
  }

  if (repoEntries.length === 0 && otherEntries.length === 0) return null;

  const activeId = loadWorkspaceSession()?.sessionId ?? repoEntries[0]?.id ?? null;
  const previewEntry =
    repoEntries.find((e) => e.id === (hoveredId ?? activeId)) ?? repoEntries[0] ?? null;

  return (
    <div
      className="relative hidden lg:flex flex-col items-center gap-3 pt-2 shrink-0"
      onMouseEnter={() => setPanelOpen(true)}
      onMouseLeave={() => {
        setPanelOpen(false);
        setHoveredId(null);
      }}
    >
      <button
        type="button"
        onClick={() => setPanelOpen((open) => !open)}
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-full border transition-colors',
          panelOpen
            ? 'border-[var(--accent)]/50 bg-[var(--accent)]/15 text-[var(--accent)]'
            : 'border-[var(--card-border)] bg-[var(--card)]/80 text-[var(--muted)] hover:text-[var(--foreground)]'
        )}
        aria-label="Terminal session history"
        title="Jump to past chats in this repo"
      >
        <History className="h-3.5 w-3.5" />
      </button>

      <div className="flex flex-col items-center gap-2.5 py-1">
        {repoEntries.map((entry) => {
          const active = entry.id === activeId;
          return (
            <button
              key={entry.id}
              type="button"
              onMouseEnter={() => setHoveredId(entry.id)}
              onFocus={() => setHoveredId(entry.id)}
              onClick={() => void openEntry(entry)}
              title={entry.title}
              aria-label={`Open ${entry.title}`}
              className={cn(
                'h-1.5 rounded-full transition-all',
                active
                  ? 'w-7 bg-[var(--accent)] shadow-[0_0_10px_rgba(96,165,250,0.45)]'
                  : 'w-4 bg-[var(--muted)]/45 hover:w-7 hover:bg-[var(--accent)]/70'
              )}
            />
          );
        })}
      </div>

      {panelOpen && previewEntry ? (
        <div className="absolute bottom-full left-0 z-[80] mb-3 flex items-end gap-2 pointer-events-none">
          <div className="max-w-[220px] rounded-xl border border-[var(--card-border)] bg-[var(--card)]/95 px-3 py-2 text-[11px] text-[var(--foreground)] shadow-xl backdrop-blur-md">
            <p className="line-clamp-3 font-medium leading-snug">{previewEntry.title}</p>
            {previewEntry.githubRepoName ? (
              <p className="mt-1 truncate text-[10px] text-[var(--muted)]">{previewEntry.githubRepoName}</p>
            ) : null}
          </div>

          <div className="pointer-events-auto w-[min(280px,42vw)] max-h-[min(360px,50vh)] overflow-y-auto rounded-2xl border border-[var(--card-border)] bg-[var(--card)]/98 p-2 shadow-2xl backdrop-blur-md">
            {selectedRepo ? (
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">
                Current repo
              </p>
            ) : null}
            <ul className="space-y-0.5">
              {repoEntries.map((entry) => {
                const active = entry.id === activeId;
                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onMouseEnter={() => setHoveredId(entry.id)}
                      onClick={() => void openEntry(entry)}
                      className={cn(
                        'group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] transition-colors',
                        active
                          ? 'bg-[var(--accent)]/12 text-[var(--foreground)]'
                          : 'text-[var(--muted)] hover:bg-white/5 hover:text-[var(--foreground)]'
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{entry.title}</span>
                      <span
                        className={cn(
                          'h-1 shrink-0 rounded-full transition-all',
                          active ? 'w-5 bg-[var(--accent)]' : 'w-2 bg-[var(--muted)]/40 group-hover:w-4 group-hover:bg-[var(--accent)]/60'
                        )}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>

            {otherEntries.length > 0 ? (
              <>
                <p className="mt-2 px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Other repos
                </p>
                <ul className="space-y-0.5">
                  {otherEntries.map((entry) => (
                    <li key={entry.id}>
                      <button
                        type="button"
                        onMouseEnter={() => setHoveredId(entry.id)}
                        onClick={() => void openEntry(entry)}
                        className="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] text-[var(--muted)] transition-colors hover:bg-white/5 hover:text-[var(--foreground)]"
                      >
                        <span className="min-w-0 flex-1 truncate">{entry.title}</span>
                        <span className="h-1 w-2 shrink-0 rounded-full bg-[var(--muted)]/35 group-hover:w-4 group-hover:bg-[var(--accent)]/50" />
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
