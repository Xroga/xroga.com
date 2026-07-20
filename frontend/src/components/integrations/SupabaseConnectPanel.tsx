'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';

type Props = {
  onConnected?: () => void;
  compact?: boolean;
};

/**
 * Connect the user's own Supabase project (URL + keys).
 * Built apps use these env vars on Vercel — data stays in THEIR project.
 */
export function SupabaseConnectPanel({ onConnected, compact }: Props) {
  const [projectUrl, setProjectUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [serviceRoleKey, setServiceRoleKey] = useState('');
  const [vercelProject, setVercelProject] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.integrations.connectSupabase({
        projectUrl: projectUrl.trim(),
        anonKey: anonKey.trim(),
        serviceRoleKey: serviceRoleKey.trim() || undefined,
        vercelProject: vercelProject.trim() || undefined,
      });
      if (res.ok || res.status?.ready) {
        toast.success('Supabase connected — apps will use your project');
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
    <form
      onSubmit={submit}
      className={`space-y-3 ${compact ? '' : 'rounded-xl border border-[var(--card-border)] p-4'}`}
    >
      <div>
        <p className="text-sm font-semibold">Connect your Supabase</p>
        <p className="text-xs text-[var(--muted)] mt-0.5 leading-relaxed">
          Paste credentials from{' '}
          <a
            href="https://supabase.com/dashboard/project/_/settings/api"
            target="_blank"
            rel="noreferrer"
            className="text-[var(--accent)] hover:underline"
          >
            Project Settings → API
          </a>
          . Auth, database, and storage for shipped apps hit <strong>your</strong> project —
          not Xroga&apos;s.
        </p>
      </div>

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
        Anon (public) key
        <input
          required
          type="password"
          autoComplete="off"
          value={anonKey}
          onChange={(e) => setAnonKey(e.target.value)}
          placeholder="eyJ…"
          className="w-full rounded-lg border border-[var(--card-border)] bg-transparent px-3 py-2 text-sm"
        />
      </label>

      <label className="block text-xs font-medium space-y-1">
        Service role key <span className="text-[var(--muted)] font-normal">(recommended)</span>
        <input
          type="password"
          autoComplete="off"
          value={serviceRoleKey}
          onChange={(e) => setServiceRoleKey(e.target.value)}
          placeholder="Server routes only — never expose in browser"
          className="w-full rounded-lg border border-[var(--card-border)] bg-transparent px-3 py-2 text-sm"
        />
      </label>

      <label className="block text-xs font-medium space-y-1">
        Vercel project slug{' '}
        <span className="text-[var(--muted)] font-normal">(optional — sync env now)</span>
        <input
          value={vercelProject}
          onChange={(e) => setVercelProject(e.target.value)}
          placeholder="my-app"
          className="w-full rounded-lg border border-[var(--card-border)] bg-transparent px-3 py-2 text-sm"
        />
      </label>

      <button
        type="submit"
        disabled={busy}
        className="px-3 py-2 rounded-lg text-xs font-semibold bg-[var(--accent)] text-[var(--background)] disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Save & connect'}
      </button>
    </form>
  );
}
