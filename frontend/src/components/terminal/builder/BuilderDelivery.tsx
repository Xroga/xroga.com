'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, ExternalLink, GitBranch, Loader2 } from 'lucide-react';

import { BuilderApiError } from '@/lib/builderApi';
import {
  builderPhase2Api,
  newOperationKey,
  type GitHubOperation,
  type GitHubState,
  type GitHubTargets,
} from '@/lib/builderApiPhase2';

const STATUS_TEXT: Record<GitHubOperation['status'], string> = {
  prepared: 'Waiting for your approval',
  approved: 'Approved, not started',
  executing: 'Running',
  succeeded: 'Done and verified on GitHub',
  failed: 'Did not complete',
  ambiguous: 'GitHub did not confirm the result',
  diverged: 'Stopped: the repository changed on GitHub',
  cancelled: 'Cancelled',
};

const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'xroga-project';

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Source ownership: a verified archive, and a customer-owned GitHub repository created only after explicit approval. */
export function BuilderDelivery({ projectId, title, onChanged }: { projectId: string; title: string; onChanged: () => void }) {
  const [targets, setTargets] = useState<GitHubTargets | null>(null);
  const [github, setGithub] = useState<GitHubState | null>(null);
  const [owner, setOwner] = useState('');
  const [name, setName] = useState(slug(title));
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [pending, setPending] = useState<GitHubOperation | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [archive, setArchive] = useState<{ filename: string; sha256: string | null } | null>(null);

  const load = useCallback(async () => {
    try {
      const [nextTargets, state] = await Promise.all([builderPhase2Api.githubTargets(), builderPhase2Api.github(projectId)]);
      setTargets(nextTargets);
      setGithub(state);
      setOwner((current) => current || nextTargets.viewer?.login || '');
      const open = state.operations.find((operation) => ['prepared', 'approved', 'failed', 'ambiguous'].includes(operation.status));
      setPending(open ?? null);
    } catch {
      setMessage('GitHub status could not be loaded.');
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const guarded = async (label: string, action: () => Promise<void>) => {
    setBusy(label);
    setMessage(null);
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof BuilderApiError ? error.message : 'That did not complete.');
      await load();
    } finally {
      setBusy(null);
    }
  };

  const download = () =>
    guarded('download', async () => {
      const result = await builderPhase2Api.downloadSource(projectId);
      triggerDownload(result.blob, result.filename);
      setArchive({ filename: result.filename, sha256: result.sha256 });
    });

  const prepare = () =>
    guarded('prepare', async () => {
      const result = github?.binding
        ? await builderPhase2Api.prepareGitHubSync(projectId, newOperationKey('sync'))
        : await builderPhase2Api.prepareGitHub(projectId, { operationKey: newOperationKey('repo'), owner, repositoryName: name.trim(), visibility });
      setPending(result.operation);
    });

  const approveAndRun = (operation: GitHubOperation) =>
    guarded('execute', async () => {
      // The approval quotes the digest of the exact plan on screen.
      await builderPhase2Api.approveGitHub(projectId, operation.id, operation.planDigest);
      const result = await builderPhase2Api.executeGitHub(projectId, operation.id);
      setPending(null);
      setMessage(result.operation.receipt ? `Verified on GitHub: ${result.operation.receipt.repository.owner}/${result.operation.receipt.repository.name}.` : 'Done.');
      await load();
      onChanged();
    });

  const cancel = (operation: GitHubOperation) =>
    guarded('cancel', async () => {
      await builderPhase2Api.cancelGitHub(projectId, operation.id);
      setPending(null);
      await load();
    });

  return (
    <section aria-label="Export and GitHub" className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 font-medium"><Download className="h-3.5 w-3.5" aria-hidden="true" /> Download your source</div>
        <p className="text-[11px] text-[var(--muted)]">A ZIP of this version&apos;s source with setup instructions and a list of every file&apos;s checksum. It never contains passwords or keys.</p>
        <button type="button" disabled={busy !== null} onClick={() => void download()} className="flex items-center gap-1 rounded border border-[var(--card-border)] px-2 py-1 text-[11px] disabled:opacity-50">
          {busy === 'download' ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <Download className="h-3 w-3" aria-hidden="true" />} Download ZIP
        </button>
        {archive ? <p className="text-[11px] text-[var(--muted)]">Verified and downloaded {archive.filename}{archive.sha256 ? ` (SHA-256 ${archive.sha256.slice(0, 12)}…)` : ''}.</p> : null}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-1.5 font-medium"><GitBranch className="h-3.5 w-3.5" aria-hidden="true" /> Your GitHub repository</div>
        {message ? <p className="text-[11px] text-amber-400" role="status">{message}</p> : null}
        {!targets ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="Loading GitHub" />
        ) : !targets.connected ? (
          <p className="text-[11px] text-[var(--muted)]">{targets.notes[0] ?? 'GitHub is not connected.'} Connect GitHub from Integrations, then return here. Nothing is created until you approve it.</p>
        ) : (
          <>
            <p className="text-[11px] text-[var(--muted)]">Connected as <strong>{targets.viewer?.login}</strong>. The repository is created in the account you choose and is yours.</p>
            {targets.notes.map((note) => <p key={note} className="flex items-start gap-1 text-[11px] text-amber-400"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />{note}</p>)}

            {github?.binding ? (
              <div className="rounded-lg border border-emerald-400/30 p-2 text-[11px]">
                <p className="flex items-center gap-1 font-medium"><CheckCircle2 className="h-3 w-3 text-emerald-400" aria-hidden="true" /> Saved to GitHub</p>
                <a href={github.binding.repository.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 underline">
                  {github.binding.repository.owner}/{github.binding.repository.name} <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
                <p className="text-[var(--muted)]">{github.binding.repository.private ? 'Private' : 'Public'} · version {github.binding.lastRevisionNumber} · commit {github.binding.lastCommitSha.slice(0, 7)}</p>
              </div>
            ) : null}

            {!pending ? (
              <div className="space-y-1.5 text-[11px]">
                {!github?.binding ? (
                  <>
                    <label className="block">Owner
                      <select value={owner} onChange={(event) => setOwner(event.target.value)} className="mt-0.5 block w-full rounded border border-[var(--card-border)] bg-transparent p-1">
                        {targets.owners.map((entry) => <option key={entry.id} value={entry.login}>{entry.login}{entry.type === 'Organization' ? ' (organization)' : ''}</option>)}
                      </select>
                    </label>
                    <label className="block">Repository name
                      <input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} className="mt-0.5 block w-full rounded border border-[var(--card-border)] bg-transparent p-1" />
                    </label>
                    <fieldset>
                      <legend className="sr-only">Visibility</legend>
                      <label className="mr-3"><input type="radio" checked={visibility === 'private'} onChange={() => setVisibility('private')} /> Private (recommended)</label>
                      <label><input type="radio" checked={visibility === 'public'} onChange={() => setVisibility('public')} /> Public</label>
                    </fieldset>
                  </>
                ) : (
                  <p className="text-[var(--muted)]">Add this version to your repository as a new commit. Anything changed on GitHub since the last sync stops the push; nothing is overwritten.</p>
                )}
                <button type="button" disabled={busy !== null || (!github?.binding && (!owner || !name.trim()))} onClick={() => void prepare()} className="rounded border border-[var(--card-border)] px-2 py-1 disabled:opacity-50">
                  {busy === 'prepare' ? <Loader2 className="inline h-3 w-3 animate-spin" aria-label="Preparing" /> : github?.binding ? 'Review sync' : 'Review what will be created'}
                </button>
              </div>
            ) : (
              <div className="rounded-lg border border-[var(--accent)]/40 p-2 text-[11px]" aria-label="Action to approve">
                <p className="font-medium">{pending.action === 'create_repository' ? 'Create a repository' : 'Push to your repository'}</p>
                <ul className="mt-1 space-y-0.5">
                  <li>Account: <strong>{pending.plan.owner.login}</strong> ({pending.plan.owner.type === 'Organization' ? 'organization' : 'your account'})</li>
                  <li>Repository: <strong>{pending.plan.repository.name}</strong>, {pending.plan.repository.visibility}, branch {pending.plan.repository.branch}</li>
                  <li>Contents: version {pending.plan.revision.number}, {pending.plan.revision.fileCount} files</li>
                </ul>
                {pending.plan.warnings.map((warning) => <p key={warning} className="mt-1 flex items-start gap-1 text-amber-400"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />{warning}</p>)}
                <p className="mt-1 text-[var(--muted)]">{pending.plan.costNote}</p>
                <p className="mt-1 font-medium">{STATUS_TEXT[pending.status]}</p>
                {pending.failure ? <p className="text-amber-400" role="alert">{pending.failure}</p> : null}
                {pending.status === 'diverged' ? null : (
                  <div className="mt-1.5 flex gap-2">
                    <button type="button" disabled={busy !== null} onClick={() => void approveAndRun(pending)} className="rounded border border-[var(--accent)] px-2 py-0.5 text-[var(--accent)] disabled:opacity-50">
                      {busy === 'execute' ? <Loader2 className="inline h-3 w-3 animate-spin" aria-label="Working" /> : pending.status === 'failed' || pending.status === 'ambiguous' ? 'Approve and retry' : 'Approve and run'}
                    </button>
                    <button type="button" disabled={busy !== null} onClick={() => void cancel(pending)} className="underline text-[var(--muted)]">Cancel</button>
                  </div>
                )}
              </div>
            )}
            {github && github.operations.length > 0 ? (
              <details className="text-[11px]">
                <summary className="cursor-pointer text-[var(--muted)]">History ({github.operations.length})</summary>
                <ul className="mt-1 space-y-0.5">
                  {github.operations.map((operation) => (
                    <li key={operation.id}>{operation.action === 'create_repository' ? 'Create' : 'Sync'} version {operation.plan.revision.number}: {STATUS_TEXT[operation.status]}</li>
                  ))}
                </ul>
              </details>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
