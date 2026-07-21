'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import Image from 'next/image';
import { INTEGRATIONS } from '@/lib/integrations';
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
import {
  CONNECTABLE_INTEGRATION_IDS,
  isConnectableIntegration,
} from '@/lib/connectableIntegrations';

const LIVE_ORDER = [
  'github',
  'vercel',
  'supabase',
  'brevo',
  'cloudflare',
  'cloudflare_r2',
  'cloudflare_workers_dns',
  'lemon_squeezy',
];

export function IntegrationsPanel() {
  const [search, setSearch] = useState('');
  const [githubConnected, setGithubConnected] = useState(false);
  const [vercelConnected, setVercelConnected] = useState(false);
  const [supabaseConnected, setSupabaseConnected] = useState(false);
  const [comingSoonOpen, setComingSoonOpen] = useState(false);

  useEffect(() => {
    void Promise.all([
      api.github.status().catch(() => ({ connected: false })),
      api.vercel.status().catch(() => ({ connected: false })),
      api.supabase.status().catch(() => ({
        oauthConnected: false,
        connected: false,
        provisioned: false,
        ready: false,
      })),
    ]).then(([gh, ve, sb]) => {
      setGithubConnected(Boolean(gh.connected));
      setVercelConnected(Boolean(ve.connected));
      setSupabaseConnected(
        Boolean(
          (sb as { oauthConnected?: boolean }).oauthConnected ||
            (sb as { connected?: boolean }).connected ||
            (sb as { provisioned?: boolean }).provisioned ||
            (sb as { ready?: boolean }).ready,
        ),
      );
    });
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
    } else if (vercel === 'setup' || q.get('focus') === 'vercel') {
      try {
        const stored = sessionStorage.getItem('xroga-vercel-setup-error');
        if (stored) {
          toast.error(stored);
          sessionStorage.removeItem('xroga-vercel-setup-error');
        } else {
          toast('Connect Vercel here — Authorize, or paste a personal token under Connected services', {
            icon: '▲',
          });
        }
      } catch {
        toast('Connect Vercel in Ship setup below', { icon: '▲' });
      }
      setTimeout(() => {
        document.getElementById('ship-setup')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 200);
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

  const liveIntegrations = useMemo(() => {
    const live = INTEGRATIONS.filter((i) => isConnectableIntegration(i.id));
    return live.sort((a, b) => {
      const ai = LIVE_ORDER.indexOf(a.id);
      const bi = LIVE_ORDER.indexOf(b.id);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }, []);

  const comingSoon = useMemo(() => {
    const q = search.toLowerCase().trim();
    const list = INTEGRATIONS.filter((i) => !isConnectableIntegration(i.id));
    if (!q) return list;
    return list.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q),
    );
  }, [search]);

  const liveFiltered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return liveIntegrations;
    return liveIntegrations.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q),
    );
  }, [liveIntegrations, search]);

  const noResults =
    search.trim().length > 0 && liveFiltered.length === 0 && comingSoon.length === 0;

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
        },
      );
      const result = await openVercelOAuthPopup();
      if (result.goToIntegrations && !result.opened) {
        stop();
        toast.error(
          result.error ||
            'OAuth session store unavailable — paste a Vercel personal token in Ship setup',
        );
        try {
          sessionStorage.setItem(
            'xroga-vercel-setup-error',
            (result.error || 'session store failed').slice(0, 280),
          );
        } catch {
          /* ignore */
        }
        // Stay on Integrations — scroll to Ship setup token paste (no blank popup loop)
        const url = new URL(window.location.href);
        url.searchParams.set('focus', 'vercel');
        url.searchParams.set('vercel', 'setup');
        url.hash = 'ship-setup';
        window.history.replaceState({}, '', url.toString());
        window.dispatchEvent(new Event('xroga-vercel-setup'));
        setTimeout(() => {
          document.getElementById('ship-setup')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 50);
        return;
      }
      if (!result.opened) {
        stop();
        toast.error(result.error || 'Could not open Vercel authorization');
      } else if (!result.popup) {
        toast.success('Continue authorizing Vercel in this tab…');
      }
      return;
    }
    if (id === 'supabase') {
      const { openSupabaseOAuthPopup, listenSupabaseOAuthMessages } = await import(
        '@/lib/supabaseConnect'
      );
      const stop = listenSupabaseOAuthMessages(
        (result) => {
          toast.success(result.message || 'Supabase authorized');
          if (result.needsProjectPick) {
            document
              .getElementById('ship-setup')
              ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        },
        (msg) => toast.error(msg),
      );
      const result = await openSupabaseOAuthPopup();
      if (!result.opened) {
        stop();
        toast.error(result.error || 'Could not open Supabase authorization');
      } else if (!result.popup) {
        toast.success('Continue authorizing Supabase in this tab…');
      }
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
            {CONNECTABLE_INTEGRATION_IDS.size} live
          </span>
        </div>
        <p className="text-sm text-[var(--muted)] mt-1 font-coding">
          Connect GitHub + Vercel to ship. Supabase and AI keys are optional for static sites. Expo
          credentials live under Publish.
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
          placeholder="Search live or coming soon…"
          className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-white/5 border border-[var(--card-border)] text-sm focus:border-[var(--accent)]/50 focus:outline-none"
        />
      </div>

      {noResults && <IntegrationRequestBanner query={search.trim()} />}

      {search.toLowerCase().includes('github') && (
        <div className="glass-panel rounded-xl p-4">
          <GitHubConnect />
        </div>
      )}

      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[var(--card-border)] bg-white/5">
          <h3 className="text-sm font-semibold">Live connects</h3>
          <p className="text-xs text-[var(--muted)]">
            {liveFiltered.length} ready to authorize / use
          </p>
        </div>
        <div className="divide-y divide-[var(--card-border)]">
          {liveFiltered.map((item) => {
            const isLiveConnected =
              (item.id === 'github' && githubConnected) ||
              (item.id === 'vercel' && vercelConnected) ||
              (item.id === 'supabase' && supabaseConnected);
            return (
              <div
                key={item.id}
                className="integration-card relative flex items-center justify-between gap-4 px-4 py-3 hover:bg-white/[0.03]"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
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
                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={cn(
                      'text-xs px-2.5 py-1 rounded-full font-medium transition-colors font-coding',
                      isLiveConnected
                        ? 'bg-blue-500/20 text-blue-400 connect-pulse'
                        : 'bg-white/5 text-[var(--muted)]',
                    )}
                  >
                    {isLiveConnected ? 'Connected' : 'Not connected'}
                  </span>
                  <ConnectButton
                    connected={isLiveConnected}
                    label={isLiveConnected ? 'Manage' : 'Connect'}
                    onClick={() => {
                      if (isLiveConnected) {
                        document
                          .getElementById('ship-setup')
                          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        if (item.id === 'supabase') {
                          window.dispatchEvent(new CustomEvent('xroga-supabase-setup'));
                        }
                      } else if (!isLiveConnected) {
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

      <div className="glass-panel rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setComingSoonOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/[0.03]"
        >
          <div>
            <h3 className="text-sm font-semibold">Coming soon</h3>
            <p className="text-xs text-[var(--muted)]">
              {comingSoon.length} wishlist integrations — not live OAuth yet
            </p>
          </div>
          <ChevronDown
            className={cn(
              'w-4 h-4 text-[var(--muted)] shrink-0 transition-transform',
              comingSoonOpen && 'rotate-180',
            )}
          />
        </button>
        {comingSoonOpen ? (
          <div className="border-t border-[var(--card-border)] max-h-72 overflow-y-auto divide-y divide-[var(--card-border)]">
            {comingSoon.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5 opacity-80"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0 text-xs font-bold">
                    {item.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="text-[10px] text-[var(--muted)] truncate">{item.category}</p>
                  </div>
                </div>
                <span className="text-[10px] px-2 py-1 rounded-md bg-[var(--foreground)]/10 text-[var(--muted)] font-coding uppercase tracking-wider shrink-0">
                  Coming soon
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
