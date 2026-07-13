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
  'grok-xai': 'grok',
  'deepseek-api': 'deepseek',
  'groq-free': 'groq',
  'anthropic-api': 'anthropic',
  'openrouter-free-models': 'openrouter',
  'huggingface-inference-free': 'huggingface',
  'gemini-free': 'gemini',
};

/** AI integrations catalog + BYOK key connect (server vault) */
export function AiIntegrationsPanel({ compact }: { compact?: boolean }) {
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [keys, setKeys] = useState<KeyStatus[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [draftKey, setDraftKey] = useState('');

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
    if (!provider || !draftKey.trim()) {
      toast.error('Paste your API key first');
      return;
    }
    setConnecting(item.id);
    try {
      await api.integrations.saveProviderKey(provider, draftKey.trim());
      toast.success(`${item.name} key saved to your Xroga account`);
      setDraftKey('');
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setConnecting(null);
    }
  }

  const show = catalog.filter(
    (c) => c.xrogaProvided || c.freeTier || ['grok-xai', 'deepseek-api', 'groq-free', 'gemini-free'].includes(c.id)
  );

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <p className={`text-[var(--muted)] ${compact ? 'text-[9px]' : 'text-[11px]'} leading-relaxed`}>
        Xroga uses <strong className="text-[var(--foreground)]">SearXNG + Tavily</strong> for live web research during builds.
        Generated code can use <strong className="text-[var(--foreground)]">free endpoints</strong> first — add paid keys only when you need them.
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
                    placeholder={connected ? `Replace key (${keys.find((k) => k.provider === provider)?.masked})` : 'Paste API key — stored encrypted in your account'}
                    className="flex-1 min-w-0 rounded-md border border-[var(--card-border)] bg-[var(--background)] px-2 py-1.5 text-[11px] font-mono"
                    value={connecting === item.id ? draftKey : ''}
                    onChange={(e) => {
                      setConnecting(item.id);
                      setDraftKey(e.target.value);
                    }}
                  />
                  <button
                    type="button"
                    disabled={connecting === item.id && !draftKey.trim()}
                    onClick={() => void saveKey(item)}
                    className="shrink-0 inline-flex items-center justify-center gap-1 rounded-md bg-[var(--accent)] text-white px-3 py-1.5 text-[10px] font-semibold disabled:opacity-50"
                  >
                    <Key className="h-3 w-3" />
                    Save to Xroga
                  </button>
                </div>
              )}
              {!item.freeTier && item.requiresApiKey && !connected && !item.xrogaProvided && (
                <p className="text-[9px] text-amber-600/90">
                  Paid API — add credits on the provider site, then save your key here. Xroga never charges your card for third-party APIs.
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
