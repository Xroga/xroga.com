'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Key, Link2, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface CatalogItem {
  id: string;
  name: string;
  category: string;
  freeTier: boolean;
  requiresApiKey: boolean;
  endpoint: string;
  signupUrl?: string;
  topUpUrl?: string;
  userGuidance: string;
  xrogaProvided?: boolean;
}

interface KeyStatus {
  provider: string;
  connected: boolean;
  masked?: string;
}

const PROVIDER_FOR_ID: Record<string, string> = {
  'openrouter-free-models': 'openrouter',
  'huggingface-inference-free': 'huggingface',
  'gemini-free': 'gemini',
  freetheai: 'openrouter',
};

const REMOVED_LEGACY_PROVIDERS = new Set([
  'grok-xai',
  'deepseek-api',
  'groq-free',
  'anthropic-api',
  'claude',
  'grok',
  'deepseek',
  'groq',
]);

/** AI integrations catalog + BYOK key connect (server vault) */
export function AiIntegrationsPanel({ compact }: { compact?: boolean }) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [keys, setKeys] = useState<KeyStatus[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  /** Per-row drafts so paste fields don't fight each other */
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const [cat, k] = await Promise.all([
        api.integrations.aiCatalog(),
        api.integrations.providerKeys(),
      ]);
      setCatalog(cat.catalog);
      setKeys(k.keys);
    } catch {
      /* optional */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const isConnected = (item: CatalogItem) => {
    const p = PROVIDER_FOR_ID[item.id];
    return p ? keys.some((k) => k.provider === p && k.connected) : false;
  };

  async function saveKey(item: CatalogItem) {
    const provider = PROVIDER_FOR_ID[item.id];
    const draft = (drafts[item.id] || '').trim();
    if (!provider || !draft) {
      toast.error('Paste your API key first');
      return;
    }
    setSavingId(item.id);
    try {
      await api.integrations.saveProviderKey(provider, draft);
      toast.success(`${item.name} key encrypted & saved to your Xroga account`);
      setDrafts((d) => ({ ...d, [item.id]: '' }));
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  const show = catalog.filter(
    (c) =>
      !REMOVED_LEGACY_PROVIDERS.has(c.id) &&
      !/deepseek|claude|anthropic|groq|grok/i.test(`${c.id} ${c.name}`) &&
      (c.xrogaProvided || c.freeTier || ['gemini-free', 'pollinations-text'].includes(c.id))
  );

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <p className={`text-[var(--muted)] ${compact ? 'text-[9px]' : 'text-[11px]'} leading-relaxed`}>
        Legacy DeepSeek / Claude / Grok / Groq key vaults and usage meters are retired.
        Keep GitHub and deploy integrations connected for builds.
      </p>
      <ul className={`space-y-2 ${compact ? 'text-[10px]' : 'text-[12px]'}`}>
        {show.map((item) => {
          const connected = isConnected(item);
          const provider = PROVIDER_FOR_ID[item.id];
          return (
            <li
              key={item.id}
              className="rounded-lg border border-[var(--card-border)] bg-[var(--foreground)]/[0.02] p-2.5 space-y-1.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-[var(--foreground)] flex items-center gap-1.5 flex-wrap">
                    {item.xrogaProvided && <Sparkles className="h-3 w-3 text-[var(--accent)]" />}
                    {item.name}
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                        item.freeTier
                          ? 'bg-emerald-500/15 text-emerald-600'
                          : 'bg-amber-500/15 text-amber-600'
                      }`}
                    >
                      {item.xrogaProvided ? 'XROGA ACTIVE' : item.freeTier ? 'FREE' : 'PAID'}
                    </span>
                  </p>
                  <p className="text-[var(--muted)] mt-0.5 leading-snug">{item.userGuidance}</p>
                </div>
                {connected && (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" aria-label="Connected" />
                )}
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                {item.signupUrl && (
                  <a
                    href={item.signupUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline text-[10px]"
                  >
                    <Link2 className="h-3 w-3" />
                    {item.requiresApiKey ? 'Get API key' : 'Learn more'}
                  </a>
                )}
                {item.topUpUrl && !item.freeTier && (
                  <a
                    href={item.topUpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-amber-600 hover:underline text-[10px]"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Top up credits
                  </a>
                )}
              </div>
              {provider && item.requiresApiKey && !item.xrogaProvided && (
                <div className="flex flex-col sm:flex-row gap-1.5 pt-1">
                  <input
                    type="password"
                    autoComplete="off"
                    placeholder={
                      connected
                        ? `Replace key (${keys.find((k) => k.provider === provider)?.masked})`
                        : 'Paste API key here — encrypted in your Xroga account'
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
                </div>
              )}
              {!item.requiresApiKey && item.freeTier && !item.xrogaProvided && (
                <p className="text-[9px] text-emerald-600/90">
                  No key needed — Xroga wires this into your generated site so the preview works live.
                </p>
              )}
              {!item.freeTier && item.requiresApiKey && !connected && !item.xrogaProvided && (
                <p className="text-[9px] text-amber-600/90">
                  Paid API — add credits on the provider site, then paste your key here. Encrypted vault; never pushed to GitHub.
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
