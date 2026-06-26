'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, Plus, Trash2, Key } from 'lucide-react';
import Image from 'next/image';
import { INTEGRATIONS, INTEGRATION_CATEGORIES } from '@/lib/integrations';
import { getIntegrationLogo } from '@/lib/integrationLogos';
import { GitHubConnect } from '@/components/integrations/GitHubConnect';
import { api } from '@/lib/api';
import { CUSTOM_CREDENTIALS_KEY } from '@/lib/constants';
import toast from 'react-hot-toast';
import { ConnectButton } from '@/components/ui/Uiverse';
import { cn } from '@/lib/utils';

interface CustomCredential {
  id: string;
  name: string;
  type: 'api_key' | 'webhook' | 'secret';
  keyPreview: string;
  baseUrl?: string;
}

export function IntegrationsPanel() {
  const [search, setSearch] = useState('');
  const [githubConnected, setGithubConnected] = useState(false);
  const [customCreds, setCustomCreds] = useState<CustomCredential[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    type: 'api_key' as CustomCredential['type'],
    apiKey: '',
    webhookUrl: '',
    baseUrl: '',
  });

  useEffect(() => {
    api.github
      .status()
      .then((s) => setGithubConnected(s.connected))
      .catch(() => setGithubConnected(false));

    try {
      const stored = localStorage.getItem(CUSTOM_CREDENTIALS_KEY);
      if (stored) setCustomCreds(JSON.parse(stored));
    } catch {
      /* ignore */
    }
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return INTEGRATIONS.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q)
    );
  }, [search]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof INTEGRATIONS>();
    for (const cat of INTEGRATION_CATEGORIES) {
      const items = filtered.filter((i) => i.category === cat);
      if (items.length) map.set(cat, items);
    }
    return map;
  }, [filtered]);

  function saveCustomCred() {
    if (!form.name.trim() || !form.apiKey.trim()) {
      toast.error('Name and API key are required');
      return;
    }
    const cred: CustomCredential = {
      id: crypto.randomUUID(),
      name: form.name.trim(),
      type: form.type,
      keyPreview: `${form.apiKey.slice(0, 4)}••••${form.apiKey.slice(-4)}`,
      baseUrl: form.baseUrl || undefined,
    };
    const next = [...customCreds, cred];
    setCustomCreds(next);
    localStorage.setItem(CUSTOM_CREDENTIALS_KEY, JSON.stringify(next));
    setForm({ name: '', type: 'api_key', apiKey: '', webhookUrl: '', baseUrl: '' });
    setShowForm(false);
    toast.success('Credential saved locally (encrypted storage coming soon)');
  }

  function deleteCred(id: string) {
    const next = customCreds.filter((c) => c.id !== id);
    setCustomCreds(next);
    localStorage.setItem(CUSTOM_CREDENTIALS_KEY, JSON.stringify(next));
    toast.success('Credential removed');
  }

  async function handleConnect(id: string, oauth?: boolean) {
    if (id === 'github') {
      try {
        const { url } = await api.github.oauthUrl();
        window.location.href = url;
      } catch {
        toast.error('GitHub OAuth not configured');
      }
      return;
    }
    if (oauth) {
      toast('OAuth flow coming soon — use Custom API Keys for now', { icon: '🔗' });
    } else {
      setShowForm(true);
      setForm((f) => ({ ...f, name: INTEGRATIONS.find((i) => i.id === id)?.name ?? '' }));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-semibold text-lg">Integrations</h2>
        <p className="text-sm text-[var(--muted)] mt-1">
          Connect external services to power your Swarm.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search integrations..."
          className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white/5 border border-[var(--card-border)] text-sm focus:border-[var(--accent)]/50 focus:outline-none"
        />
      </div>

      {search.toLowerCase().includes('github') && (
        <div className="glass-panel rounded-xl p-4">
          <GitHubConnect />
        </div>
      )}

      {Array.from(grouped.entries()).map(([category, items]) => (
        <div key={category} className="glass-panel rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[var(--card-border)] bg-white/5">
            <h3 className="text-sm font-semibold">{category}</h3>
            <p className="text-xs text-[var(--muted)]">{items.length} services</p>
          </div>
          <div className="divide-y divide-[var(--card-border)]">
            {items.map((item) => {
              const connected =
                item.status === 'connected' ||
                (item.id === 'github' && githubConnected);
              return (
                <div
                  key={item.id}
                  className="integration-card flex items-center justify-between gap-4 px-4 py-3 hover:bg-white/[0.03]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0 overflow-hidden">
                      {getIntegrationLogo(item.id) ? (
                        <Image
                          src={getIntegrationLogo(item.id)!}
                          alt=""
                          width={24}
                          height={24}
                          unoptimized
                          className="object-contain"
                        />
                      ) : (
                        <span className="text-sm font-bold">{item.name.charAt(0)}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{item.name}</p>
                      {item.description && (
                        <p className="text-xs text-[var(--muted)]">{item.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={cn(
                        'text-xs px-2.5 py-1 rounded-full font-medium transition-colors',
                        connected
                          ? 'bg-emerald-500/20 text-emerald-400 connect-pulse'
                          : 'bg-white/5 text-[var(--muted)]'
                      )}
                    >
                      {connected ? 'Connected' : 'Not connected'}
                    </span>
                    <ConnectButton
                      connected={connected}
                      label={connected ? 'Manage' : 'Connect'}
                      onClick={() => {
                        if (connected && item.id === 'github') {
                          window.location.href = '/dashboard/integrations';
                        } else if (!connected) {
                          void handleConnect(item.id, item.oauth);
                        }
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="glass-panel rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <Key className="w-4 h-4 text-[var(--accent)]" />
              Custom API Keys & Webhooks
            </h3>
            <p className="text-xs text-[var(--muted)] mt-1">
              Add your own API keys, webhook URLs, or secrets.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-[var(--accent)] text-black font-semibold"
          >
            <Plus className="w-3.5 h-3.5" /> Add New Credential
          </button>
        </div>

        {showForm && (
          <div className="grid sm:grid-cols-2 gap-3 p-4 rounded-lg border border-[var(--card-border)] bg-white/[0.02]">
            <input
              placeholder="Service Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="px-3 py-2 rounded-lg bg-white/5 border border-[var(--card-border)] text-sm"
            />
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as CustomCredential['type'] })}
              className="px-3 py-2 rounded-lg bg-white/5 border border-[var(--card-border)] text-sm"
            >
              <option value="api_key">API Key</option>
              <option value="webhook">Webhook</option>
              <option value="secret">Secret</option>
            </select>
            <input
              placeholder="API Key / Secret"
              type="password"
              value={form.apiKey}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
              className="px-3 py-2 rounded-lg bg-white/5 border border-[var(--card-border)] text-sm sm:col-span-2"
            />
            <input
              placeholder="Webhook URL (optional)"
              value={form.webhookUrl}
              onChange={(e) => setForm({ ...form, webhookUrl: e.target.value })}
              className="px-3 py-2 rounded-lg bg-white/5 border border-[var(--card-border)] text-sm"
            />
            <input
              placeholder="Base URL (optional)"
              value={form.baseUrl}
              onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
              className="px-3 py-2 rounded-lg bg-white/5 border border-[var(--card-border)] text-sm"
            />
            <button
              type="button"
              onClick={saveCustomCred}
              className="sm:col-span-2 py-2 rounded-lg bg-[var(--primary)] text-sm font-medium"
            >
              Save Credential
            </button>
          </div>
        )}

        {customCreds.length === 0 ? (
          <p className="text-sm text-[var(--muted)] text-center py-4">No custom credentials yet.</p>
        ) : (
          <div className="space-y-2">
            {customCreds.map((cred) => (
              <div
                key={cred.id}
                className="flex items-center justify-between px-3 py-2 rounded-lg border border-[var(--card-border)]"
              >
                <div>
                  <p className="text-sm font-medium">{cred.name}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {cred.type} · {cred.keyPreview}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => deleteCred(cred.id)}
                  className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg"
                  aria-label="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
