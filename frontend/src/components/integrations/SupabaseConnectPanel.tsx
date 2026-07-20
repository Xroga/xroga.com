'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';

type Props = {
  onConnected?: () => void;
  compact?: boolean;
};

type ListedProject = { id: string; ref: string; name: string; region?: string };

/**
 * OAuth-only Supabase connect: user clicks Authorize — Xroga does the rest
 * (keys, SQL schema, AI memory tables, storage buckets). No paste.
 */
export function SupabaseConnectPanel({ onConnected, compact }: Props) {
  const [busy, setBusy] = useState(false);
  const [oauthConfigured, setOauthConfigured] = useState(true);
  const [oauthConnected, setOauthConnected] = useState(false);
  const [provisioned, setProvisioned] = useState(false);
  const [projects, setProjects] = useState<ListedProject[]>([]);
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    try {
      const st = await api.supabase.status();
      setOauthConfigured(st.oauthConfigured !== false);
      setOauthConnected(Boolean(st.oauthConnected));
      setProvisioned(Boolean(st.provisioned || st.ready));
      setMessage(st.message || '');
      if (st.oauthConnected && !st.provisioned) {
        const list = await api.supabase.projects().catch(() => ({ projects: [] as ListedProject[] }));
        setProjects(list.projects ?? []);
      }
    } catch {
      /* optional */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    function onMsg(ev: MessageEvent) {
      const data = ev.data as {
        type?: string;
        needsProjectPick?: boolean;
        projects?: ListedProject[];
        provisioned?: boolean;
        message?: string;
      };
      if (!data || typeof data !== 'object') return;
      if (data.type === 'xroga-supabase-connected') {
        setOauthConnected(true);
        setProvisioned(Boolean(data.provisioned));
        setProjects(data.projects ?? []);
        setMessage(data.message || 'Authorized');
        if (data.provisioned) {
          toast.success('Supabase ready — memory & storage on your project');
          onConnected?.();
        } else if (data.needsProjectPick) {
          toast.success('Authorized — pick a project');
        }
        void refresh();
      }
      if (data.type === 'xroga-supabase-error' && data.message) {
        toast.error(data.message);
      }
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [onConnected, refresh]);

  async function authorize() {
    setBusy(true);
    try {
      const { url, oauthConfigured: ok } = await api.supabase.oauthUrl();
      if (!ok || !url) {
        setOauthConfigured(false);
        toast.error('Supabase OAuth not configured on the server yet');
        return;
      }
      const w = window.open(url, 'xroga-supabase-oauth', 'width=560,height=720');
      if (!w) {
        window.location.href = url;
      }
    } catch (err) {
      toast.error((err as Error).message || 'Could not start Supabase authorize');
    } finally {
      setBusy(false);
    }
  }

  async function selectProject(p: ListedProject) {
    setBusy(true);
    try {
      const res = await api.supabase.selectProject({
        projectRef: p.ref || p.id,
        projectName: p.name,
      });
      if (res.ok || res.provision?.schemaApplied || res.status?.ready) {
        toast.success(res.message || 'Project provisioned automatically');
        setProvisioned(true);
        onConnected?.();
        void refresh();
      } else {
        toast.error(res.message || res.error || 'Provisioning failed');
      }
    } catch (err) {
      toast.error((err as Error).message || 'Could not provision project');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`space-y-3 ${compact ? '' : 'rounded-xl border border-[var(--card-border)] p-4'}`}>
      <div>
        <p className="text-sm font-semibold">Connect Supabase</p>
        <p className="text-xs text-[var(--muted)] mt-0.5 leading-relaxed">
          Click authorize once. Xroga fetches keys and runs SQL on <strong>your</strong> project —
          schema, AI memory, and storage — automatically. Nothing to paste.
        </p>
      </div>

      {provisioned ? (
        <p className="text-xs text-emerald-600 font-medium">
          Connected — your Supabase holds app data, AI memory, and storage.
        </p>
      ) : (
        <button
          type="button"
          disabled={busy || !oauthConfigured}
          onClick={() => void authorize()}
          className="px-3 py-2 rounded-lg text-xs font-semibold bg-[var(--accent)] text-[var(--background)] disabled:opacity-50"
        >
          {busy ? 'Opening…' : oauthConnected ? 'Re-authorize Supabase' : 'Authorize Supabase'}
        </button>
      )}

      {!oauthConfigured ? (
        <p className="text-xs text-amber-700">
          Server needs <code>SUPABASE_OAUTH_CLIENT_ID</code> and{' '}
          <code>SUPABASE_OAUTH_CLIENT_SECRET</code> from a Supabase OAuth App.
        </p>
      ) : null}

      {message && !provisioned ? (
        <p className="text-xs text-[var(--muted)]">{message}</p>
      ) : null}

      {oauthConnected && !provisioned && projects.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium">Pick a project — we set everything up:</p>
          <ul className="space-y-1.5">
            {projects.map((p) => (
              <li key={p.ref || p.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void selectProject(p)}
                  className="w-full text-left px-3 py-2 rounded-lg border border-[var(--card-border)] text-xs hover:border-[var(--accent)] disabled:opacity-50"
                >
                  <span className="font-semibold">{p.name}</span>
                  <span className="text-[var(--muted)]"> · {p.ref || p.id}</span>
                  {p.region ? (
                    <span className="text-[var(--muted)]"> · {p.region}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
