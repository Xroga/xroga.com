'use client';

import { useMemo, useState } from 'react';
import { ArrowRight, Check, Loader2, Monitor, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';

import {
  PublishDisclosure,
  PublishRequirement,
  PublishStatusBadge,
} from '@/components/publish/PublishPrimitives';
import { api } from '@/lib/api';
import type {
  PublishProject,
  PublishStatus,
} from '@/lib/publish/types';

function DesktopSigningSetup({
  cscSaved,
  notarizationSaved,
  project,
  onSaved,
}: {
  cscSaved: boolean;
  notarizationSaved: boolean;
  project?: PublishProject | null;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [cscLink, setCscLink] = useState('');
  const [cscPassword, setCscPassword] = useState('');
  const [appleId, setAppleId] = useState('');
  const [applePassword, setApplePassword] = useState('');
  const [teamId, setTeamId] = useState('');
  const [manualRepo, setManualRepo] = useState('');

  const repoName = useMemo(
    () => project?.githubRepoName?.trim() || manualRepo.trim(),
    [project?.githubRepoName, manualRepo],
  );

  async function saveField(
    provider:
      | 'electron_csc_link'
      | 'electron_csc_password'
      | 'electron_apple_id'
      | 'electron_apple_password'
      | 'electron_apple_team_id',
    value: string,
  ) {
    if (!value.trim()) {
      toast.error('Add the credential first');
      return;
    }

    setBusy(provider);
    try {
      await api.integrations.saveProviderKey(provider, value.trim());
      toast.success('Saved securely');
      if (provider === 'electron_csc_link') setCscLink('');
      if (provider === 'electron_csc_password') setCscPassword('');
      if (provider === 'electron_apple_id') setAppleId('');
      if (provider === 'electron_apple_password') setApplePassword('');
      if (provider === 'electron_apple_team_id') setTeamId('');
      onSaved();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function syncSecrets() {
    if (!repoName || !repoName.includes('/')) {
      toast.error('Choose a project with a GitHub repository or enter owner/repo');
      return;
    }

    setBusy('sync');
    try {
      const result = await api.publish.syncElectronSecrets(repoName);
      toast.success(result.message || 'Signing credentials synced to GitHub Actions');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-token-md border border-[var(--border-subtle)] bg-[var(--surface-inset)] p-3">
          <p className="text-xs font-semibold text-[var(--text-primary)]">Code signing</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {cscSaved ? 'Signing certificate saved securely.' : 'Optional for signed desktop distribution.'}
          </p>
          <PublishStatusBadge
            label={cscSaved ? 'Configured' : 'Optional'}
            tone={cscSaved ? 'success' : 'neutral'}
          />
        </div>
        <div className="rounded-token-md border border-[var(--border-subtle)] bg-[var(--surface-inset)] p-3">
          <p className="text-xs font-semibold text-[var(--text-primary)]">macOS notarization</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {notarizationSaved ? 'Apple notarization credentials are configured.' : 'Only needed for notarized macOS distribution.'}
          </p>
          <PublishStatusBadge
            label={notarizationSaved ? 'Configured' : 'Optional'}
            tone={notarizationSaved ? 'success' : 'neutral'}
          />
        </div>
      </div>

      <details className="rounded-token-md border border-[var(--border-subtle)]">
        <summary className="cursor-pointer px-3 py-2.5 text-xs font-semibold text-[var(--text-primary)]">
          Signing certificate
        </summary>
        <div className="grid gap-2 border-t border-[var(--border-subtle)] p-3 sm:grid-cols-2">
          <input
            type="password"
            autoComplete="off"
            value={cscLink}
            onChange={(event) => setCscLink(event.target.value)}
            placeholder="Signing certificate (base64 .p12 / CSC_LINK)"
            className="sm:col-span-2 rounded-token-sm border border-[var(--border-subtle)] bg-[var(--background)] px-3 py-2.5 text-xs"
          />
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void saveField('electron_csc_link', cscLink)}
            className="inline-flex min-h-9 items-center justify-center rounded-token-sm border border-[var(--border-subtle)] px-3 text-xs font-semibold text-[var(--text-primary)] disabled:opacity-50"
          >
            {busy === 'electron_csc_link' ? 'Saving…' : 'Save certificate'}
          </button>
          <input
            type="password"
            autoComplete="off"
            value={cscPassword}
            onChange={(event) => setCscPassword(event.target.value)}
            placeholder="Certificate password"
            className="rounded-token-sm border border-[var(--border-subtle)] bg-[var(--background)] px-3 py-2.5 text-xs"
          />
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void saveField('electron_csc_password', cscPassword)}
            className="inline-flex min-h-9 items-center justify-center rounded-token-sm border border-[var(--border-subtle)] px-3 text-xs font-semibold text-[var(--text-primary)] disabled:opacity-50"
          >
            {busy === 'electron_csc_password' ? 'Saving…' : 'Save password'}
          </button>
        </div>
      </details>

      <details className="rounded-token-md border border-[var(--border-subtle)]">
        <summary className="cursor-pointer px-3 py-2.5 text-xs font-semibold text-[var(--text-primary)]">
          macOS notarization
        </summary>
        <div className="grid gap-2 border-t border-[var(--border-subtle)] p-3 sm:grid-cols-2">
          <input
            value={appleId}
            onChange={(event) => setAppleId(event.target.value)}
            placeholder="Apple ID"
            className="rounded-token-sm border border-[var(--border-subtle)] bg-[var(--background)] px-3 py-2.5 text-xs"
          />
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void saveField('electron_apple_id', appleId)}
            className="rounded-token-sm border border-[var(--border-subtle)] px-3 text-xs font-semibold text-[var(--text-primary)] disabled:opacity-50"
          >
            Save Apple ID
          </button>
          <input
            type="password"
            autoComplete="off"
            value={applePassword}
            onChange={(event) => setApplePassword(event.target.value)}
            placeholder="App-specific password"
            className="rounded-token-sm border border-[var(--border-subtle)] bg-[var(--background)] px-3 py-2.5 text-xs"
          />
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void saveField('electron_apple_password', applePassword)}
            className="rounded-token-sm border border-[var(--border-subtle)] px-3 text-xs font-semibold text-[var(--text-primary)] disabled:opacity-50"
          >
            Save app password
          </button>
          <input
            value={teamId}
            onChange={(event) => setTeamId(event.target.value)}
            placeholder="Apple Team ID"
            className="rounded-token-sm border border-[var(--border-subtle)] bg-[var(--background)] px-3 py-2.5 text-xs"
          />
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void saveField('electron_apple_team_id', teamId)}
            className="rounded-token-sm border border-[var(--border-subtle)] px-3 text-xs font-semibold text-[var(--text-primary)] disabled:opacity-50"
          >
            Save Team ID
          </button>
        </div>
      </details>

      <div className="rounded-token-md border border-[var(--border-subtle)] bg-[var(--surface-inset)] p-3">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-[var(--text-primary)]">GitHub Actions secret sync</p>
            <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
              Sync saved signing credentials to the selected repository without committing secrets to source control.
            </p>
            {!project?.githubRepoName ? (
              <input
                value={manualRepo}
                onChange={(event) => setManualRepo(event.target.value)}
                placeholder="owner/repo"
                className="mt-2 w-full rounded-token-sm border border-[var(--border-subtle)] bg-[var(--background)] px-3 py-2.5 text-xs"
              />
            ) : (
              <p className="mt-2 text-xs font-medium text-[var(--text-primary)]">{project.githubRepoName}</p>
            )}
            <button
              type="button"
              disabled={busy !== null || !repoName}
              onClick={() => void syncSecrets()}
              className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-token-sm bg-[var(--accent)] px-3 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy === 'sync' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
              Sync signing credentials
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DesktopPublishPanel({
  status,
  project,
  onStartWorkspace,
  onRefresh,
}: {
  status?: PublishStatus['desktop'];
  project?: PublishProject | null;
  onStartWorkspace: (prompt: string) => void;
  onRefresh: () => void;
}) {
  const githubConnected = Boolean(
    status?.githubConnected ?? status?.checklist.find((item) => item.id === 'github')?.done,
  );
  const cscSaved = Boolean(status?.cscSaved);
  const notarizationSaved = Boolean(status?.notarizationSaved);
  const projectLabel = project
    ? project.githubRepoName
      ? `${project.name} (${project.githubRepoName})`
      : project.name
    : 'the current project';

  return (
    <div className="space-y-5">
      <section className="rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Monitor className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">Desktop</h2>
              <PublishStatusBadge
                label={githubConnected ? 'Ready to package' : 'GitHub required'}
                tone={githubConnected ? 'success' : 'warning'}
              />
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
              Build the desktop package first. Signing and macOS notarization remain optional distribution steps.
            </p>
          </div>

          <button
            type="button"
            disabled={!githubConnected}
            onClick={() =>
              onStartWorkspace(
                `Build and package ${projectLabel} as an Electron desktop app. Produce the real desktop.zip artifact first. Use configured signing only when it is available and report unsigned output truthfully when it is not.`,
              )
            }
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-token-sm bg-[var(--accent)] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
          >
            Build desktop app
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 border-t border-[var(--border-subtle)]">
          <PublishRequirement
            item={{
              id: 'github',
              label: 'GitHub',
              done: githubConnected,
              required: true,
              hint: 'Required for source code and the package/release workflow.',
            }}
            pluginId="github"
            actionLabel="Connect"
          />
        </div>
      </section>

      <section className="rounded-token-lg border border-dashed border-[var(--border-subtle)] p-5">
        <p className="text-sm font-semibold text-[var(--text-primary)]">Package output</p>
        <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
          Xroga currently packages desktop output through the Workspace ship flow. Publish does not display an installer or ZIP until the real workflow produces it.
        </p>
      </section>

      <PublishDisclosure
        title="Code signing & notarization"
        description="Optional credentials for signed Windows/macOS distribution."
      >
        <DesktopSigningSetup
          cscSaved={cscSaved}
          notarizationSaved={notarizationSaved}
          project={project}
          onSaved={onRefresh}
        />
      </PublishDisclosure>

      <PublishDisclosure
        title="Advanced"
        description="Existing desktop packaging guidance."
      >
        <ul className="space-y-2 text-xs leading-5 text-[var(--text-secondary)]">
          {(status?.runSteps ?? []).map((step) => (
            <li key={step} className="flex gap-2">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
              <span>{step}</span>
            </li>
          ))}
        </ul>
      </PublishDisclosure>
    </div>
  );
}
