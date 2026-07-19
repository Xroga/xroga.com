'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Circle,
  ExternalLink,
  KeyRound,
  Loader2,
  Smartphone,
  Globe,
  Shield,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

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
  mobile: {
    ready: boolean;
    expoTokenSaved: boolean;
    expoTokenValid: boolean | null;
    appleSaved: boolean;
    googlePlaySaved: boolean;
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

export function UserOwnedPublishPanel({ compact }: { compact?: boolean }) {
  const [status, setStatus] = useState<PublishStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'web' | 'mobile'>('web');
  const [expoToken, setExpoToken] = useState('');
  const [applePass, setApplePass] = useState('');
  const [googleJson, setGoogleJson] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.publish.status();
      setStatus(res);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
      setExpoToken('');
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function verifyExpo() {
    setBusy('verify');
    try {
      const res = await api.publish.verifyExpo();
      toast.success(res.username ? `Verified @${res.username}` : 'Expo token verified');
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function saveProvider(provider: 'apple_asc' | 'google_play', value: string) {
    if (!value.trim()) {
      toast.error('Paste the credential first');
      return;
    }
    setBusy(provider);
    try {
      await api.integrations.saveProviderKey(provider, value.trim());
      toast.success(
        provider === 'apple_asc'
          ? 'Apple credential encrypted in your vault'
          : 'Google Play JSON encrypted in your vault',
      );
      if (provider === 'apple_asc') setApplePass('');
      else setGoogleJson('');
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

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
        compact ? 'p-4' : 'p-5 sm:p-6'
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
            Publish
          </p>
          <h2 className="text-lg sm:text-xl font-bold mt-1">Ship on your accounts</h2>
          <p className="text-sm text-[var(--muted)] mt-1 max-w-2xl">
            Xroga builds the app. You publish with <strong>your</strong> GitHub, Vercel, Expo, Apple,
            and Google accounts — store fees are never billed to Xroga.
          </p>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-[var(--card-border)] p-1 text-xs">
          <button
            type="button"
            onClick={() => setTab('web')}
            className={cn(
              'inline-flex items-center gap-1 px-3 py-1.5 rounded-full font-semibold transition',
              tab === 'web' ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)]'
            )}
          >
            <Globe className="w-3.5 h-3.5" /> Web
          </button>
          <button
            type="button"
            onClick={() => setTab('mobile')}
            className={cn(
              'inline-flex items-center gap-1 px-3 py-1.5 rounded-full font-semibold transition',
              tab === 'mobile' ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)]'
            )}
          >
            <Smartphone className="w-3.5 h-3.5" /> Mobile
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2 text-[11px]">
        <span
          className={cn(
            'px-2.5 py-1 rounded-full border font-semibold',
            status?.web.ready
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600'
              : 'border-[var(--card-border)] text-[var(--muted)]'
          )}
        >
          Web {status?.web.ready ? 'ready' : 'setup needed'}
        </span>
        <span
          className={cn(
            'px-2.5 py-1 rounded-full border font-semibold',
            status?.mobile.ready
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600'
              : 'border-[var(--card-border)] text-[var(--muted)]'
          )}
        >
          Mobile {status?.mobile.ready ? 'ready' : 'setup needed'}
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
          <Link
            href="/dashboard/integrations"
            className="inline-flex text-sm font-semibold text-[var(--accent)] hover:underline"
          >
            Open ship setup →
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <ul className="rounded-xl border border-[var(--card-border)] bg-[var(--background)]/40 px-3">
            {(status?.mobile.checklist ?? []).map((item) => (
              <StepRow key={item.id} item={item} />
            ))}
          </ul>

          <div className="rounded-xl border border-[var(--card-border)] p-3 space-y-2">
            <p className="text-sm font-semibold flex items-center gap-1.5">
              <KeyRound className="w-4 h-4" /> Expo access token
            </p>
            <p className="text-xs text-[var(--muted)]">
              Create at{' '}
              <a
                className="text-[var(--accent)] hover:underline"
                href="https://expo.dev/settings/access-tokens"
                target="_blank"
                rel="noreferrer"
              >
                expo.dev/settings/access-tokens
              </a>
              . We encrypt it (AES-256-GCM) — never commit to GitHub.
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
                {busy === 'expo' ? 'Saving…' : 'Save & verify'}
              </button>
              {status?.mobile.expoTokenSaved ? (
                <button
                  type="button"
                  disabled={busy === 'verify'}
                  onClick={() => void verifyExpo()}
                  className="shrink-0 rounded-md border border-[var(--card-border)] px-3 py-2 text-xs font-semibold"
                >
                  {busy === 'verify' ? 'Checking…' : 'Re-verify'}
                </button>
              ) : null}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-[var(--card-border)] p-3 space-y-2">
              <p className="text-sm font-semibold">Apple (optional)</p>
              <p className="text-[11px] text-[var(--muted)]">
                App-specific password for EAS submit. You pay Apple Developer fees.
              </p>
              <input
                type="password"
                placeholder="Apple app-specific password"
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
                {busy === 'apple_asc' ? 'Saving…' : status?.mobile.appleSaved ? 'Replace' : 'Save'}
              </button>
            </div>
            <div className="rounded-xl border border-[var(--card-border)] p-3 space-y-2">
              <p className="text-sm font-semibold">Google Play (optional)</p>
              <p className="text-[11px] text-[var(--muted)]">
                Service account JSON for EAS submit. You pay Play Console fee.
              </p>
              <textarea
                rows={3}
                placeholder='{"type":"service_account",...}'
                value={googleJson}
                onChange={(e) => setGoogleJson(e.target.value)}
                className="w-full rounded-md border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-xs font-mono"
              />
              <button
                type="button"
                disabled={busy === 'google_play'}
                onClick={() => void saveProvider('google_play', googleJson)}
                className="rounded-md border border-[var(--card-border)] px-3 py-1.5 text-xs font-semibold"
              >
                {busy === 'google_play'
                  ? 'Saving…'
                  : status?.mobile.googlePlaySaved
                    ? 'Replace'
                    : 'Save'}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--card-border)] p-3">
            <p className="text-sm font-semibold mb-2">EAS commands (your machine / CI)</p>
            <pre className="text-[11px] font-mono text-[var(--muted)] whitespace-pre-wrap leading-relaxed">
              {(status?.mobile.commands ?? []).join('\n')}
            </pre>
          </div>
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
