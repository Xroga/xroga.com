'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Github,
  Globe2,
  Loader2,
  Plus,
  Settings2,
  Sparkles,
  Undo2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { TerminalPromptIcon } from '@/components/icons/animated/TerminalPromptIcon';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { api } from '@/lib/api';
import { loadTerminalHistory, removeTerminalHistoryEntry } from '@/lib/terminalHistory';
import { getSelectedRepoContext } from '@/lib/repoContext';
import { rollbackProjectUpdate } from '@/lib/rollbackProjectUpdate';
import { useProjectWorkspaceStore, type ProjectWorkspaceStatus } from '@/store/useProjectWorkspaceStore';

const PROJECT_REVIEW_PROMPT =
  'Inspect this project and tell me its current health, biggest risk, unfinished work, and the highest-value next step. Do not change code unless I explicitly ask.';

type SyncConfidence = 'idle' | 'checking' | 'synced' | 'moved' | 'unavailable';

const STATUS_LABEL: Record<ProjectWorkspaceStatus, string> = {
  idle: 'Connected',
  updating: 'Updating',
  pushed: 'Pushed',
  live: 'Live',
  degraded: 'Needs attention',
};

function statusDotClass(status: ProjectWorkspaceStatus): string {
  if (status === 'live') return 'bg-emerald-500';
  if (status === 'updating') return 'bg-amber-400 animate-pulse';
  if (status === 'pushed') return 'bg-sky-500';
  if (status === 'degraded') return 'bg-red-500';
  return 'bg-[var(--muted)]';
}

function formatRelative(timestamp: number | null): string {
  if (!timestamp) return '';
  const diff = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function WorkspaceIdentityMenu({ incognito = false }: { incognito?: boolean }) {
  const { sessionId, setPrompt, startNewChat } = useTerminalChat();
  const workspaceRepo = useProjectWorkspaceStore((state) => state.repo);
  const workspaceBranch = useProjectWorkspaceStore((state) => state.branch);
  const projectName = useProjectWorkspaceStore((state) => state.projectName);
  const deployUrl = useProjectWorkspaceStore((state) => state.deployUrl);
  const githubRepoUrl = useProjectWorkspaceStore((state) => state.githubRepoUrl);
  const commitSha = useProjectWorkspaceStore((state) => state.commitSha);
  const status = useProjectWorkspaceStore((state) => state.status);
  const lastUpdateAt = useProjectWorkspaceStore((state) => state.lastUpdateAt);
  const previousFiles = useProjectWorkspaceStore((state) => state.previousFiles);
  const lastFileTrail = useProjectWorkspaceStore((state) => state.lastFileTrail);

  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [undoBusy, setUndoBusy] = useState(false);
  const [syncConfidence, setSyncConfidence] = useState<SyncConfidence>('idle');
  const [repoIdentity, setRepoIdentity] = useState({
    fullName: '',
    label: 'Workspace',
    branch: 'main',
  });
  const rootRef = useRef<HTMLDivElement>(null);

  const identityMatchesWorkspace = Boolean(
    workspaceRepo && workspaceRepo === repoIdentity.fullName,
  );
  const visibleStatus: ProjectWorkspaceStatus = identityMatchesWorkspace ? status : 'idle';
  const visibleDeployUrl = identityMatchesWorkspace ? deployUrl : null;
  const visibleCommitSha = identityMatchesWorkspace ? commitSha : null;
  const visiblePreviousFiles = identityMatchesWorkspace ? previousFiles : null;
  const visibleLastUpdateAt = identityMatchesWorkspace ? lastUpdateAt : null;

  useEffect(() => {
    const refreshIdentity = () => {
      const history = loadTerminalHistory();
      const currentEntry = history.find((entry) => entry.id === sessionId);
      const selected = getSelectedRepoContext();
      const fullName = workspaceRepo || currentEntry?.githubRepoName || selected?.repo || '';
      const workspaceOwnsIdentity = Boolean(workspaceRepo && workspaceRepo === fullName);
      const branch = workspaceOwnsIdentity
        ? workspaceBranch || 'main'
        : currentEntry?.githubBranch || selected?.branch || 'main';
      setRepoIdentity({
        fullName,
        label:
          (workspaceOwnsIdentity ? projectName : null) ||
          fullName.split('/').pop() ||
          'Workspace',
        branch,
      });
    };

    refreshIdentity();
    window.addEventListener('storage', refreshIdentity);
    window.addEventListener('xroga-repo-context-change', refreshIdentity);
    return () => {
      window.removeEventListener('storage', refreshIdentity);
      window.removeEventListener('xroga-repo-context-change', refreshIdentity);
    };
  }, [projectName, sessionId, workspaceBranch, workspaceRepo]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  // Real GitHub sync confidence. Opening the menu may perform this cheap GitHub read,
  // but it never spends AI/model tokens.
  useEffect(() => {
    if (!open || !repoIdentity.fullName || !visibleCommitSha) {
      setSyncConfidence('idle');
      return;
    }

    let cancelled = false;
    setSyncConfidence('checking');
    void api.github
      .repoState(repoIdentity.fullName, repoIdentity.branch)
      .then((remote) => {
        if (cancelled) return;
        if (remote.status !== 'head' || !remote.headSha) {
          setSyncConfidence('unavailable');
          return;
        }
        setSyncConfidence(
          remote.headSha.toLowerCase() === visibleCommitSha.toLowerCase() ? 'synced' : 'moved',
        );
      })
      .catch(() => {
        if (!cancelled) setSyncConfidence('unavailable');
      });

    return () => {
      cancelled = true;
    };
  }, [open, repoIdentity.branch, repoIdentity.fullName, visibleCommitSha]);

  const repoUrl = useMemo(
    () =>
      (identityMatchesWorkspace ? githubRepoUrl : null) ||
      (repoIdentity.fullName ? `https://github.com/${repoIdentity.fullName}` : ''),
    [githubRepoUrl, identityMatchesWorkspace, repoIdentity.fullName],
  );

  const hasUndoData = Boolean(
    repoIdentity.fullName && visibleCommitSha && visiblePreviousFiles?.length,
  );
  const undoEnabled = hasUndoData && syncConfidence === 'synced' && !undoBusy;

  if (incognito) {
    return (
      <div className="xv-term-title">
        <TerminalPromptIcon className="shrink-0 opacity-70" aria-hidden="true" />
        <h3>guest@incognito</h3>
        <span className="xv-term-path">~/temporary</span>
      </div>
    );
  }

  const openExternal = (url: string) => {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
    setOpen(false);
  };

  const prepareProjectReview = () => {
    setPrompt(PROJECT_REVIEW_PROMPT);
    setOpen(false);
    toast.success('Project review prompt is ready');
  };

  const newProjectTask = () => {
    startNewChat();
    setOpen(false);
    toast.success(`New task started in ${repoIdentity.label}`);
  };

  const archiveCurrentTask = () => {
    const archivedId = sessionId;
    startNewChat();
    removeTerminalHistoryEntry(archivedId);
    setOpen(false);
    toast.success('Task archived');
  };

  const undoLastChange = async () => {
    if (!hasUndoData || !visibleCommitSha || !visiblePreviousFiles?.length) return;
    if (syncConfidence !== 'synced') {
      toast.error('Undo is blocked until Xroga verifies the current GitHub HEAD.');
      return;
    }

    setUndoBusy(true);
    try {
      const result = await rollbackProjectUpdate({
        repo: repoIdentity.fullName,
        branch: repoIdentity.branch,
        previousFiles: visiblePreviousFiles,
        fileTrail: lastFileTrail,
        expectedHeadSha: visibleCommitSha,
        redeploy: Boolean(visibleDeployUrl),
      });

      if (result.deployVerified) {
        toast.success('Undo complete — GitHub and live site restored');
      } else {
        toast.success('Undo complete on GitHub');
      }
      if (result.warning) toast(result.warning, { icon: '⚠️' });
    } catch (error) {
      toast.error((error as Error).message || 'Undo failed');
    } finally {
      setUndoBusy(false);
    }
  };

  const syncText =
    syncConfidence === 'checking'
      ? 'Checking GitHub…'
      : syncConfidence === 'synced'
        ? 'GitHub synced'
        : syncConfidence === 'moved'
          ? 'GitHub changed since this Xroga update'
          : syncConfidence === 'unavailable'
            ? 'GitHub status unavailable'
            : visibleCommitSha
              ? 'Open menu to verify GitHub'
              : 'No Xroga commit recorded yet';

  const undoText = undoBusy
    ? 'Undoing last Xroga change…'
    : syncConfidence === 'checking'
      ? 'Checking GitHub before Undo…'
      : syncConfidence === 'moved'
        ? 'Undo blocked — GitHub changed'
        : syncConfidence === 'unavailable'
          ? 'Undo unavailable — cannot verify GitHub'
          : 'Undo last Xroga change';

  return (
    <div ref={rootRef} className="xv-workspace-identity">
      <button
        type="button"
        className="xv-term-title xv-term-title--button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <TerminalPromptIcon className="shrink-0 opacity-70" aria-hidden="true" />
        <h3 title={repoIdentity.fullName || 'No repository selected'}>{repoIdentity.label}</h3>
        <span className="xv-term-path">
          {repoIdentity.branch} · {STATUS_LABEL[visibleStatus]}
        </span>
        <ChevronDown
          className={`h-3 w-3 shrink-0 opacity-55 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div
          className="absolute left-0 top-[calc(100%+.45rem)] z-[1000] w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-1.5 text-[var(--foreground)] shadow-[0_20px_60px_rgba(0,0,0,.28)] backdrop-blur-xl"
          role="menu"
          aria-label="Project actions"
        >
          <div className="px-2.5 pb-2 pt-2">
            <div className="flex items-start gap-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{repoIdentity.label}</p>
                <p className="mt-0.5 truncate font-mono text-[10px] text-[var(--muted)]">
                  {repoIdentity.fullName || 'No GitHub repository'} · {repoIdentity.branch}
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--card-border)] px-2 py-1 text-[10px] font-medium">
                <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass(visibleStatus)}`} />
                {STATUS_LABEL[visibleStatus]}
              </span>
            </div>

            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-[var(--muted)]">
              {syncConfidence === 'checking' ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              ) : syncConfidence === 'synced' ? (
                <CheckCircle2 className="h-3 w-3 text-emerald-500" aria-hidden="true" />
              ) : syncConfidence === 'moved' || syncConfidence === 'unavailable' ? (
                <AlertTriangle className="h-3 w-3 text-amber-500" aria-hidden="true" />
              ) : null}
              <span>{syncText}</span>
              {visibleLastUpdateAt ? (
                <span>· updated {formatRelative(visibleLastUpdateAt)}</span>
              ) : null}
            </div>
          </div>

          <div className="my-1 h-px bg-[var(--card-border)]" />

          {hasUndoData ? (
            <button
              role="menuitem"
              type="button"
              disabled={!undoEnabled}
              onClick={() => void undoLastChange()}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition hover:bg-[var(--accent-dim)] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {undoBusy || syncConfidence === 'checking' ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              ) : (
                <Undo2 className="h-4 w-4 shrink-0" />
              )}
              <span>{undoText}</span>
            </button>
          ) : null}

          <button
            role="menuitem"
            type="button"
            onClick={prepareProjectReview}
            className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-[var(--accent-dim)]"
          >
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0">
              <span className="block text-xs font-semibold">Ask Xroga about this project</span>
              <span className="mt-0.5 block text-[10px] text-[var(--muted)]">
                Health, risks & what to do next
              </span>
            </span>
          </button>

          <div className="my-1 h-px bg-[var(--card-border)]" />

          {repoUrl ? (
            <button
              role="menuitem"
              type="button"
              onClick={() => openExternal(repoUrl)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-[var(--accent-dim)]"
            >
              <Github className="h-4 w-4 shrink-0" />
              <span className="flex-1">Open on GitHub</span>
              <ExternalLink className="h-3.5 w-3.5 opacity-55" />
            </button>
          ) : null}

          {visibleDeployUrl ? (
            <button
              role="menuitem"
              type="button"
              onClick={() => openExternal(visibleDeployUrl)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-[var(--accent-dim)]"
            >
              <Globe2 className="h-4 w-4 shrink-0" />
              <span className="flex-1">Open live site</span>
              <ExternalLink className="h-3.5 w-3.5 opacity-55" />
            </button>
          ) : null}

          <button
            role="menuitem"
            type="button"
            onClick={newProjectTask}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-[var(--accent-dim)]"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span>New task in this project</span>
          </button>

          <div className="my-1 h-px bg-[var(--card-border)]" />

          <button
            role="menuitem"
            type="button"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((value) => !value)}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-[var(--muted)] transition hover:bg-[var(--accent-dim)] hover:text-[var(--foreground)]"
          >
            <Settings2 className="h-4 w-4 shrink-0" />
            <span className="flex-1">Project settings</span>
            <ChevronRight
              className={`h-3.5 w-3.5 transition-transform ${settingsOpen ? 'rotate-90' : ''}`}
            />
          </button>

          {settingsOpen ? (
            <div className="ml-6 border-l border-[var(--card-border)] pl-1.5">
              <button
                role="menuitem"
                type="button"
                onClick={archiveCurrentTask}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] text-[var(--muted)] transition hover:bg-red-500/10 hover:text-red-500"
              >
                <Archive className="h-3.5 w-3.5" />
                <span>Archive current task</span>
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
