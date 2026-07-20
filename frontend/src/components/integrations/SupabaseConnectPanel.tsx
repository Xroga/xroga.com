'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';

type Props = {
  onConnected?: () => void;
  compact?: boolean;
};

type ListedProject = { id: string; ref: string; name: string; region?: string };

/**
 * One-click Supabase connect:
 * 1) Paste Access Token → list projects
 * 2) Click a project → Xroga fetches keys, creates schema/memory/storage on THEIR project
 */
export function SupabaseConnectPanel({ onConnected, compact }: Props) {
  const [mode, setMode] = useState<'oneclick' | 'manual'>('oneclick');
  const [accessToken, setAccessToken] = useState('');
  const [projects, setProjects] = useState<ListedProject[]>([]);
  const [selectedRef, setSelectedRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<'token' | 'pick' | 'done'>('token');

  // Manual fallback
  const [projectUrl, setProjectUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [serviceRoleKey, setServiceRoleKey] = useState('');
  const [dbPassword, setDbPassword] = useState('');
  const [vercelProject, setVercelProject] = useState('');

  async function loadProjects(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.integrations.listSupabaseProjects(accessToken.trim());
      const list = res.projects ?? [];
      if (!list.length) {
        toast.error(res.error || 'No projects found for this token');
        return;
      }
      setProjects(list);
      setSelectedRef(list[0]!.ref || list[0]!.id);
      setStep('pick');
      toast.success(`${list.length} project${list.length === 1 ? '' : 's'} found`);
    } catch (err) {
      toast.error((err as Error).message || 'Could not list projects');
    } finally {
      setBusy(false);
    }
  }

  async function oneClickConnect() {
    if (!selectedRef) {
      toast.error('Pick a project');
      return;
    }
    setBusy(true);
    try {
      const project = projects.find((p) => p.ref === selectedRef || p.id === selectedRef);
      const res = await api.integrations.oneClickSupabase({
        accessToken: accessToken.trim(),
        projectRef: selectedRef,
        projectName: project?.name,
        vercelProject: vercelProject.trim() || undefined,
      });
      if (res.ok || res.status?.ready) {
        toast.success(
          res.provision?.schemaApplied
            ? 'Connected — schema, memory & storage set up on your Supabase'
            : res.message || 'Supabase connected',
        );
        setStep('done');
        onConnected?.();
      } else {
        toast.error(res.message || res.error || 'Connect failed');
      }
    } catch (err) {
      toast.error((err as Error).message || 'Connect failed');
    } finally {
      setBusy(false);
    }
  }

  async function manualConnect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.integrations.connectSupabase({
        projectUrl: projectUrl.trim(),
        anonKey: anonKey.trim(),
        serviceRoleKey: serviceRoleKey.trim() || undefined,
        accessToken: accessToken.trim() || undefined,
        dbPassword: dbPassword.trim() || undefined,
        vercelProject: vercelProject.trim() || undefined,
      });
      if (res.ok || res.status?.ready) {
        toast.success(res.message || 'Supabase connected');
        onConnected?.();
      } else {
        toast.error(res.message || res.error || 'Could not connect Supabase');
      }
    } catch (err) {
      toast.error((err as Error).message || 'Could not connect Supabase');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`space-y-3 ${compact ? '' : 'rounded-xl border border-[var(--card-border)] p-4'}`}>
      <div>
        <p className="text-sm font-semibold">Connect your Supabase — one click</p>
        <p className="text-xs text-[var(--muted)] mt-0.5 leading-relaxed">
          Xroga creates tables, AI memory, and storage buckets on <strong>your</strong> project
          automatically. Create a token at{' '}
          <a
            href="https://supabase.com/dashboard/account/tokens"
            target="_blank"
            rel="noreferrer"
            className="text-[var(--accent)] hover:underline"
          >
            Account → Access Tokens
          </a>
          .
        </p>
      </div>

      <div className="flex gap-2 text-xs">
        <button
          type="button"
          onClick={() => setMode('oneclick')}
          className={`px-2.5 py-1 rounded-lg border ${
            mode === 'oneclick'
              ? 'border-[var(--accent)] text-[var(--accent)]'
              : 'border-[var(--card-border)] text-[var(--muted)]'
          }`}
        >
          One-click
        </button>
        <button
          type="button"
          onClick={() => setMode('manual')}
          className={`px-2.5 py-1 rounded-lg border ${
            mode === 'manual'
              ? 'border-[var(--accent)] text-[var(--accent)]'
              : 'border-[var(--card-border)] text-[var(--muted)]'
          }`}
        >
          Paste keys
        </button>
      </div>

      {mode === 'oneclick' ? (
        <div className="space-y-3">
          {step === 'token' || step === 'pick' ? (
            <form onSubmit={loadProjects} className="space-y-3">
              <label className="block text-xs font-medium space-y-1">
                Supabase Access Token
                <input
                  required
                  type="password"
                  autoComplete="off"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder="sbp_…"
                  className="w-full rounded-lg border border-[var(--card-border)] bg-transparent px-3 py-2 text-sm"
                />
              </label>
              {step === 'token' ? (
                <button
                  type="submit"
                  disabled={busy}
                  className="px-3 py-2 rounded-lg text-xs font-semibold bg-[var(--accent)] text-[var(--background)] disabled:opacity-50"
                >
                  {busy ? 'Loading projects…' : 'List my projects'}
                </button>
              ) : null}
            </form>
          ) : null}

          {step === 'pick' ? (
            <div className="space-y-3">
              <label className="block text-xs font-medium space-y-1">
                Project
                <select
                  value={selectedRef}
                  onChange={(e) => setSelectedRef(e.target.value)}
                  className="w-full rounded-lg border border-[var(--card-border)] bg-transparent px-3 py-2 text-sm"
                >
                  {projects.map((p) => (
                    <option key={p.ref || p.id} value={p.ref || p.id}>
                      {p.name} ({p.ref || p.id})
                      {p.region ? ` · ${p.region}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium space-y-1">
                Vercel project slug{' '}
                <span className="text-[var(--muted)] font-normal">(optional)</span>
                <input
                  value={vercelProject}
                  onChange={(e) => setVercelProject(e.target.value)}
                  placeholder="my-app"
                  className="w-full rounded-lg border border-[var(--card-border)] bg-transparent px-3 py-2 text-sm"
                />
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() => void oneClickConnect()}
                className="px-3 py-2 rounded-lg text-xs font-semibold bg-[var(--accent)] text-[var(--background)] disabled:opacity-50"
              >
                {busy ? 'Provisioning…' : 'Connect & auto-setup'}
              </button>
            </div>
          ) : null}

          {step === 'done' ? (
            <p className="text-xs text-emerald-600">
              Done — your Supabase now holds app data, AI memory, and storage.
            </p>
          ) : null}
        </div>
      ) : (
        <form onSubmit={manualConnect} className="space-y-3">
          <label className="block text-xs font-medium space-y-1">
            Project URL
            <input
              required
              type="url"
              value={projectUrl}
              onChange={(e) => setProjectUrl(e.target.value)}
              placeholder="https://xxxx.supabase.co"
              className="w-full rounded-lg border border-[var(--card-border)] bg-transparent px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs font-medium space-y-1">
            Anon key
            <input
              required
              type="password"
              autoComplete="off"
              value={anonKey}
              onChange={(e) => setAnonKey(e.target.value)}
              className="w-full rounded-lg border border-[var(--card-border)] bg-transparent px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs font-medium space-y-1">
            Service role key
            <input
              required
              type="password"
              autoComplete="off"
              value={serviceRoleKey}
              onChange={(e) => setServiceRoleKey(e.target.value)}
              className="w-full rounded-lg border border-[var(--card-border)] bg-transparent px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs font-medium space-y-1">
            Access Token <span className="text-[var(--muted)] font-normal">(for auto schema)</span>
            <input
              type="password"
              autoComplete="off"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="sbp_… recommended"
              className="w-full rounded-lg border border-[var(--card-border)] bg-transparent px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs font-medium space-y-1">
            DB password <span className="text-[var(--muted)] font-normal">(fallback)</span>
            <input
              type="password"
              autoComplete="off"
              value={dbPassword}
              onChange={(e) => setDbPassword(e.target.value)}
              className="w-full rounded-lg border border-[var(--card-border)] bg-transparent px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="px-3 py-2 rounded-lg text-xs font-semibold bg-[var(--accent)] text-[var(--background)] disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save & auto-setup'}
          </button>
        </form>
      )}
    </div>
  );
}
