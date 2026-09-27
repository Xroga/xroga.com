'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  ExternalLink,
  KeyRound,
  Loader2,
  RefreshCw,
  Smartphone,
} from 'lucide-react';
import toast from 'react-hot-toast';

import {
  PublishDisclosure,
  PublishRequirement,
  PublishStatusBadge,
} from '@/components/publish/PublishPrimitives';
import { api } from '@/lib/api';
import type {
  EasBuild,
  PublishStatus,
} from '@/lib/publish/types';

function buildTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  const normalized = status.toUpperCase();
  if (/FINISH|SUCCESS|COMPLETE/.test(normalized)) return 'success';
  if (/ERROR|FAIL|CANCEL/.test(normalized)) return 'danger';
  if (/QUEUE|PROGRESS|BUILD|PENDING|NEW/.test(normalized)) return 'warning';
  return 'neutral';
}

function isActiveBuild(status: string): boolean {
  return /NEW|QUEUE|IN_PROGRESS|BUILD|PENDING/i.test(status);
}

export function MobilePublishPanel({
  status,
  easProjectId: initialEasProjectId,
  onRefresh,
}: {
  status?: PublishStatus['mobile'];
  easProjectId?: string | null;
  onRefresh: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [expoToken, setExpoToken] = useState('');
  const [easProjectId, setEasProjectId] = useState(initialEasProjectId ?? '');
  const [expoApps, setExpoApps] = useState<Array<{ id: string; name: string; slug?: string }>>([]);
  const [builds, setBuilds] = useState<EasBuild[]>([]);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [googleJson, setGoogleJson] = useState('');
  const [appleKeyId, setAppleKeyId] = useState('');
  const [appleIssuerId, setAppleIssuerId] = useState('');
  const [applePrivateKey, setApplePrivateKey] = useState('');
  const [legacyApplePassword, setLegacyApplePassword] = useState('');
  const [confirmSubmit, setConfirmSubmit] = useState<'android' | 'ios' | null>(null);
  const [lastRunUrl, setLastRunUrl] = useState<string | null>(null);

  useEffect(() => {
    setEasProjectId(initialEasProjectId ?? '');
  }, [initialEasProjectId]);

  const loadApps = useCallback(async () => {
    if (!status?.expoTokenSaved) {
      setExpoApps([]);
      return;
    }

    try {
      const result = await api.publish.listExpoApps();
      setExpoApps(result.apps || []);
    } catch {
      setExpoApps([]);
    }
  }, [status?.expoTokenSaved]);

  const loadBuilds = useCallback(async () => {
    if (!status?.expoTokenSaved) {
      setBuilds([]);
      return;
    }

    try {
      const result = await api.publish.easBuilds();
      setBuilds(result.builds || []);
      setBuildError(null);
    } catch (error) {
      setBuildError((error as Error).message || 'Could not load Expo builds');
    }
  }, [status?.expoTokenSaved]);

  useEffect(() => {
    void loadApps();
    void loadBuilds();
  }, [loadApps, loadBuilds]);

  const hasActiveBuild = useMemo(
    () => builds.some((build) => isActiveBuild(build.status)),
    [builds],
  );

  useEffect(() => {
    if (!hasActiveBuild) return;

    const timer = window.setInterval(() => {
      void loadBuilds();
    }, 12_000);

    return () => window.clearInterval(timer);
  }, [hasActiveBuild, loadBuilds]);

  async function connectExpo() {
    const token = expoToken.trim();
    if (!token) {
      toast.error('Paste an Expo access token');
      return;
    }

    setBusy('expo');
    try {
      const result = await api.publish.saveExpoToken(token);
      setExpoToken('');
      if (result.easProjectId) setEasProjectId(result.easProjectId);
      toast.success(result.message || 'Expo connected');
      onRefresh();
      void loadApps();
      void loadBuilds();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function verifyExpo() {
    setBusy('verify-expo');
    try {
      const result = await api.publish.verifyExpo();
      toast.success(
        result.username ? `Expo verified as @${result.username}` : 'Expo token verified',
      );
      onRefresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function linkProject(projectId?: string) {
    const value = (projectId ?? easProjectId).trim();
    if (!value) {
      toast.error('Choose an Expo project first');
      return;
    }

    setBusy('eas-project');
    try {
      await api.publish.saveEasProject(value);
      setEasProjectId(value);
      toast.success('Expo project linked');
      onRefresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function startBuild(platform: 'android' | 'ios') {
    setBusy(`build-${platform}`);
    try {
      const result = await api.publish.easPublish({
        platform,
        projectId: easProjectId.trim() || undefined,
        submit: false,
      });
      if (result.url) setLastRunUrl(result.url);
      toast.success(result.message || `${platform} build started`);
      await loadBuilds();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function saveProvider(
    provider: 'google_play' | 'apple_asc_api' | 'apple_asc',
    value: string,
  ) {
    if (!value.trim()) {
      toast.error('Add the credential first');
      return;
    }

    setBusy(provider);
    try {
      await api.integrations.saveProviderKey(provider, value.trim());
      toast.success('Credential saved securely');
      if (provider === 'google_play') setGoogleJson('');
      if (provider === 'apple_asc_api') {
        setAppleKeyId('');
        setAppleIssuerId('');
        setApplePrivateKey('');
      }
      if (provider === 'apple_asc') setLegacyApplePassword('');
      onRefresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function saveAppleAsc() {
    if (!appleKeyId.trim() || !appleIssuerId.trim() || !applePrivateKey.trim()) {
      toast.error('Add Key ID, Issuer ID and the .p8 private key');
      return;
    }

    await saveProvider(
      'apple_asc_api',
      JSON.stringify({
        keyId: appleKeyId.trim(),
        issuerId: appleIssuerId.trim(),
        keyP8: applePrivateKey.trim(),
      }),
    );
  }

  async function syncStore(platform: 'android' | 'ios') {
    const key = platform === 'android' ? 'sync-play' : 'sync-apple';
    setBusy(key);
    try {
      const result =
        platform === 'android'
          ? await api.publish.syncPlayCredentials()
          : await api.publish.syncAppleCredentials();
      toast.success(result.message || 'Store credential synced to Expo');
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function submitToStore(platform: 'android' | 'ios') {
    setBusy(`submit-${platform}`);
    try {
      const result = await api.publish.easPublish({
        platform,
        projectId: easProjectId.trim() || undefined,
        submit: true,
      });
      if (result.url) setLastRunUrl(result.url);
      toast.success(result.message || 'Submission workflow started');
      setConfirmSubmit(null);
      await loadBuilds();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const githubConnected = Boolean(
    status?.checklist.find((item) => item.id === 'github')?.done,
  );
  const expoConnected = Boolean(status?.expoTokenSaved);
  const expoValid = status?.expoTokenValid === true;
  const ready = githubConnected && expoConnected && expoValid;
  const projectLinked = Boolean(status?.easProjectLinked || easProjectId);

  return (
    <div className="space-y-5">
      <section className="rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Smartphone className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">Mobile</h2>
              <PublishStatusBadge
                label={ready ? 'Ready to build' : 'Setup required'}
                tone={ready ? 'success' : 'warning'}
              />
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
              Connect Expo, link the real project, build Android or iOS, then add store credentials only when you are ready to submit.
            </p>
          </div>
        </div>

        <div className="mt-5 border-t border-[var(--border-subtle)]">
          <PublishRequirement
            item={{
              id: 'github',
              label: 'GitHub',
              done: githubConnected,
              required: true,
              hint: 'Required for the repository used by the Expo/EAS workflow.',
            }}
            pluginId="github"
            actionLabel="Connect"
          />
          <PublishRequirement
            item={{
              id: 'expo',
              label: 'Expo',
              done: expoConnected && expoValid,
              required: true,
              hint: !expoConnected
                ? 'Connect an Expo access token to start mobile builds.'
                : expoValid
                  ? 'Expo access is verified.'
                  : 'The saved Expo token needs attention.',
            }}
          />
          <PublishRequirement
            item={{
              id: 'eas-project',
              label: 'Expo project',
              done: projectLinked,
              required: false,
              hint: projectLinked
                ? 'An EAS project is linked.'
                : 'Xroga can auto-link/create when possible, or you can choose one below.',
            }}
          />
        </div>
      </section>

      {!expoConnected || !expoValid ? (
        <section className="rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
          <div className="flex items-start gap-3">
            <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                {expoConnected ? 'Expo needs attention' : 'Connect Expo'}
              </h3>
              <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                {expoConnected
                  ? 'The saved token is not currently verified. Verify again or replace it with a fresh access token.'
                  : 'Create an access token in Expo settings, paste it once, and Xroga will verify it before saving.'}
              </p>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  type="password"
                  autoComplete="off"
                  value={expoToken}
                  onChange={(event) => setExpoToken(event.target.value)}
                  placeholder="Expo access token"
                  className="min-w-0 flex-1 rounded-token-sm border border-[var(--border-subtle)] bg-[var(--background)] px-3 py-2.5 text-sm"
                />
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void connectExpo()}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-token-sm bg-[var(--accent)] px-4 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {busy === 'expo' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
                  {expoConnected ? 'Replace token' : 'Connect Expo'}
                </button>
                {expoConnected ? (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void verifyExpo()}
                    className="inline-flex min-h-10 items-center justify-center rounded-token-sm border border-[var(--border-subtle)] px-3 text-xs font-semibold text-[var(--text-primary)] disabled:opacity-50"
                  >
                    {busy === 'verify-expo' ? 'Checking…' : 'Verify again'}
                  </button>
                ) : null}
              </div>

              <a
                href="https://expo.dev/settings/access-tokens"
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)] hover:underline"
              >
                Create Expo access token
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>
      ) : null}

      {expoConnected ? (
        <PublishDisclosure
          title="Expo project"
          description={projectLinked ? 'Project linked and ready for supported EAS workflows.' : 'Choose the Expo project used for builds.'}
          open={!projectLinked}
        >
          {expoApps.length > 1 ? (
            <div className="space-y-2">
              <label htmlFor="expo-project-picker" className="text-xs font-semibold text-[var(--text-primary)]">
                Choose Expo project
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  id="expo-project-picker"
                  value={easProjectId}
                  onChange={(event) => setEasProjectId(event.target.value)}
                  className="min-w-0 flex-1 rounded-token-sm border border-[var(--border-subtle)] bg-[var(--background)] px-3 py-2.5 text-sm"
                >
                  <option value="">Choose project…</option>
                  {expoApps.map((app) => (
                    <option key={app.id} value={app.id}>
                      {app.name}{app.slug ? ` (@${app.slug})` : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={busy !== null || !easProjectId}
                  onClick={() => void linkProject()}
                  className="min-h-10 rounded-token-sm bg-[var(--accent)] px-4 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {busy === 'eas-project' ? 'Linking…' : 'Link selected project'}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs leading-5 text-[var(--text-secondary)]">
              {projectLinked
                ? 'The saved EAS project is linked. Use Advanced below only if you need to replace its project ID.'
                : expoApps.length === 1
                  ? 'One Expo project is available. Link it below, or Xroga may auto-link it during the supported flow.'
                  : 'No selectable projects were returned. Xroga may create/link a project when the supported flow allows it.'}
            </p>
          )}

          <details className="mt-4 rounded-token-md border border-[var(--border-subtle)]">
            <summary className="cursor-pointer px-3 py-2.5 text-xs font-semibold text-[var(--text-primary)]">
              Advanced · link by EAS project ID
            </summary>
            <div className="flex flex-col gap-2 border-t border-[var(--border-subtle)] p-3 sm:flex-row">
              <input
                value={easProjectId}
                onChange={(event) => setEasProjectId(event.target.value)}
                placeholder="EAS project UUID"
                className="min-w-0 flex-1 rounded-token-sm border border-[var(--border-subtle)] bg-[var(--background)] px-3 py-2.5 text-xs"
              />
              <button
                type="button"
                disabled={busy !== null || !easProjectId.trim()}
                onClick={() => void linkProject()}
                className="min-h-9 rounded-token-sm border border-[var(--border-subtle)] px-3 text-xs font-semibold text-[var(--text-primary)] disabled:opacity-50"
              >
                Save project ID
              </button>
            </div>
          </details>
        </PublishDisclosure>
      ) : null}

      <section className="rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[var(--text-primary)]">Build</h3>
            <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
              Development builds do not require Play/App Store credentials.
            </p>
          </div>
          {lastRunUrl ? (
            <a
              href={lastRunUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)] hover:underline"
            >
              Open latest workflow
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          ) : null}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {(['android', 'ios'] as const).map((platform) => (
            <div key={platform} className="rounded-token-md border border-[var(--border-subtle)] bg-[var(--surface-inset)] p-4">
              <p className="text-sm font-semibold capitalize text-[var(--text-primary)]">{platform}</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                {ready ? 'Ready to start an EAS build.' : 'Complete required mobile setup first.'}
              </p>
              <button
                type="button"
                disabled={!ready || busy !== null}
                onClick={() => void startBuild(platform)}
                className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-token-sm bg-[var(--accent)] px-4 text-xs font-semibold text-white disabled:opacity-45"
              >
                {busy === `build-${platform}` ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : null}
                Start {platform === 'ios' ? 'iOS' : 'Android'} build
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-token-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[var(--text-primary)]">Recent builds</h3>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">Real build states returned by Expo/EAS.</p>
          </div>
          <button
            type="button"
            onClick={() => void loadBuilds()}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-token-sm border border-[var(--border-subtle)] px-3 text-xs font-semibold text-[var(--text-primary)]"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Refresh
          </button>
        </div>

        {buildError ? (
          <p className="mt-3 text-xs text-amber-600">{buildError}</p>
        ) : builds.length ? (
          <div className="mt-4 divide-y divide-[var(--border-subtle)]">
            {builds.slice(0, 10).map((build) => (
              <div key={build.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold capitalize text-[var(--text-primary)]">
                    {build.platform || 'Mobile'} build
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[10px] text-[var(--text-muted)]">{build.id}</p>
                </div>
                <PublishStatusBadge label={build.status} tone={buildTone(build.status)} />
                {build.artifactUrl ? (
                  <a
                    href={build.artifactUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-semibold text-[var(--accent)] hover:underline"
                  >
                    Download
                  </a>
                ) : null}
                {build.buildDetailsPageUrl ? (
                  <a
                    href={build.buildDetailsPageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-semibold text-[var(--accent)] hover:underline"
                  >
                    View
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-xs leading-5 text-[var(--text-secondary)]">
            No Expo builds are available yet.
          </p>
        )}
      </section>

      <PublishDisclosure
        title="Store submission"
        description="Optional. Build first, then configure the store you actually want to submit to."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-token-md border border-[var(--border-subtle)] p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-semibold text-[var(--text-primary)]">Google Play</h4>
              <PublishStatusBadge
                label={status?.googlePlaySaved ? 'Credential saved' : 'Not configured'}
                tone={status?.googlePlaySaved ? 'success' : 'neutral'}
              />
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
              Save your service-account JSON, sync it to Expo, then submit through the supported EAS workflow. The first Play listing may still require Play Console setup.
            </p>
            <textarea
              rows={4}
              value={googleJson}
              onChange={(event) => setGoogleJson(event.target.value)}
              placeholder='{"type":"service_account", ...}'
              className="mt-3 w-full rounded-token-sm border border-[var(--border-subtle)] bg-[var(--background)] px-3 py-2.5 text-xs font-mono"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void saveProvider('google_play', googleJson)}
                className="min-h-9 rounded-token-sm border border-[var(--border-subtle)] px-3 text-xs font-semibold text-[var(--text-primary)] disabled:opacity-50"
              >
                {busy === 'google_play' ? 'Saving…' : status?.googlePlaySaved ? 'Replace credential' : 'Save credential'}
              </button>
              <button
                type="button"
                disabled={busy !== null || !status?.googlePlaySaved}
                onClick={() => void syncStore('android')}
                className="min-h-9 rounded-token-sm border border-[var(--border-subtle)] px-3 text-xs font-semibold text-[var(--text-primary)] disabled:opacity-50"
              >
                {busy === 'sync-play' ? 'Syncing…' : 'Sync to Expo'}
              </button>
              <a
                href="https://play.google.com/console"
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-9 items-center gap-1 rounded-token-sm border border-[var(--border-subtle)] px-3 text-xs font-semibold text-[var(--text-primary)]"
              >
                Play Console
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            </div>

            {confirmSubmit === 'android' ? (
              <div className="mt-3 rounded-token-md border border-amber-500/25 bg-amber-500/5 p-3">
                <p className="text-xs font-semibold text-[var(--text-primary)]">Submit Android build?</p>
                <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                  This starts the supported EAS submission workflow using your Google Play credentials. Google controls review, approval and provider fees.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void submitToStore('android')}
                    className="min-h-9 rounded-token-sm bg-[var(--accent)] px-3 text-xs font-semibold text-white"
                  >
                    {busy === 'submit-android' ? 'Submitting…' : 'Submit'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmSubmit(null)}
                    className="min-h-9 rounded-token-sm border border-[var(--border-subtle)] px-3 text-xs font-semibold text-[var(--text-primary)]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={!ready || !status?.googlePlaySaved || busy !== null}
                onClick={() => setConfirmSubmit('android')}
                className="mt-3 min-h-10 rounded-token-sm bg-[var(--accent)] px-4 text-xs font-semibold text-white disabled:opacity-45"
              >
                Submit Android to Google Play
              </button>
            )}
          </section>

          <section className="rounded-token-md border border-[var(--border-subtle)] p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-semibold text-[var(--text-primary)]">App Store</h4>
              <PublishStatusBadge
                label={status?.appleAscApiSaved ? 'ASC API configured' : 'Not configured'}
                tone={status?.appleAscApiSaved ? 'success' : 'neutral'}
              />
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">
              App Store Connect API is the preferred submission credential. Xroga stores it in the existing encrypted credential vault.
            </p>
            <div className="mt-3 grid gap-2">
              <input
                value={appleKeyId}
                onChange={(event) => setAppleKeyId(event.target.value)}
                placeholder="Key ID"
                className="rounded-token-sm border border-[var(--border-subtle)] bg-[var(--background)] px-3 py-2.5 text-xs"
              />
              <input
                value={appleIssuerId}
                onChange={(event) => setAppleIssuerId(event.target.value)}
                placeholder="Issuer ID"
                className="rounded-token-sm border border-[var(--border-subtle)] bg-[var(--background)] px-3 py-2.5 text-xs"
              />
              <textarea
                rows={4}
                value={applePrivateKey}
                onChange={(event) => setApplePrivateKey(event.target.value)}
                placeholder="Private key (.p8)"
                className="rounded-token-sm border border-[var(--border-subtle)] bg-[var(--background)] px-3 py-2.5 text-xs font-mono"
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void saveAppleAsc()}
                className="min-h-9 rounded-token-sm border border-[var(--border-subtle)] px-3 text-xs font-semibold text-[var(--text-primary)] disabled:opacity-50"
              >
                {busy === 'apple_asc_api' ? 'Saving…' : status?.appleAscApiSaved ? 'Replace ASC credential' : 'Save ASC credential'}
              </button>
              <button
                type="button"
                disabled={busy !== null || !status?.appleAscApiSaved}
                onClick={() => void syncStore('ios')}
                className="min-h-9 rounded-token-sm border border-[var(--border-subtle)] px-3 text-xs font-semibold text-[var(--text-primary)] disabled:opacity-50"
              >
                {busy === 'sync-apple' ? 'Syncing…' : 'Sync to Expo'}
              </button>
              <a
                href="https://appstoreconnect.apple.com/access/integrations/api"
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-9 items-center gap-1 rounded-token-sm border border-[var(--border-subtle)] px-3 text-xs font-semibold text-[var(--text-primary)]"
              >
                App Store Connect
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            </div>

            {confirmSubmit === 'ios' ? (
              <div className="mt-3 rounded-token-md border border-amber-500/25 bg-amber-500/5 p-3">
                <p className="text-xs font-semibold text-[var(--text-primary)]">Submit iOS build?</p>
                <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                  This starts the supported EAS submission workflow using your App Store Connect credentials. Apple controls review, approval and provider fees.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void submitToStore('ios')}
                    className="min-h-9 rounded-token-sm bg-[var(--accent)] px-3 text-xs font-semibold text-white"
                  >
                    {busy === 'submit-ios' ? 'Submitting…' : 'Submit'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmSubmit(null)}
                    className="min-h-9 rounded-token-sm border border-[var(--border-subtle)] px-3 text-xs font-semibold text-[var(--text-primary)]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={!ready || !status?.appleAscApiSaved || busy !== null}
                onClick={() => setConfirmSubmit('ios')}
                className="mt-3 min-h-10 rounded-token-sm bg-[var(--accent)] px-4 text-xs font-semibold text-white disabled:opacity-45"
              >
                Submit iOS to App Store
              </button>
            )}

            <details className="mt-4 rounded-token-md border border-[var(--border-subtle)]">
              <summary className="cursor-pointer px-3 py-2.5 text-xs font-semibold text-[var(--text-primary)]">
                Legacy Apple app-specific password
              </summary>
              <div className="border-t border-[var(--border-subtle)] p-3">
                <input
                  type="password"
                  autoComplete="off"
                  value={legacyApplePassword}
                  onChange={(event) => setLegacyApplePassword(event.target.value)}
                  placeholder="App-specific password"
                  className="w-full rounded-token-sm border border-[var(--border-subtle)] bg-[var(--background)] px-3 py-2.5 text-xs"
                />
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void saveProvider('apple_asc', legacyApplePassword)}
                  className="mt-2 min-h-9 rounded-token-sm border border-[var(--border-subtle)] px-3 text-xs font-semibold text-[var(--text-primary)] disabled:opacity-50"
                >
                  Save legacy credential
                </button>
              </div>
            </details>
          </section>
        </div>
      </PublishDisclosure>

      <PublishDisclosure
        title="Advanced"
        description="Technical information for the current mobile publishing workflow."
      >
        <div className="space-y-3 text-xs text-[var(--text-secondary)]">
          {easProjectId ? (
            <p>
              EAS project ID:{' '}
              <code className="font-mono text-[var(--text-primary)]">{easProjectId}</code>
            </p>
          ) : null}
          {(status?.commands ?? []).map((command) => (
            <p key={command} className="font-mono text-[11px] text-[var(--text-muted)]">
              {command}
            </p>
          ))}
          <p className="inline-flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden="true" />
            Store approval is external; Xroga reports only provider-returned workflow state.
          </p>
        </div>
      </PublishDisclosure>
    </div>
  );
}
