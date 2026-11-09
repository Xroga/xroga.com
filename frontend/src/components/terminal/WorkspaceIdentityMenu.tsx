'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ChevronRight,
  Globe2,
  Loader2,
  Plus,
  Settings2,
  Sparkles,
  Undo2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { GithubGlyphIcon } from '@/components/icons/animated/GithubGlyphIcon';
import { TerminalPromptIcon } from '@/components/icons/animated/TerminalPromptIcon';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { api } from '@/lib/api';
import { removeTerminalHistoryEntry } from '@/lib/terminalHistory';
import { rollbackProjectUpdate } from '@/lib/rollbackProjectUpdate';
import { useProjectWorkspaceStore, type ProjectWorkspaceStatus } from '@/store/useProjectWorkspaceStore';
import { AnchoredPortalPopover } from '@/components/ui/AnchoredPortalPopover';
import { SidebarMovingTitle } from '@/components/layout/SidebarMovingTitle';

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

export function WorkspaceIdentityMenu({ incognito = false, embedded = false, onAction }: { incognito?: boolean; embedded?: boolean; onAction?: () => void }) {
  const { sessionId, setPrompt, startNewChat } = useTerminalChat();
  const activeProject = useProjectWorkspaceStore((state) => state.activeProjectContext);
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
  const rootRef = useRef<HTMLDivElement>(null);
  const repoIdentity = {
    fullName: activeProject?.repo || '',
    label: activeProject?.repo.split('/').pop() || (githubRepoUrl?.split('/').filter(Boolean).pop()) || 'Black Hole',
    branch: activeProject?.branch || '',
  };
  const visibleStatus: ProjectWorkspaceStatus = activeProject ? status : 'idle';
  const visibleDeployUrl = activeProject ? deployUrl : null;
  const visibleCommitSha = activeProject ? commitSha : null;
  const visiblePreviousFiles = activeProject ? previousFiles : null;
  const visibleLastUpdateAt = activeProject ? lastUpdateAt : null;

  // Real GitHub sync confidence. Opening the menu may perform this cheap GitHub read,
  // but it never spends AI/model tokens.
  useEffect(() => {
    if (!(open || embedded) || !repoIdentity.fullName || !visibleCommitSha) {
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
  }, [open, embedded, repoIdentity.branch, repoIdentity.fullName, visibleCommitSha]);

  const repoUrl = useMemo(
    () =>
      githubRepoUrl ||
      (repoIdentity.fullName ? `https://github.com/${repoIdentity.fullName}` : ''),
    [githubRepoUrl, repoIdentity.fullName],
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
    onAction?.();
  };

  const prepareProjectReview = () => {
    setPrompt(PROJECT_REVIEW_PROMPT);
    setOpen(false);
    onAction?.();
    toast.success('Project review prompt is ready');
  };

  const newProjectTask = () => {
    startNewChat();
    setOpen(false);
    onAction?.();
    toast.success(`New task started in ${repoIdentity.label}`);
  };

  const archiveCurrentTask = () => {
    const archivedId = sessionId;
    startNewChat();
    removeTerminalHistoryEntry(archivedId);
    setOpen(false);
    onAction?.();
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
      if (result.warning) toast(result.warning, { icon: <AlertTriangle className="h-4 w-4" aria-hidden="true" /> });
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

  // Display-only shortening. Real GitHub identity, links and permissions remain unchanged.
  const compactRepoName = repoIdentity.label.replace(/-20\d{6}-\d{6}$/, '');
  const projectActionClass = 'inline-flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-1.5 py-2 text-[11px] font-medium text-[var(--muted)] transition-colors hover:bg-[var(--accent-dim)] hover:text-[var(--foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]';

  const projectMenu = !repoIdentity.fullName ? (
    <div className="px-2 py-2">
      <strong className="block text-xs">Xroga · Black Hole</strong>
      <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">
        Describe the work. Xroga selects available capabilities automatically.
      </p>
    </div>
  ) : (
    <div className="min-w-0 px-1 pb-1 pt-0.5">
      <div className="min-w-0 px-1.5 pb-1.5 pt-1">
        <div className="flex min-w-0 items-center gap-2">
          <GithubGlyphIcon size={15} className="shrink-0 opacity-70" />
          <button type="button" className="min-w-0 flex-1 truncate text-left text-[12px] font-semibold leading-5"
            title={`Copy repository: ${repoIdentity.fullName}`}
            aria-label={`Copy repository name ${repoIdentity.fullName}`}
            onClick={() => void navigator.clipboard.writeText(repoIdentity.fullName)
              .then(() => toast.success('Repository name copied'))
              .catch(() => toast.error('Could not copy repository name'))}>
            {compactRepoName}
          </button>
          <span title={syncText} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--card-border)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--muted)]">
            <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass(visibleStatus)}`} />
            {STATUS_LABEL[visibleStatus]}
          </span>
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 pl-[23px] text-[10px] text-[var(--muted)]" title={repoIdentity.branch}>
          <span className="max-w-full truncate">{repoIdentity.branch || 'Default branch'}</span>
          {visibleLastUpdateAt ? <span className="shrink-0 opacity-75">· {formatRelative(visibleLastUpdateAt)}</span> : null}
        </div>
        {visibleCommitSha && (syncConfidence === 'moved' || syncConfidence === 'unavailable') ? (
          <div role="status" className="mt-1 flex items-center gap-1.5 pl-[23px] text-[10px] text-amber-500">
            <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate" title={syncText}>{syncText}</span>
          </div>
        ) : null}
      </div>

      <button role="menuitem" type="button" onClick={prepareProjectReview}
        title="Ask Xroga about this project — health, risks & next steps"
        className="my-0.5 flex w-full items-center gap-2 rounded-lg bg-[var(--accent-dim)] px-2.5 py-2 text-left text-[11px] font-semibold text-[var(--foreground)] transition-colors hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
        <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">Ask Xroga</span>
        <span className="text-[10px] font-normal text-[var(--muted)]">Project review</span>
      </button>

      {hasUndoData ? (
        <button role="menuitem" type="button" disabled={!undoEnabled}
          title={undoText} onClick={() => void undoLastChange()}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] text-[var(--foreground)] hover:bg-[var(--accent-dim)] disabled:cursor-not-allowed disabled:opacity-45">
          {undoBusy || syncConfidence === 'checking'
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            : <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />}
          <span className="truncate">{undoText}</span>
        </button>
      ) : null}

      <div className={`grid gap-1 ${visibleDeployUrl ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {repoUrl ? (
          <button role="menuitem" type="button" title="Open on GitHub" aria-label="Open on GitHub"
            onClick={() => openExternal(repoUrl)} className={projectActionClass}>
            <GithubGlyphIcon size={14} className="shrink-0" /><span>GitHub</span>
          </button>
        ) : null}
        {visibleDeployUrl ? (
          <button role="menuitem" type="button" title="Open live site" aria-label="Open live site"
            onClick={() => openExternal(visibleDeployUrl)} className={projectActionClass}>
            <Globe2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span>Live site</span>
          </button>
        ) : null}
        <button role="menuitem" type="button" title="New task in this project" aria-label="New task in this project"
          onClick={newProjectTask} className={projectActionClass}>
          <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span>New task</span>
        </button>
        <button role="menuitem" type="button" title="Project settings" aria-label="Project settings"
          aria-expanded={settingsOpen} onClick={() => setSettingsOpen((value) => !value)} className={projectActionClass}>
          <Settings2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span>Settings</span>
          <ChevronRight className={`h-3 w-3 shrink-0 transition-transform ${settingsOpen ? 'rotate-90' : ''}`} aria-hidden="true" />
        </button>
      </div>

      {settingsOpen ? (
        <div className="mt-1 border-t border-[var(--card-border)] pt-1">
          <button role="menuitem" type="button" onClick={archiveCurrentTask}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11px] text-[var(--muted)] hover:bg-[var(--accent-dim)] hover:text-[var(--foreground)]">
            <Archive className="h-3.5 w-3.5" aria-hidden="true" /><span>Archive current task</span>
          </button>
        </div>
      ) : null}
    </div>
  );

  return embedded ? (
    <section className="min-w-0 border-b border-[var(--card-border)] px-0.5 pb-1" aria-label="Connected project actions">
      {projectMenu}
    </section>
  ) : (
    <div ref={rootRef} className="xv-workspace-identity">
      <button
        type="button"
        className="xv-term-title xv-term-title--button"
        aria-label={repoIdentity.fullName ? 'Project actions' : 'About Xroga Black Hole'}
        onMouseEnter={() => { if (!repoIdentity.fullName) setOpen(true); }}
        onClick={() => setOpen((value) => repoIdentity.fullName ? !value : true)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <h3 className="xv-repo-name" title={repoIdentity.fullName}><SidebarMovingTitle text={repoIdentity.label} /></h3>

      </button>

      <AnchoredPortalPopover open={open} onClose={() => setOpen(false)} anchorRef={rootRef} placement="bottom-start" width={repoIdentity.fullName ? 290 : 236} ariaLabel={repoIdentity.fullName ? 'Project actions' : 'About Xroga Black Hole'}
          className="absolute left-0 top-[calc(100%+.45rem)] z-[1000] overflow-hidden rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-1.5 text-[var(--foreground)] shadow-[0_20px_60px_rgba(0,0,0,.28)]"
        >
          {projectMenu}
      </AnchoredPortalPopover>
    </div>
  );
}
