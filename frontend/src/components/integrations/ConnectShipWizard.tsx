'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Circle, KeyRound, GitBranch, Triangle, Database } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { AiIntegrationsPanel } from './AiIntegrationsPanel';
import { SupabaseConnectPanel } from './SupabaseConnectPanel';

type StepId = 'github' | 'vercel' | 'supabase' | 'keys';

/**
 * Ship flow: GitHub → Vercel → Supabase (user's project) → extra API keys.
 */
export function ConnectShipWizard() {
  const [githubOk, setGithubOk] = useState(false);
  const [vercelOk, setVercelOk] = useState(false);
  const [supabaseOk, setSupabaseOk] = useState(false);
  const [keysOk, setKeysOk] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<StepId | null>(null);
  const [showKeys, setShowKeys] = useState(false);
  const [showSupabase, setShowSupabase] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [gh, ve, keys, sb] = await Promise.all([
        api.github.status().catch(() => ({ connected: false })),
        api.vercel.status().catch(() => ({ connected: false })),
        api.integrations.providerKeys().catch(() => ({ keys: [] as Array<{ provider?: string; connected?: boolean }> })),
        api.supabase.status().catch(() => ({ ready: false, connected: false, provisioned: false })),
      ]);
      setGithubOk(Boolean((gh as { connected?: boolean }).connected));
      setVercelOk(Boolean((ve as { connected?: boolean }).connected));
      const list = (keys as { keys?: Array<{ provider?: string; connected?: boolean }> }).keys ?? [];
      const connected = list.filter((k) => k.connected);
      setSupabaseOk(
        Boolean((sb as { provisioned?: boolean }).provisioned) ||
          Boolean((sb as { ready?: boolean }).ready),
      );
      setKeysOk(
        connected.some(
          (k) =>
            k.provider &&
            !String(k.provider).startsWith('supabase'),
        ),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function connectGithub() {
    setBusy('github');
    try {
      const { url } = await api.github.oauthUrl();
      if (url) window.location.href = url;
      else toast.error('GitHub OAuth not configured');
    } catch {
      toast.error('Could not start GitHub connect');
    } finally {
      setBusy(null);
    }
  }

  async function connectVercel() {
    setBusy('vercel');
    try {
      const { url } = await api.vercel.oauthUrl();
      if (url) window.location.href = url;
      else toast.error('Vercel OAuth not configured — use a Full Account token below');
    } catch {
      toast.error('Could not start Vercel connect');
    } finally {
      setBusy(null);
    }
  }

  const steps: Array<{
    id: StepId;
    title: string;
    body: string;
    done: boolean;
    optional?: boolean;
    action: () => void;
    label: string;
  }> = [
    {
      id: 'github',
      title: '1. Connect GitHub',
      body: 'Xroga pushes working code to your repo and updates the same project (edit/delete).',
      done: githubOk,
      action: connectGithub,
      label: githubOk ? 'Connected' : 'Connect GitHub',
    },
    {
      id: 'vercel',
      title: '2. Connect Vercel',
      body: 'Deploys go to your Vercel account (you pay hosting). Prefer a Full Account token for env sync.',
      done: vercelOk,
      action: connectVercel,
      label: vercelOk ? 'Connected' : 'Connect Vercel',
    },
    {
      id: 'supabase',
      title: '3. Connect Supabase',
      body: 'Authorize once — Xroga fetches keys and auto-runs SQL (schema, AI memory, storage) on YOUR project.',
      done: supabaseOk,
      optional: true,
      action: () => {
        setShowSupabase(true);
        setShowKeys(false);
      },
      label: supabaseOk ? 'Connected' : 'Authorize Supabase',
    },
    {
      id: 'keys',
      title: '4. Other product API keys',
      body: 'Optional — OpenAI, Stripe, Resend… encrypted here, synced into Vercel env on deploy.',
      done: keysOk,
      optional: true,
      action: () => {
        setShowKeys(true);
        setShowSupabase(false);
      },
      label: keysOk ? 'Keys saved' : 'Add API keys',
    },
  ];

  const ready = githubOk && vercelOk;

  return (
    <section
      id="ship-setup"
      className="mb-8 rounded-2xl border border-[var(--card-border)] bg-[var(--card)]/40 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
            Ship setup
          </p>
          <h2 className="text-lg sm:text-xl font-bold mt-1">Connect once · ship forever</h2>
          <p className="text-sm text-[var(--muted)] mt-1 max-w-xl">
            Connect GitHub + Vercel to ship. Supabase puts data on <strong>your</strong> project.
            For Android/iOS stores, open{' '}
            <Link href="/dashboard/publish" className="text-[var(--accent)] hover:underline">
              Publish
            </Link>{' '}
            (your Expo/Apple/Google accounts — Xroga does not pay store fees).
          </p>
        </div>
        <div
          className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${
            ready
              ? 'border-emerald-500/40 text-emerald-600 bg-emerald-500/10'
              : 'border-amber-500/40 text-amber-700 bg-amber-500/10'
          }`}
        >
          {loading ? 'Checking…' : ready ? 'Ready to ship' : 'Setup incomplete'}
        </div>
      </div>

      <ol className="space-y-3">
        {steps.map((s) => (
          <li
            key={s.id}
            className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-[var(--card-border)] bg-black/[0.02] dark:bg-white/[0.03] px-4 py-3"
          >
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <span className="mt-0.5 shrink-0">
                {s.done ? (
                  <Check className="w-5 h-5 text-emerald-500" />
                ) : (
                  <Circle className="w-5 h-5 text-[var(--muted)]" />
                )}
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-sm flex items-center gap-2 flex-wrap">
                  {s.id === 'github' ? <GitBranch className="w-4 h-4" /> : null}
                  {s.id === 'vercel' ? <Triangle className="w-4 h-4" /> : null}
                  {s.id === 'supabase' ? <Database className="w-4 h-4" /> : null}
                  {s.id === 'keys' ? <KeyRound className="w-4 h-4" /> : null}
                  {s.title}
                  {s.optional ? (
                    <span className="text-[10px] uppercase tracking-wide text-[var(--muted)] font-medium">
                      optional
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-[var(--muted)] mt-0.5 leading-relaxed">{s.body}</p>
              </div>
            </div>
            <button
              type="button"
              disabled={(s.done && s.id !== 'keys' && s.id !== 'supabase') || busy === s.id}
              onClick={s.action}
              className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--accent)] text-[var(--background)] disabled:opacity-50"
            >
              {busy === s.id ? 'Opening…' : s.label}
            </button>
          </li>
        ))}
      </ol>

      {ready ? (
        <p className="mt-4 text-sm text-[var(--muted)]">
          You&apos;re set.{' '}
          <Link href="/workspace" className="text-[var(--accent)] font-semibold hover:underline">
            Open Workspace
          </Link>{' '}
          and describe what to build.
        </p>
      ) : null}

      {showSupabase ? (
        <div id="ship-setup-supabase" className="mt-5 pt-5 border-t border-[var(--card-border)]">
          <SupabaseConnectPanel
            onConnected={() => {
              void refresh();
              setShowSupabase(false);
            }}
          />
        </div>
      ) : null}

      {showKeys ? (
        <div className="mt-5 pt-5 border-t border-[var(--card-border)]">
          <AiIntegrationsPanel compact />
        </div>
      ) : null}
    </section>
  );
}
