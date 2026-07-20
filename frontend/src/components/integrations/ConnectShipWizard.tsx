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
      title: '1. GitHub',
      body: 'Authorize once. We push and update your code automatically.',
      done: githubOk,
      action: connectGithub,
      label: githubOk ? 'Connected' : 'Authorize',
    },
    {
      id: 'vercel',
      title: '2. Vercel',
      body: 'Authorize once (Vercel App). With Project + Deployment + Env permissions, we deploy and sync keys automatically.',
      done: vercelOk,
      action: connectVercel,
      label: vercelOk ? 'Connected' : 'Authorize',
    },
    {
      id: 'supabase',
      title: '3. Supabase',
      body: 'Authorize once. We fetch keys and run SQL (schema, memory, storage). Create a project here if you have none.',
      done: supabaseOk,
      optional: true,
      action: () => {
        setShowSupabase(true);
        setShowKeys(false);
      },
      label: supabaseOk ? 'Connected' : 'Authorize',
    },
    {
      id: 'keys',
      title: '4. Extra keys',
      body: 'Optional — OpenAI, Stripe, Resend for live product features.',
      done: keysOk,
      optional: true,
      action: () => {
        setShowKeys(true);
        setShowSupabase(false);
      },
      label: keysOk ? 'Saved' : 'Add keys',
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
          <h2 className="text-lg sm:text-xl font-bold mt-1">3 clicks · then just describe</h2>
          <p className="text-sm text-[var(--muted)] mt-1 max-w-xl">
            Authorize GitHub + Vercel (+ Supabase). Then open Workspace and tell Xroga what to
            build — we code, push, and deploy for you.
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
