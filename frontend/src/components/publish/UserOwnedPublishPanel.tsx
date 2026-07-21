'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  Circle,
  ExternalLink,
  KeyRound,
  Loader2,
  Smartphone,
  Globe,
  Shield,
  Puzzle,
  Monitor,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { CustomDomainPanel } from '@/components/publish/CustomDomainPanel';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';

type ChecklistItem = {
  id: string;
  label: string;
  done: boolean;
  required: boolean;
  hint?: string;
  href?: string;
};

type PublishStatus = {
  web: { ready: boolean; checklist: ChecklistItem[] };
  chrome?: {
    ready: boolean;
    cwsConnected?: boolean;
    checklist: ChecklistItem[];
    installSteps: string[];
  };
  desktop?: {
    ready: boolean;
    cscSaved?: boolean;
    notarizationSaved?: boolean;
    checklist: ChecklistItem[];
    runSteps: string[];
  };
  mobile: {
    ready: boolean;
    expoTokenSaved: boolean;
    expoTokenValid: boolean | null;
    appleSaved: boolean;
    appleAscApiSaved?: boolean;
    googlePlaySaved: boolean;
    easProjectLinked?: boolean;
    checklist: ChecklistItem[];
    commands: string[];
  };
  costs: { xrogaPays: string[]; userPays: string[] };
};

function StepRow({ item }: { item: ChecklistItem }) {
  const external = item.href?.startsWith('http');
  return (
    <li className="flex items-start gap-2.5 py-2 border-b border-[var(--card-border)] last:border-0">
      {item.done ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
      ) : (
        <Circle className="w-4 h-4 text-[var(--muted)] shrink-0 mt-0.5" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--foreground)]">
          {item.label}
          {!item.required && (
            <span className="ml-1.5 text-[10px] uppercase tracking-wide text-[var(--muted)]">
              optional
            </span>
          )}
        </p>
        {item.hint ? <p className="text-xs text-[var(--muted)] mt-0.5">{item.hint}</p> : null}
        {item.href ? (
          external ? (
            <a
              href={item.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-[var(--accent)] mt-1 hover:underline"
            >
              Open <ExternalLink className="w-3 h-3" />
            </a>
          ) : (
            <Link
              href={item.href}
              className="inline-flex items-center gap-1 text-[11px] text-[var(--accent)] mt-1 hover:underline"
            >
              Go
            </Link>
          )
        ) : null}
      </div>
    </li>
  );
}

function CwsCredentialsForm({ connected, onSaved }: { connected?: boolean; onSaved: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [extensionId, setExtensionId] = useState('');
  const [publisherId, setPublisherId] = useState('');
  const [redirectHint, setRedirectHint] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  async function authorize() {
    if (!clientId.trim() || !clientSecret.trim() || !extensionId.trim() || !publisherId.trim()) {
      toast.error('Fill client ID/secret + extension ID + publisher ID first');
      return;
    }
    setBusy('oauth');
    try {
      const redirectUri = `${window.location.origin}/dashboard/publish/cws/callback`;
      const res = await api.publish.startCwsOAuth({
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
        extensionId: extensionId.trim(),
        publisherId: publisherId.trim(),
        redirectUri,
      });
      if (!res.url) throw new Error(res.error || 'Could not start CWS OAuth');
      setRedirectHint(res.redirectUri || redirectUri);
      toast.success(res.hint || 'Opening Google…');
      window.location.href = res.url;
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(null);
    }
  }

  async function savePaste() {
    if (
      !clientId.trim() ||
      !clientSecret.trim() ||
      !refreshToken.trim() ||
      !extensionId.trim() ||
      !publisherId.trim()
    ) {
      toast.error('Fill all Chrome Web Store fields');
      return;
    }
    setBusy('save');
    try {
      const res = await api.publish.saveCwsCredentials({
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
        refreshToken: refreshToken.trim(),
        extensionId: extensionId.trim(),
        publisherId: publisherId.trim(),
      });
      toast.success(res.message || 'CWS credentials saved');
      setClientSecret('');
      setRefreshToken('');
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function checkStatus() {
    setBusy('status');
    try {
      const res = await api.publish.cwsStatus();
      setStatusMsg(res.message || res.status || 'No status');
      if (res.dashboardUrl) {
        toast.success(res.message || 'Status loaded');
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-[var(--card-border)] p-3 space-y-2">
      <p className="text-sm font-semibold">
        Chrome Web Store submit (real API)
        {connected ? (
          <span className="ml-2 text-[10px] uppercase tracking-wide text-emerald-600">connected</span>
        ) : null}
      </p>
      <p className="text-[11px] text-[var(--muted)] leading-relaxed">
        Pay ~$5 once at the{' '}
        <a
          className="text-[var(--accent)] hover:underline"
          href="https://chrome.google.com/webstore/devconsole"
          target="_blank"
          rel="noreferrer"
        >
          CWS developer dashboard
        </a>
        , create the extension listing once, enable Chrome Web Store API in Google Cloud, create an
        OAuth client, and add redirect URI{' '}
        <code className="font-mono text-[10px]">
          {typeof window !== 'undefined'
            ? `${window.location.origin}/dashboard/publish/cws/callback`
            : '/dashboard/publish/cws/callback'}
        </code>
        . Prefer Authorize Google (gets refresh token) — or paste a refresh token manually.
      </p>
      <div className="grid sm:grid-cols-2 gap-2">
        <input
          placeholder="OAuth client ID"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="rounded-md border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-xs font-mono"
        />
        <input
          type="password"
          placeholder="OAuth client secret"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          className="rounded-md border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-xs font-mono"
        />
        <input
          placeholder="Extension ID"
          value={extensionId}
          onChange={(e) => setExtensionId(e.target.value)}
          className="rounded-md border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-xs font-mono"
        />
        <input
          placeholder="Publisher ID"
          value={publisherId}
          onChange={(e) => setPublisherId(e.target.value)}
          className="rounded-md border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-xs font-mono"
        />
        <input
          type="password"
          placeholder="Refresh token (optional if using Authorize)"
          value={refreshToken}
          onChange={(e) => setRefreshToken(e.target.value)}
          className="rounded-md border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-xs font-mono sm:col-span-2"
        />
      </div>
      {redirectHint ? (
        <p className="text-[10px] text-[var(--muted)] font-mono break-all">Redirect: {redirectHint}</p>
      ) : null}
      {statusMsg ? <p className="text-[11px] text-[var(--muted)]">{statusMsg}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void authorize()}
          className="rounded-md bg-[var(--accent)] text-white px-3 py-2 text-xs font-bold disabled:opacity-60"
        >
          {busy === 'oauth' ? 'Opening…' : 'Authorize Google'}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void savePaste()}
          className="rounded-md border border-[var(--card-border)] px-3 py-2 text-xs font-semibold disabled:opacity-60"
        >
          {busy === 'save' ? 'Saving…' : 'Save pasted token'}
        </button>
        {connected ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void checkStatus()}
            className="rounded-md border border-[var(--card-border)] px-3 py-2 text-xs font-semibold disabled:opacity-60"
          >
            {busy === 'status' ? 'Checking…' : 'Check CWS status'}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ElectronSecretsForm({
  cscSaved,
  notarizationSaved,
  onSaved,
}: {
  cscSaved?: boolean;
  notarizationSaved?: boolean;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [cscLink, setCscLink] = useState('');
  const [cscPass, setCscPass] = useState('');
  const [appleId, setAppleId] = useState('');
  const [applePass, setApplePass] = useState('');
  const [teamId, setTeamId] = useState('');
  const [repo, setRepo] = useState('');

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
      toast.error('Paste a value first');
      return;
    }
    setBusy(provider);
    try {
      await api.integrations.saveProviderKey(provider, value.trim());
      toast.success('Saved to vault');
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function syncToGitHub() {
    if (!repo.trim() || !repo.includes('/')) {
      toast.error('Enter owner/repo (e.g. you/my-desktop-app)');
      return;
    }
    setBusy('sync');
    try {
      const res = await api.publish.syncElectronSecrets(repo.trim());
      toast.success(res.message || 'Synced');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-[var(--card-border)] p-3 space-y-3">
      <p className="text-sm font-semibold">
        Code signing &amp; notarization
        {cscSaved ? (
          <span className="ml-2 text-[10px] uppercase tracking-wide text-emerald-600">CSC saved</span>
        ) : null}
        {notarizationSaved ? (
          <span className="ml-2 text-[10px] uppercase tracking-wide text-emerald-600">
            notarization saved
          </span>
        ) : null}
      </p>
      <p className="text-[11px] text-[var(--muted)] leading-relaxed">
        Optional. Without these, Actions still produce unsigned Linux/Windows installers. With CSC +
        Apple ID secrets, electron-builder can sign and notarize macOS builds. Secrets sync to your
        GitHub repo Actions — never committed to git.
      </p>
      <div className="grid sm:grid-cols-2 gap-2">
        <input
          type="password"
          placeholder="CSC_LINK (base64 p12)"
          value={cscLink}
          onChange={(e) => setCscLink(e.target.value)}
          className="rounded-md border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-xs font-mono sm:col-span-2"
        />
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void saveField('electron_csc_link', cscLink)}
          className="rounded-md border border-[var(--card-border)] px-3 py-1.5 text-xs font-semibold"
        >
          Save CSC_LINK
        </button>
        <input
          type="password"
          placeholder="CSC_KEY_PASSWORD"
          value={cscPass}
          onChange={(e) => setCscPass(e.target.value)}
          className="rounded-md border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-xs font-mono"
        />
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void saveField('electron_csc_password', cscPass)}
          className="rounded-md border border-[var(--card-border)] px-3 py-1.5 text-xs font-semibold"
        >
          Save CSC password
        </button>
        <input
          placeholder="Apple ID (notarization)"
          value={appleId}
          onChange={(e) => setAppleId(e.target.value)}
          className="rounded-md border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-xs font-mono"
        />
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void saveField('electron_apple_id', appleId)}
          className="rounded-md border border-[var(--card-border)] px-3 py-1.5 text-xs font-semibold"
        >
          Save Apple ID
        </button>
        <input
          type="password"
          placeholder="Apple app-specific password"
          value={applePass}
          onChange={(e) => setApplePass(e.target.value)}
          className="rounded-md border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-xs font-mono"
        />
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void saveField('electron_apple_password', applePass)}
          className="rounded-md border border-[var(--card-border)] px-3 py-1.5 text-xs font-semibold"
        >
          Save app password
        </button>
        <input
          placeholder="Apple Team ID"
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          className="rounded-md border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-xs font-mono"
        />
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void saveField('electron_apple_team_id', teamId)}
          className="rounded-md border border-[var(--card-border)] px-3 py-1.5 text-xs font-semibold"
        >
          Save Team ID
        </button>
      </div>
      <div className="flex flex-col sm:flex-row gap-2 pt-1">
        <input
          placeholder="GitHub owner/repo to sync secrets"
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          className="flex-1 rounded-md border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-xs font-mono"
        />
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void syncToGitHub()}
          className="rounded-md bg-[var(--accent)] text-white px-3 py-2 text-xs font-bold disabled:opacity-60"
        >
          {busy === 'sync' ? 'Syncing…' : 'Sync to GitHub Actions'}
        </button>
      </div>
    </div>
  );
}

export function UserOwnedPublishPanel({ compact }: { compact?: boolean }) {
  const router = useRouter();
  const setChatPrefill = useAppStore((s) => s.setChatPrefill);
  const [status, setStatus] = useState<PublishStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'web' | 'chrome' | 'desktop' | 'mobile'>('web');
  const [expoToken, setExpoToken] = useState('');
  const [applePass, setApplePass] = useState('');
  const [appleAscJson, setAppleAscJson] = useState('');
  const [googleJson, setGoogleJson] = useState('');
  const [easProjectId, setEasProjectId] = useState('');
  const [expoApps, setExpoApps] = useState<Array<{ id: string; name: string; slug?: string }>>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastRunUrl, setLastRunUrl] = useState<string | null>(null);
  const [easBuilds, setEasBuilds] = useState<
    Array<{
      id: string;
      status: string;
      platform?: string;
      artifactUrl?: string;
      buildDetailsPageUrl?: string;
    }>
  >([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.publish.status();
      setStatus(res);
      if (res.easProjectId) setEasProjectId(res.easProjectId);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const cws = params.get('cws');
    const tabParam = params.get('tab');
    if (tabParam === 'chrome' || tabParam === 'desktop' || tabParam === 'mobile' || tabParam === 'web') {
      setTab(tabParam);
    } else if (cws) {
      setTab('chrome');
    }
    if (cws === 'connected') {
      toast.success('Chrome Web Store OAuth connected');
      void refresh();
    } else if (cws === 'error') {
      toast.error(params.get('message') || 'CWS OAuth failed');
    }
  }, [refresh]);

  async function loadExpoApps() {
    try {
      const res = await api.publish.listExpoApps();
      setExpoApps(res.apps || []);
    } catch {
      setExpoApps([]);
    }
  }

  useEffect(() => {
    if (tab === 'mobile' && status?.mobile.expoTokenSaved) {
      void loadExpoApps();
    }
  }, [tab, status?.mobile.expoTokenSaved]);

  async function saveExpo() {
    const token = expoToken.trim();
    if (!token) {
      toast.error('Paste your Expo access token');
      return;
    }
    setBusy('expo');
    try {
      const res = await api.publish.saveExpoToken(token);
      toast.success(res.message || `Expo connected${res.username ? ` as @${res.username}` : ''}`);
      if (res.easProjectId) setEasProjectId(res.easProjectId);
      setExpoToken('');
      await refresh();
      void loadExpoApps();
      if (res.needsProjectPick) {
        toast('Multiple Expo apps found — pick one below');
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function saveProvider(
    provider: 'apple_asc' | 'apple_asc_api' | 'google_play',
    value: string,
  ) {
    if (!value.trim()) {
      toast.error('Paste the credential first');
      return;
    }
    setBusy(provider);
    try {
      await api.integrations.saveProviderKey(provider, value.trim());
      toast.success(
        provider === 'google_play'
          ? 'Google Play JSON encrypted in your vault'
          : provider === 'apple_asc_api'
            ? 'Apple ASC API key encrypted in your vault'
            : 'Apple credential encrypted in your vault',
      );
      if (provider === 'apple_asc') setApplePass('');
      if (provider === 'apple_asc_api') setAppleAscJson('');
      if (provider === 'google_play') setGoogleJson('');
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function saveEasProject() {
    const id = easProjectId.trim();
    if (!id) {
      toast.error('Paste EAS project ID from expo.dev');
      return;
    }
    setBusy('eas-project');
    try {
      await api.publish.saveEasProject(id);
      toast.success('EAS project linked');
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function publishPlatform(platform: 'android' | 'ios') {
    setBusy(`publish-${platform}`);
    try {
      const res = await api.publish.easPublish({
        platform,
        projectId: easProjectId.trim() || undefined,
        submit: true,
      });
      if (res.url) setLastRunUrl(res.url);
      toast.success(res.message || `${platform} EAS workflow started`);
      void loadBuilds();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function syncPlay() {
    setBusy('sync-play');
    try {
      const res = await api.publish.syncPlayCredentials();
      toast.success(res.message || 'Play credentials synced to Expo');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function syncApple() {
    setBusy('sync-apple');
    try {
      const res = await api.publish.syncAppleCredentials();
      toast.success(res.message || 'Apple ASC synced to Expo');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function loadBuilds() {
    try {
      const res = await api.publish.easBuilds();
      setEasBuilds(res.builds || []);
    } catch {
      setEasBuilds([]);
    }
  }

  function startInWorkspace(prompt: string) {
    setChatPrefill(prompt);
    router.push('/workspace');
  }

  useEffect(() => {
    if (tab === 'mobile' && status?.mobile.ready) {
      void loadBuilds();
    }
  }, [tab, status?.mobile.ready]);

  if (loading && !status) {
    return (
      <div className="rounded-2xl border border-[var(--card-border)] p-6 flex items-center gap-2 text-sm text-[var(--muted)]">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading publish status…
      </div>
    );
  }

  return (
    <section
      className={cn(
        'rounded-2xl border border-[var(--card-border)] bg-[var(--card)]/40',
        compact ? 'p-4' : 'p-5 sm:p-6',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
            Publish
          </p>
          <h2 className="text-lg sm:text-xl font-bold mt-1">Ship on your accounts</h2>
          <p className="text-sm text-[var(--muted)] mt-1 max-w-2xl">
            <strong>Web:</strong> GitHub + Vercel → live URL. <strong>Chrome / Desktop:</strong>{' '}
            GitHub → downloadable zip on ship; optional real store/signing paths below.{' '}
            <strong>Mobile:</strong> Expo + EAS — Sync Play/Apple pushes vault creds into Expo.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1 rounded-full border border-[var(--card-border)] p-1 text-xs">
          {(
            [
              ['web', 'Web', Globe],
              ['chrome', 'Chrome', Puzzle],
              ['desktop', 'Desktop', Monitor],
              ['mobile', 'Mobile', Smartphone],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full font-semibold transition',
                tab === id ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)]',
              )}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2 text-[11px]">
        <span
          className={cn(
            'px-2.5 py-1 rounded-full border font-semibold',
            status?.web.ready
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600'
              : 'border-[var(--card-border)] text-[var(--muted)]',
          )}
        >
          Web {status?.web.ready ? 'ready' : 'setup'}
        </span>
        <span
          className={cn(
            'px-2.5 py-1 rounded-full border font-semibold',
            status?.chrome?.ready
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600'
              : 'border-[var(--card-border)] text-[var(--muted)]',
          )}
        >
          Chrome {status?.chrome?.cwsConnected ? 'CWS' : status?.chrome?.ready ? 'ready' : 'GitHub'}
        </span>
        <span
          className={cn(
            'px-2.5 py-1 rounded-full border font-semibold',
            status?.desktop?.ready
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600'
              : 'border-[var(--card-border)] text-[var(--muted)]',
          )}
        >
          Desktop {status?.desktop?.ready ? 'ready' : 'GitHub'}
        </span>
        <span
          className={cn(
            'px-2.5 py-1 rounded-full border font-semibold',
            status?.mobile.ready
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600'
              : 'border-[var(--card-border)] text-[var(--muted)]',
          )}
        >
          Mobile {status?.mobile.ready ? 'ready' : 'setup'}
        </span>
      </div>

      {tab === 'web' ? (
        <div className="space-y-3">
          <ul className="rounded-xl border border-[var(--card-border)] bg-[var(--background)]/40 px-3">
            {(status?.web.checklist ?? []).map((item) => (
              <StepRow key={item.id} item={item} />
            ))}
          </ul>
          <p className="text-xs text-[var(--muted)]">
            After connect: chat “build a landing page…” → Xroga pushes GitHub and deploys to{' '}
            <strong>your</strong> Vercel.
          </p>
          <CustomDomainPanel />
          <Link
            href="/dashboard/integrations"
            className="inline-flex text-sm font-semibold text-[var(--accent)] hover:underline"
          >
            Open ship setup →
          </Link>
        </div>
      ) : tab === 'chrome' ? (
        <div className="space-y-3">
          <ul className="rounded-xl border border-[var(--card-border)] bg-[var(--background)]/40 px-3">
            {(status?.chrome?.checklist ?? []).map((item) => (
              <StepRow key={item.id} item={item} />
            ))}
          </ul>
          <ol className="rounded-xl border border-[var(--card-border)] bg-[var(--background)]/40 px-4 py-3 space-y-1.5 text-xs list-decimal list-inside">
            {(status?.chrome?.installSteps ?? []).map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <CwsCredentialsForm
            connected={status?.chrome?.cwsConnected}
            onSaved={() => void refresh()}
          />
          <button
            type="button"
            onClick={() =>
              startInWorkspace('Build a Chrome MV3 extension that ')
            }
            className="inline-flex text-sm font-semibold text-[var(--accent)] hover:underline"
          >
            Build an extension in Workspace →
          </button>
        </div>
      ) : tab === 'desktop' ? (
        <div className="space-y-3">
          <ul className="rounded-xl border border-[var(--card-border)] bg-[var(--background)]/40 px-3">
            {(status?.desktop?.checklist ?? []).map((item) => (
              <StepRow key={item.id} item={item} />
            ))}
          </ul>
          <ol className="rounded-xl border border-[var(--card-border)] bg-[var(--background)]/40 px-4 py-3 space-y-1.5 text-xs list-decimal list-inside">
            {(status?.desktop?.runSteps ?? []).map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <ElectronSecretsForm
            cscSaved={status?.desktop?.cscSaved}
            notarizationSaved={status?.desktop?.notarizationSaved}
            onSaved={() => void refresh()}
          />
          <button
            type="button"
            onClick={() =>
              startInWorkspace('Build an Electron desktop app for ')
            }
            className="inline-flex text-sm font-semibold text-[var(--accent)] hover:underline"
          >
            Build a desktop app in Workspace →
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5 text-xs text-[var(--foreground)] leading-relaxed">
            <strong>One Expo token:</strong> we verify it, auto-link or create an EAS project, stamp{' '}
            <code className="font-mono">app.json</code>, and start an Android build on the next mobile
            ship. Sync Play / Apple ASC pushes vault credentials into Expo via real GraphQL. Store
            approval is still Apple/Google’s.
          </div>
          <ul className="rounded-xl border border-[var(--card-border)] bg-[var(--background)]/40 px-3">
            {(status?.mobile.checklist ?? []).map((item) => (
              <StepRow key={item.id} item={item} />
            ))}
          </ul>

          <div className="rounded-xl border border-[var(--card-border)] p-3 space-y-2">
            <p className="text-sm font-semibold flex items-center gap-1.5">
              <KeyRound className="w-4 h-4" /> Connect Expo account
            </p>
            <p className="text-xs text-[var(--muted)]">
              Create a free token at{' '}
              <a
                className="text-[var(--accent)] hover:underline"
                href="https://expo.dev/settings/access-tokens"
                target="_blank"
                rel="noreferrer"
              >
                expo.dev/settings/access-tokens
              </a>
              . Encrypted in your vault — never committed to GitHub.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="password"
                autoComplete="off"
                placeholder="Expo access token"
                value={expoToken}
                onChange={(e) => setExpoToken(e.target.value)}
                className="flex-1 min-w-0 rounded-md border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm font-mono"
              />
              <button
                type="button"
                disabled={busy === 'expo'}
                onClick={() => void saveExpo()}
                className="shrink-0 rounded-md bg-[var(--accent)] text-white px-3 py-2 text-xs font-bold disabled:opacity-60"
              >
                {busy === 'expo' ? 'Connecting…' : 'Connect Expo'}
              </button>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <input
                placeholder="EAS project ID (auto if zero or one app)"
                value={easProjectId}
                onChange={(e) => setEasProjectId(e.target.value)}
                className="flex-1 min-w-0 rounded-md border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm font-mono"
              />
              <button
                type="button"
                disabled={busy === 'eas-project'}
                onClick={() => void saveEasProject()}
                className="shrink-0 rounded-md border border-[var(--card-border)] px-3 py-2 text-xs font-semibold disabled:opacity-60"
              >
                {busy === 'eas-project' ? 'Saving…' : 'Link project'}
              </button>
            </div>
            {expoApps.length > 1 ? (
              <div className="space-y-1.5 pt-1">
                <p className="text-[11px] text-[var(--muted)]">
                  Multiple Expo apps on this account — select one to link:
                </p>
                <select
                  className="w-full rounded-md border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-xs"
                  value={easProjectId}
                  onChange={(e) => {
                    setEasProjectId(e.target.value);
                  }}
                >
                  <option value="">Pick an Expo app…</option>
                  {expoApps.map((app) => (
                    <option key={app.id} value={app.id}>
                      {app.name}
                      {app.slug ? ` (@${app.slug})` : ''} — {app.id.slice(0, 8)}…
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={busy === 'eas-project' || !easProjectId.trim()}
                  onClick={() => void saveEasProject()}
                  className="rounded-md bg-[var(--accent)] text-white px-3 py-1.5 text-xs font-bold disabled:opacity-50"
                >
                  Link selected app
                </button>
              </div>
            ) : null}
            {status?.mobile.easProjectLinked ? (
              <p className="text-[11px] text-emerald-600 font-semibold">EAS project linked</p>
            ) : null}
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-[var(--card-border)] p-3 space-y-2">
              <p className="text-sm font-semibold">Google Play (optional)</p>
              <p className="text-[11px] text-[var(--muted)]">
                Save service-account JSON, then Sync to Expo for real Play submit.
              </p>
              <textarea
                rows={3}
                placeholder='{"type":"service_account",...}'
                value={googleJson}
                onChange={(e) => setGoogleJson(e.target.value)}
                className="w-full rounded-md border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-xs font-mono"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy === 'google_play'}
                  onClick={() => void saveProvider('google_play', googleJson)}
                  className="rounded-md border border-[var(--card-border)] px-3 py-1.5 text-xs font-semibold"
                >
                  {busy === 'google_play'
                    ? 'Saving…'
                    : status?.mobile.googlePlaySaved
                      ? 'Replace JSON'
                      : 'Save JSON'}
                </button>
                <button
                  type="button"
                  disabled={busy === 'sync-play' || !status?.mobile.googlePlaySaved}
                  onClick={() => void syncPlay()}
                  className="rounded-md border border-[var(--card-border)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                >
                  {busy === 'sync-play' ? 'Syncing…' : 'Sync to Expo'}
                </button>
                <button
                  type="button"
                  disabled={busy === 'publish-android' || !status?.mobile.ready}
                  onClick={() => void publishPlatform('android')}
                  className="rounded-md bg-[var(--accent)] text-white px-3 py-1.5 text-xs font-bold disabled:opacity-50"
                >
                  {busy === 'publish-android' ? 'Starting…' : 'Start Android EAS'}
                </button>
              </div>
            </div>
            <div className="rounded-xl border border-[var(--card-border)] p-3 space-y-2">
              <p className="text-sm font-semibold">Apple App Store (optional)</p>
              <p className="text-[11px] text-[var(--muted)]">
                Prefer ASC API key JSON {'{ keyId, issuerId, keyP8 }'} — Sync to Expo attaches it for
                iOS submit.
              </p>
              <textarea
                rows={3}
                placeholder='{"keyId":"...","issuerId":"...","keyP8":"-----BEGIN PRIVATE KEY-----\\n..."}'
                value={appleAscJson}
                onChange={(e) => setAppleAscJson(e.target.value)}
                className="w-full rounded-md border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-xs font-mono"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy === 'apple_asc_api'}
                  onClick={() => void saveProvider('apple_asc_api', appleAscJson)}
                  className="rounded-md border border-[var(--card-border)] px-3 py-1.5 text-xs font-semibold"
                >
                  {busy === 'apple_asc_api'
                    ? 'Saving…'
                    : status?.mobile.appleAscApiSaved
                      ? 'Replace ASC JSON'
                      : 'Save ASC JSON'}
                </button>
                <button
                  type="button"
                  disabled={busy === 'sync-apple' || !status?.mobile.appleAscApiSaved}
                  onClick={() => void syncApple()}
                  className="rounded-md border border-[var(--card-border)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                >
                  {busy === 'sync-apple' ? 'Syncing…' : 'Sync to Expo'}
                </button>
                <button
                  type="button"
                  disabled={busy === 'publish-ios' || !status?.mobile.ready}
                  onClick={() => void publishPlatform('ios')}
                  className="rounded-md bg-[var(--accent)] text-white px-3 py-1.5 text-xs font-bold disabled:opacity-50"
                >
                  {busy === 'publish-ios' ? 'Starting…' : 'Start iOS EAS'}
                </button>
              </div>
              <input
                type="password"
                placeholder="Legacy: Apple app-specific password"
                value={applePass}
                onChange={(e) => setApplePass(e.target.value)}
                className="w-full rounded-md border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm font-mono"
              />
              <button
                type="button"
                disabled={busy === 'apple_asc'}
                onClick={() => void saveProvider('apple_asc', applePass)}
                className="rounded-md border border-[var(--card-border)] px-3 py-1.5 text-xs font-semibold"
              >
                {busy === 'apple_asc' ? 'Saving…' : 'Save app password'}
              </button>
            </div>
          </div>

          {lastRunUrl ? (
            <p className="text-xs">
              Last EAS run:{' '}
              <a
                href={lastRunUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--accent)] font-semibold hover:underline"
              >
                Open on expo.dev
              </a>
            </p>
          ) : null}

          {easBuilds.length > 0 ? (
            <div className="rounded-xl border border-[var(--card-border)] p-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">Recent EAS builds</p>
                <button
                  type="button"
                  className="text-[11px] text-[var(--accent)] font-semibold"
                  onClick={() => void loadBuilds()}
                >
                  Refresh
                </button>
              </div>
              <ul className="space-y-1 text-xs text-[var(--muted)]">
                {easBuilds.slice(0, 6).map((b) => (
                  <li key={b.id} className="flex flex-wrap gap-x-2">
                    <span className="font-mono">{b.platform || '—'}</span>
                    <span>{b.status}</span>
                    {b.artifactUrl || b.buildDetailsPageUrl ? (
                      <a
                        href={b.artifactUrl || b.buildDetailsPageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[var(--accent)] hover:underline"
                      >
                        open
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <details className="rounded-xl border border-[var(--card-border)] p-3">
            <summary className="text-sm font-semibold cursor-pointer">Advanced: CLI commands</summary>
            <pre className="mt-2 text-[11px] font-mono text-[var(--muted)] whitespace-pre-wrap leading-relaxed">
              {(status?.mobile.commands ?? []).join('\n')}
            </pre>
          </details>
        </div>
      )}

      <div className="mt-5 grid sm:grid-cols-2 gap-3">
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-600 flex items-center gap-1">
            <Shield className="w-3.5 h-3.5" /> Xroga includes
          </p>
          <ul className="mt-2 space-y-1 text-xs text-[var(--muted)]">
            {(status?.costs.xrogaPays ?? []).map((line) => (
              <li key={line}>• {line}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-[var(--card-border)] p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--foreground)]">
            You pay (your accounts)
          </p>
          <ul className="mt-2 space-y-1 text-xs text-[var(--muted)]">
            {(status?.costs.userPays ?? []).map((line) => (
              <li key={line}>• {line}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
