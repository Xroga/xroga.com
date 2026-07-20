'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import Image from 'next/image';
import { INTEGRATIONS, INTEGRATION_CATEGORIES } from '@/lib/integrations';
import { getIntegrationLogo } from '@/lib/integrationLogos';
import { GitHubConnect } from '@/components/integrations/GitHubConnect';
import { ConnectedServicesSection } from '@/components/integrations/ConnectedServicesSection';
import { CustomCredentialsSection } from '@/components/integrations/CustomCredentialsSection';
import { IntegrationRequestBanner } from '@/components/integrations/IntegrationRequestBanner';
import { ConnectShipWizard } from '@/components/integrations/ConnectShipWizard';
import { UserOwnedPublishPanel } from '@/components/publish/UserOwnedPublishPanel';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { ConnectButton } from '@/components/ui/Uiverse';
import { cn } from '@/lib/utils';
import { isConnectableIntegration } from '@/lib/connectableIntegrations';

export function IntegrationsPanel() {
  const [search, setSearch] = useState('');
  const [githubConnected, setGithubConnected] = useState(false);

  useEffect(() => {
    api.github
      .status()
      .then((s) => setGithubConnected(s.connected))
      .catch(() => setGithubConnected(false));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search);
    const vercel = q.get('vercel');
    const github = q.get('github');
    const supabase = q.get('supabase');
    const message = q.get('message');
    if (vercel === 'connected') {
      toast.success(
        q.get('username') ? `Vercel connected as @${q.get('username')}` : 'Vercel connected',
      );
    } else if (vercel === 'error' || vercel === 'missing_code') {
      toast.error(message || 'Vercel authorize failed — try again');
    }
    if (github === 'connected') {
      setGithubConnected(true);
      toast.success(
        q.get('username') ? `GitHub connected as @${q.get('username')}` : 'GitHub connected',
      );
    } else if (github === 'error' || github === 'missing_code') {
      toast.error(message || 'GitHub authorize failed — try again');
    }
    if (supabase === 'connected') {
      toast.success('Supabase authorized');
    } else if (supabase === 'error' || supabase === 'missing_code') {
      toast.error(message || 'Supabase authorize failed — try again');
    }
    if (vercel || github || supabase) {
      const url = new URL(window.location.href);
      ['vercel', 'github', 'supabase', 'message', 'username', 'pick'].forEach((k) =>
        url.searchParams.delete(k),
      );
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return INTEGRATIONS;
    return INTEGRATIONS.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q)
    );
  }, [search]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof INTEGRATIONS>();
    const catsInData = new Set(filtered.map((i) => i.category));
    const catList = Array.from(catsInData);
    const ordered = [
      ...INTEGRATION_CATEGORIES.filter((c) => catsInData.has(c)),
      ...catList.filter((c) => !INTEGRATION_CATEGORIES.includes(c as (typeof INTEGRATION_CATEGORIES)[number])).sort(),
    ];
    for (const cat of ordered) {
      const items = filtered.filter((i) => i.category === cat);
      if (items.length) map.set(cat, items);
    }
    return map;
  }, [filtered]);

  const noResults = search.trim().length > 0 && filtered.length === 0;

  async function handleConnect(id: string, oauth?: boolean) {
    if (id === 'github') {
      try {
        const { url } = await api.github.oauthUrl();
        if (!url) {
          toast.error('GitHub OAuth not configured');
          return;
        }
        const popup = window.open(url, 'xroga-github-oauth', 'width=600,height=720,scrollbars=yes');
        if (!popup) window.location.href = url;
      } catch {
        toast.error('GitHub OAuth not configured');
      }
      return;
    }
    if (id === 'vercel') {
      const { openVercelOAuthPopup, listenVercelOAuthMessages } = await import(
        '@/lib/vercelConnect'
      );
      const stop = listenVercelOAuthMessages(
        (username) => {
          toast.success(username ? `Vercel connected as @${username}` : 'Vercel connected');
        },
        (msg) => {
          toast.error(msg);
        }
      );
      const result = await openVercelOAuthPopup();
      if (!result.opened) {
        stop();
        toast.error(result.error || 'Could not open Vercel authorization');
      } else if (!result.popup) {
        toast.success('Continue authorizing Vercel in this tab…');
      }
      return;
    }
    if (id === 'supabase') {
      toast('Use Ship setup → Authorize Supabase (no paste)', { icon: '🗄' });
      document.getElementById('ship-setup')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (oauth) {
      toast('OAuth coming soon — connect via Custom API Keys for now', { icon: '🔗' });
    } else {
      toast('Coming soon — add credentials in Custom API Keys below', { icon: '🔑' });
    }
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-semibold text-lg">Integrations</h2>
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30">
            {INTEGRATIONS.length} total
          </span>
        </div>
        <p className="text-sm text-[var(--muted)] mt-1 font-coding">
          Connect GitHub, Vercel, Supabase, Brevo, Cloudflare, and Lemon Squeezy. Everything else is coming soon.
        </p>
      </div>

      <ConnectShipWizard />

      <UserOwnedPublishPanel compact />

      <ConnectedServicesSection />

      <CustomCredentialsSection />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search integrations..."
          className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white/5 border border-[var(--card-border)] text-sm focus:border-[var(--accent)]/50 focus:outline-none"
        />
      </div>

      {noResults && <IntegrationRequestBanner query={search.trim()} />}

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
              const connectable = isConnectableIntegration(item.id);
              const isLiveConnected = item.id === 'github' && githubConnected;
              return (
                <div
                  key={item.id}
                  className={cn(
                    'integration-card relative flex items-center justify-between gap-4 px-4 py-3',
                    connectable ? 'hover:bg-white/[0.03]' : 'overflow-hidden'
                  )}
                >
                  <div
                    className={cn(
                      'flex items-center gap-3 min-w-0 flex-1',
                      !connectable && 'xv-integration-blur'
                    )}
                  >
                    <div className="w-10 h-10 rounded-xl integration-logo-wrap flex items-center justify-center shrink-0 overflow-hidden">
                      {getIntegrationLogo(item.id, item.name) ? (
                        <Image
                          src={getIntegrationLogo(item.id, item.name)!}
                          alt=""
                          width={28}
                          height={28}
                          unoptimized
                          className="object-contain integration-logo-img"
                        />
                      ) : (
                        <span className="text-sm font-bold">{item.name.charAt(0)}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium font-claude">{item.name}</p>
                      {item.description && (
                        <p className="text-xs text-[var(--muted)] font-coding">{item.description}</p>
                      )}
                    </div>
                  </div>
                  {connectable ? (
                    <div className="flex items-center gap-3 shrink-0">
                      <span
                        className={cn(
                          'text-xs px-2.5 py-1 rounded-full font-medium transition-colors font-coding',
                          isLiveConnected
                            ? 'bg-blue-500/20 text-blue-400 connect-pulse'
                            : 'bg-white/5 text-[var(--muted)]'
                        )}
                      >
                        {isLiveConnected ? 'Connected' : 'Not connected'}
                      </span>
                      <ConnectButton
                        connected={isLiveConnected}
                        label={isLiveConnected ? 'Manage' : 'Connect'}
                        onClick={() => {
                          if (isLiveConnected && item.id === 'github') {
                            window.location.href = '/dashboard/integrations';
                          } else if (!isLiveConnected) {
                            void handleConnect(item.id, item.oauth);
                          }
                        }}
                      />
                    </div>
                  ) : (
                    <div className="shrink-0 relative z-[1]">
                      <span className="text-[10px] px-2.5 py-1 rounded-md bg-[var(--foreground)]/10 text-[var(--muted)] font-coding uppercase tracking-wider">
                        Coming soon
                      </span>
                    </div>
                  )}
                  {!connectable && (
                    <div className="pointer-events-none absolute inset-0 bg-[var(--background)]/25 backdrop-blur-[1.5px]" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
