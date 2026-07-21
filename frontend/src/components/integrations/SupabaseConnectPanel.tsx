'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { subscribeOAuthResults } from '@/lib/oauthPopupResult';

type Props = {
  onConnected?: () => void;
  compact?: boolean;
};

type ListedProject = { id: string; ref: string; name: string; region?: string };
type ListedOrg = { id: string; name: string; slug?: string };

/**
 * OAuth-first Supabase connect: Authorize → pick or create project →
 * Xroga fetches keys and runs SQL (schema, AI memory, storage RLS).
 */
export function SupabaseConnectPanel({ onConnected, compact }: Props) {
  const [busy, setBusy] = useState(false);
  const [oauthConfigured, setOauthConfigured] = useState(true);
  const [oauthConnected, setOauthConnected] = useState(false);
  const [provisioned, setProvisioned] = useState(false);
  const [projects, setProjects] = useState<ListedProject[]>([]);
  const [orgs, setOrgs] = useState<ListedOrg[]>([]);
  const [message, setMessage] = useState('');
  const [newName, setNewName] = useState('my-app');
  const [orgId, setOrgId] = useState('');
  const [region, setRegion] = useState('us-east-1');

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
        if ((list.projects ?? []).length === 0) {
          const o = await api.supabase.organizations().catch(() => ({ organizations: [] as ListedOrg[] }));
          const organizations = o.organizations ?? [];
          setOrgs(organizations);
          if (organizations[0] && !orgId) setOrgId(organizations[0].id);
        }
      }
    } catch {
      /* optional */
    }
  }, [orgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const unsub = subscribeOAuthResults((data) => {
      if (data.type === 'xroga-supabase-connected') {
        setOauthConnected(true);
        setProvisioned(Boolean(data.provisioned));
        setProjects((data.projects as ListedProject[]) ?? []);
        setMessage(data.message || 'Authorized');
        if (data.provisioned) {
          toast.success('Supabase ready — memory & storage on your project');
          onConnected?.();
        } else if (data.needsProjectPick) {
          toast.success('Authorized — pick or create a project');
        }
        void refresh();
      }
      if (data.type === 'xroga-supabase-error' && data.message) {
        toast.error(data.message);
      }
    });
    return unsub;
  }, [onConnected, refresh]);

  async function authorize() {
    setBusy(true);
    try {
      const { openSupabaseOAuthPopup, listenSupabaseOAuthMessages } = await import(
        '@/lib/supabaseConnect'
      );
      const stop = listenSupabaseOAuthMessages(
        (result) => {
          stop();
          setOauthConnected(true);
          setProvisioned(Boolean(result.provisioned));
          if (result.projects?.length) setProjects(result.projects);
          setMessage(result.message || 'Authorized');
          if (result.provisioned) {
            toast.success(result.message || 'Supabase ready — memory & storage on your project');
            onConnected?.();
          } else {
            toast.success(result.message || 'Authorized — pick or create a project');
          }
          void refresh();
        },
        (msg) => {
          stop();
          toast.error(msg);
        },
      );
      const result = await openSupabaseOAuthPopup();
      if (!result.opened) {
        stop();
        if (!result.oauthConfigured) setOauthConfigured(false);
        toast.error(result.error || 'Could not start Supabase authorize');
      } else if (!result.popup) {
        toast.success('Continue authorizing Supabase in this tab…');
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
        const envSync = (res as { envSync?: { ok?: boolean; error?: string; skipped?: string[] } })
          .envSync;
        if (envSync && envSync.ok === false) {
          toast.error(
            envSync.error ||
              `Supabase ready, but vault → Vercel env sync failed${
                envSync.skipped?.length ? ` (${envSync.skipped.slice(0, 4).join(', ')})` : ''
              }. Sync from Integrations.`,
          );
        }
      } else {
        toast.error(res.message || res.error || 'Provisioning failed');
      }
    } catch (err) {
      toast.error((err as Error).message || 'Could not provision project');
    } finally {
      setBusy(false);
    }
  }

  async function createProject() {
    if (!orgId || !newName.trim()) {
      toast.error('Pick an organization and name');
      return;
    }
    setBusy(true);
    try {
      const res = await api.supabase.createProject({
        name: newName.trim().slice(0, 64),
        organizationId: orgId,
        region,
      });
      if (res.ok) {
        toast.success(res.message || 'Created and provisioned');
        setProvisioned(true);
        onConnected?.();
        void refresh();
        const envSync = (res as { envSync?: { ok?: boolean; error?: string; skipped?: string[] } })
          .envSync;
        if (envSync && envSync.ok === false) {
          toast.error(
            envSync.error ||
              'Project created, but vault → Vercel env sync failed. Sync from Integrations.',
          );
        }
      } else {
        toast.error(res.message || res.error || 'Create failed');
      }
    } catch (err) {
      toast.error((err as Error).message || 'Could not create project');
    } finally {
      setBusy(false);
    }
  }

  async function refreshProjects() {
    setBusy(true);
    try {
      const list = await api.supabase.projects();
      setProjects(list.projects ?? []);
      if ((list.projects ?? []).length === 0) {
        const o = await api.supabase.organizations();
        setOrgs(o.organizations ?? []);
        if (o.organizations?.[0]) setOrgId(o.organizations[0].id);
      }
      toast.success(
        (list.projects ?? []).length
          ? `${list.projects.length} project(s)`
          : 'No projects yet — create one below',
      );
    } catch (err) {
      toast.error((err as Error).message || 'Could not list projects');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`space-y-3 ${compact ? '' : 'rounded-xl border border-[var(--card-border)] p-4'}`}>
      <div>
        <p className="text-sm font-semibold">Connect Supabase</p>
        <p className="text-xs text-[var(--muted)] mt-0.5 leading-relaxed">
          Authorize once. We fetch keys and run SQL on <strong>your</strong> project — schema, AI
          memory, and storage RLS. If you have no project yet, create one here.
        </p>
      </div>

      {provisioned ? (
        <p className="text-xs text-emerald-600 font-medium">
          Connected — your Supabase holds app data, AI memory, and storage.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !oauthConfigured}
            onClick={() => void authorize()}
            className="px-3 py-2 rounded-lg text-xs font-semibold bg-[var(--accent)] text-[var(--background)] disabled:opacity-50"
          >
            {busy ? 'Opening…' : oauthConnected ? 'Re-authorize Supabase' : 'Authorize Supabase'}
          </button>
          {oauthConnected ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void refreshProjects()}
              className="px-3 py-2 rounded-lg text-xs font-semibold border border-[var(--card-border)] disabled:opacity-50"
            >
              Refresh projects
            </button>
          ) : null}
        </div>
      )}

      {!oauthConfigured ? (
        <p className="text-xs text-amber-700">
          Server needs <code>SUPABASE_OAUTH_CLIENT_ID</code> and{' '}
          <code>SUPABASE_OAUTH_CLIENT_SECRET</code> from a Supabase Org OAuth App.
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

      {oauthConnected && !provisioned && projects.length === 0 ? (
        <div className="space-y-2 rounded-lg border border-dashed border-[var(--card-border)] p-3">
          <p className="text-xs font-medium">No projects yet — create one in your org:</p>
          {orgs.length === 0 ? (
            <p className="text-xs text-amber-700">
              Could not load organizations. Re-authorize with Organizations Read, then refresh.
            </p>
          ) : (
            <>
              <label className="block text-xs text-[var(--muted)]">
                Organization
                <select
                  className="mt-1 w-full rounded-md border border-[var(--card-border)] bg-transparent px-2 py-1.5 text-xs"
                  value={orgId}
                  onChange={(e) => setOrgId(e.target.value)}
                  disabled={busy}
                >
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-[var(--muted)]">
                Project name
                <input
                  className="mt-1 w-full rounded-md border border-[var(--card-border)] bg-transparent px-2 py-1.5 text-xs"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  disabled={busy}
                  maxLength={64}
                />
              </label>
              <label className="block text-xs text-[var(--muted)]">
                Region
                <select
                  className="mt-1 w-full rounded-md border border-[var(--card-border)] bg-transparent px-2 py-1.5 text-xs"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  disabled={busy}
                >
                  <option value="us-east-1">us-east-1</option>
                  <option value="us-west-1">us-west-1</option>
                  <option value="eu-west-1">eu-west-1</option>
                  <option value="eu-central-1">eu-central-1</option>
                  <option value="ap-southeast-1">ap-southeast-1</option>
                </select>
              </label>
              <button
                type="button"
                disabled={busy || !orgId || !newName.trim()}
                onClick={() => void createProject()}
                className="px-3 py-2 rounded-lg text-xs font-semibold bg-[var(--accent)] text-[var(--background)] disabled:opacity-50"
              >
                {busy ? 'Creating…' : 'Create & provision'}
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
