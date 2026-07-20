'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Key, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface CatalogItem {
  id: string;
  name: string;
  category: string;
  freeTier: boolean;
  requiresApiKey: boolean;
  endpoint: string;
  envVar?: string;
  userGuidance: string;
}

interface KeyStatus {
  provider: string;
  connected: boolean;
  masked?: string;
  envVar?: string;
}

/** BYOK vault: encrypt keys in Xroga → sync to user's Vercel env on deploy. */
export function AiIntegrationsPanel({ compact }: { compact?: boolean }) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [keys, setKeys] = useState<KeyStatus[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [customEnv, setCustomEnv] = useState('MY_API_KEY');
  const [vercelProject, setVercelProject] = useState('');

  const load = useCallback(async () => {
    try {
      const [cat, k] = await Promise.all([
        api.integrations.aiCatalog(),
        api.integrations.providerKeys(),
      ]);
      setCatalog(
        (cat.catalog ?? []).filter(
          (item) =>
            item.category !== 'publish' &&
            item.id !== 'supabase_pat' &&
            item.id !== 'supabase_db_password',
        ),
      );
      setKeys(k.keys ?? []);
    } catch {
      /* optional */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const statusFor = (provider: string) => keys.find((k) => k.provider === provider && k.connected);

  async function saveKey(item: CatalogItem) {
    const draft = (drafts[item.id] || '').trim();
    if (!draft) {
      toast.error('Paste your API key first');
      return;
    }
    if (item.id === 'custom' && !customEnv.trim()) {
      toast.error('Set an env var name for custom keys');
      return;
    }
    setSavingId(item.id);
    try {
      const res = await api.integrations.saveProviderKey(item.id, draft, {
        envVarName: item.id === 'custom' ? customEnv.trim() : undefined,
        vercelProject: vercelProject.trim() || undefined,
      });
      toast.success(
        res.envVar
          ? `${item.name} saved → ${res.envVar} (encrypted). Syncs to Vercel on deploy.`
          : `${item.name} encrypted & saved`,
      );
      setDrafts((d) => ({ ...d, [item.id]: '' }));
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  async function removeKey(provider: string) {
    try {
      await api.integrations.deleteProviderKey(provider);
      toast.success('Key removed from vault');
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function syncNow() {
    const slug = vercelProject.trim();
    if (!slug) {
      toast.error('Enter your Vercel project slug first');
      return;
    }
    try {
      const res = await api.integrations.syncVercelEnv(slug);
      if (res.ok) toast.success(`Synced vault secrets to Vercel project “${slug}”`);
      else toast.error('Sync incomplete — use a Full Account Vercel token under Integrations');
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <p className={`text-[var(--muted)] ${compact ? 'text-[9px]' : 'text-[11px]'} leading-relaxed`}>
        Paste keys for <strong>your live product</strong> (OpenAI, Stripe, Supabase…). Stored with
        AES-256-GCM in your account — never committed to GitHub. When Vercel is connected, deploy
        auto-syncs them as project env vars. Use a <strong>Full Account</strong> Vercel token for
        env write access. Expo / Apple / Google Play credentials live under{' '}
        <strong>Publish</strong> (not synced to Vercel).
      </p>

      <div className="flex flex-col sm:flex-row gap-1.5">
        <input
          type="text"
          placeholder="Vercel project slug (optional sync)"
          className="flex-1 min-w-0 rounded-md border border-[var(--card-border)] bg-[var(--background)] px-2 py-1.5 text-[11px] font-mono"
          value={vercelProject}
          onChange={(e) => setVercelProject(e.target.value)}
        />
        <button
          type="button"
          onClick={() => void syncNow()}
          className="shrink-0 rounded-md border border-[var(--card-border)] px-3 py-1.5 text-[10px] font-semibold hover:border-[var(--accent)]/50"
        >
          Sync vault → Vercel
        </button>
      </div>

      <ul className={`space-y-2 ${compact ? 'text-[10px]' : 'text-[12px]'}`}>
        {catalog.map((item) => {
          const connected = statusFor(item.id);
          return (
            <li
              key={item.id}
              className="rounded-lg border border-[var(--card-border)] bg-[var(--foreground)]/[0.02] p-2.5 space-y-1.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-[var(--foreground)] flex items-center gap-1.5 flex-wrap">
                    {item.name}
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                        item.freeTier
                          ? 'bg-emerald-500/15 text-emerald-600'
                          : 'bg-amber-500/15 text-amber-600'
                      }`}
                    >
                      {item.freeTier ? 'HAS FREE TIER' : 'PAID'}
                    </span>
                    <span className="text-[9px] text-[var(--muted)] font-mono">
                      {item.envVar || item.endpoint}
                    </span>
                  </p>
                  <p className="text-[var(--muted)] mt-0.5 leading-snug">{item.userGuidance}</p>
                </div>
                {connected && (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" aria-label="Saved" />
                )}
              </div>

              {item.id === 'custom' && (
                <input
                  type="text"
                  placeholder="ENV_VAR_NAME"
                  className="w-full rounded-md border border-[var(--card-border)] bg-[var(--background)] px-2 py-1.5 text-[11px] font-mono"
                  value={customEnv}
                  onChange={(e) => setCustomEnv(e.target.value)}
                />
              )}

              <div className="flex flex-col sm:flex-row gap-1.5 pt-1">
                <input
                  type="password"
                  autoComplete="off"
                  placeholder={
                    connected
                      ? `Replace key (${connected.masked})`
                      : 'Paste secret — encrypted in your vault'
                  }
                  className="flex-1 min-w-0 rounded-md border border-[var(--card-border)] bg-[var(--background)] px-2 py-1.5 text-[11px] font-mono"
                  value={drafts[item.id] ?? ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [item.id]: e.target.value }))}
                />
                <button
                  type="button"
                  disabled={savingId === item.id || !(drafts[item.id] || '').trim()}
                  onClick={() => void saveKey(item)}
                  className="shrink-0 inline-flex items-center justify-center gap-1 rounded-md bg-[var(--accent)] text-white px-3 py-1.5 text-[10px] font-semibold disabled:opacity-50"
                >
                  <Key className="h-3 w-3" />
                  {savingId === item.id ? 'Saving…' : 'Save encrypted'}
                </button>
                {connected && (
                  <button
                    type="button"
                    onClick={() => void removeKey(item.id)}
                    className="shrink-0 inline-flex items-center justify-center gap-1 rounded-md border border-[var(--card-border)] px-2 py-1.5 text-[10px] text-red-400"
                    aria-label="Remove key"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
