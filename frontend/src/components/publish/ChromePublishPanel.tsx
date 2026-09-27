'use client';

import { useState } from 'react';
import { ArrowRight, Check, ExternalLink, Loader2, Puzzle, Store } from 'lucide-react';
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

function ChromeStoreSetup({
  connected,
  onSaved,
}: {
  connected: boolean;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [extensionId, setExtensionId] = useState('');
  const [publisherId, setPublisherId] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [dashboardUrl, setDashboardUrl] = useState<string | null>(null);

  async function authorize() {
    if (!clientId.trim() || !clientSecret.trim() || !extensionId.trim() || !publisherId.trim()) {
      toast.error('Add the OAuth client, Extension ID and Publisher ID first');
      return;
    }

    setBusy('oauth');
    try {
      const redirectUri = `${window.location.origin}/dashboard/publish/cws/callback`;
      const result = await api.publish.startCwsOAuth({
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
        extensionId: extensionId.trim(),
        publisherId: publisherId.trim(),
        redirectUri,
      });

      if (!result.url) throw new Error(result.error || 'Could not start Chrome Web Store OAuth');
      window.location.href = result.url;
    } catch (error) {
      toast.error((error as Error).message);
      setBusy(null);
    }
  }

  async function saveManual() {
    if (
      !clientId.trim() ||
      !clientSecret.trim() ||
      !refreshToken.trim() ||
      !extensionId.trim() ||
      !publisherId.trim()
    ) {
      toast.error('Complete every manual Chrome Web Store credential field');
      return;
    }

    setBusy('manual');
    try {
      const result = await api.publish.saveCwsCredentials({
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
        refreshToken: refreshToken.trim(),
        extensionId: extensionId.trim(),
        publisherId: publisherId.trim(),
      });
      setClientSecret('');
      setRefreshToken('');
      toast.success(result.message || 'Chrome Web Store credentials saved');
      onSaved();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function checkStatus() {
    setBusy('status');
    try {
      const result = await api.publish.cwsStatus();
      setStatusMessage(result.message || result.status || 'Status loaded');
      setDashboardUrl(result.dashboardUrl || null);
      toast.success(result.message || 'Chrome Web Store status loaded');
    } catch (error) {
      setStatusMessage((error as Error).message);
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <PublishStatusBadge
          label={connected ? 'Connected' : 'Not configured'}
          tone={connected ? 'success' : 'neutral'}
        />
        {connected ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void checkStatus()}
            className="inline-flex min-h-9 items-center gap-2 rounded-token-sm border border-[var(--border-subtle)] px-3 text-xs font-semibold text-[var(--text-primary)] disabled:opacity-50"
          >
            {busy === 'status' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
            Check store status
          </button>
        ) : null}
      </div>

      {statusMessage ? (
        <div className="rounded-token-md border border-[var(--border-subtle)] bg-[var(--surface-inset)] p-3 text-xs leading-5 text-[var(--text-secondary)]">
          {statusMessage}
          {dashboardUrl ? (
            <a
              href={dashboardUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-2 inline-flex items-center gap-1 font-semibold text-[var(--accent)] hover:underline"
            >
              Open dashboard
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          ) : null}
        </div>
      ) : null}

      {!connected ? (
        <>
          <div className="rounded-token-md border border-[var(--border-subtle)] bg-[var(--surface-inset)] p-3">
            <p className="text-xs font-semibold text-[var(--text-primary)]">1. Create the store listing</p>
            <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
              Google requires the first listing setup in the Chrome Web Store dashboard. Xroga does not claim approval or publication until Google reports it.
            </p>
            <a
              href="https://chrome.google.com/webstore/devconsole"
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)] hover:underline"
            >
              Open Chrome Web Store
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </div>

          <div>
            <p className="text-xs font-semibold text-[var(--text-primary)]">2. Connect Google</p>
            <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
              Xroga uses your OAuth client and listing identifiers to obtain the refresh token needed for supported store submissions.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <input
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                placeholder="OAuth client ID"
                className="rounded-token-sm border border-[var(--border-subtle)] bg-[var(--background)] px-3 py-2.5 text-xs"
              />
              <input
                type="password"
                autoComplete="off"
                value={clientSecret}
                onChange={(event) => setClientSecret(event.target.value)}
                placeholder="OAuth client secret"
                className="rounded-token-sm border border-[var(--border-subtle)] bg-[var(--background)] px-3 py-2.5 text-xs"
              />
              <input
                value={extensionId}
                onChange={(event) => setExtensionId(event.target.value)}
                placeholder="Extension ID"
                className="rounded-token-sm border border-[var(--border-subtle)] bg-[var(--background)] px-3 py-2.5 text-xs"
              />
              <input
                value={publisherId}
                onChange={(event) => setPublisherId(event.target.value)}
                placeholder="Publisher ID"
                className="rounded-token-sm border border-[var(--border-subtle)] bg-[var(--background)] px-3 py-2.5 text-xs"
              />
            </div>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void authorize()}
              className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-token-sm bg-[var(--accent)] px-4 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy === 'oauth' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
              Connect Google
            </button>
          </div>

          <details className="rounded-token-md border border-[var(--border-subtle)]">
            <summary className="cursor-pointer px-3 py-2.5 text-xs font-semibold text-[var(--text-primary)]">
              Advanced / manual refresh token
            </summary>
            <div className="border-t border-[var(--border-subtle)] p-3">
              <input
                type="password"
                autoComplete="off"
                value={refreshToken}
                onChange={(event) => setRefreshToken(event.target.value)}
                placeholder="Refresh token"
                className="w-full rounded-token-sm border border-[var(--border-subtle)] bg-[var(--background)] px-3 py-2.5 text-xs"
              />
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void saveManual()}
                className="mt-2 inline-flex min-h-9 items-center rounded-token-sm border border-[var(--border-subtle)] px-3 text-xs font-semibold text-[var(--text-primary)] disabled:opacity-50"
              >
                {busy === 'manual' ? 'Saving…' : 'Save manual credentials'}
              </button>
            </div>
          </details>
        </>
      ) : null}
    </div>
  );
}

export function ChromePublishPanel({
  status,
  project,
  onStartWorkspace,
  onRefresh,
}: {
  status?: PublishStatus['chrome'];
  project?: PublishProject | null;
  onStartWorkspace: (prompt: string) => void;
  onRefresh: () => void;
}) {
  const githubConnected = Boolean(
    status?.githubConnected ?? status?.checklist.find((item) => item.id === 'github')?.done,
  );
  const cwsConnected = Boolean(status?.cwsConnected);
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
              <Puzzle className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">Chrome Extension</h2>
              <PublishStatusBadge
                label={githubConnected ? 'Ready to package' : 'GitHub required'}
                tone={githubConnected ? 'success' : 'warning'}
              />
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
              Package a Chrome MV3 extension first. Public Chrome Web Store distribution stays optional.
            </p>
          </div>

          <button
            type="button"
            disabled={!githubConnected}
            onClick={() =>
              onStartWorkspace(
                `Build and package ${projectLabel} as a Chrome Manifest V3 extension. Produce the real extension.zip artifact and report the download only after packaging succeeds.`,
              )
            }
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-token-sm bg-[var(--accent)] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
          >
            Build & package in Workspace
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
              hint: 'Required for the repository and packaged release flow.',
            }}
            pluginId="github"
            actionLabel="Connect"
          />
        </div>
      </section>

      <section className="rounded-token-lg border border-dashed border-[var(--border-subtle)] p-5">
        <p className="text-sm font-semibold text-[var(--text-primary)]">Package output</p>
        <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
          Packaging is performed from Workspace today. Publish does not invent an artifact before the Workspace ship flow returns one.
        </p>
        <ol className="mt-3 list-decimal space-y-1 pl-4 text-xs leading-5 text-[var(--text-muted)]">
          <li>Open chrome://extensions</li>
          <li>Enable Developer mode</li>
          <li>Load the unpacked extension, or use the generated ZIP for distribution</li>
        </ol>
      </section>

      <PublishDisclosure
        title="Chrome Web Store"
        description="Optional public distribution through your Google developer account."
      >
        <div className="mb-4 flex items-start gap-3 rounded-token-md border border-[var(--border-subtle)] bg-[var(--surface-inset)] p-3">
          <Store className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden="true" />
          <div>
            <p className="text-xs font-semibold text-[var(--text-primary)]">
              Store review is controlled by Google
            </p>
            <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
              Xroga can use the supported upload/submit path, but it never reports the extension as published unless the provider confirms that state.
            </p>
          </div>
        </div>
        <ChromeStoreSetup connected={cwsConnected} onSaved={onRefresh} />
      </PublishDisclosure>

      <PublishDisclosure
        title="Advanced"
        description="Existing packaging guidance and technical details."
      >
        <ul className="space-y-2 text-xs leading-5 text-[var(--text-secondary)]">
          {(status?.installSteps ?? []).map((step) => (
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
