'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { INTEGRATIONS } from '@/lib/integrations';
import { ConnectedServicesSection } from '@/components/integrations/ConnectedServicesSection';
import { CustomCredentialsSection } from '@/components/integrations/CustomCredentialsSection';
import { IntegrationRequestBanner } from '@/components/integrations/IntegrationRequestBanner';
import { ConnectShipWizard } from '@/components/integrations/ConnectShipWizard';
import { UserOwnedPublishPanel } from '@/components/publish/UserOwnedPublishPanel';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { SettingsDivider, SettingsPanelHeader, SettingsStack } from '@/components/settings/SettingsPrimitives';
import { CONNECTABLE_INTEGRATION_IDS, isConnectableIntegration } from '@/lib/connectableIntegrations';

export function IntegrationsPanel() {
  const [search, setSearch] = useState('');
  const [comingSoonOpen, setComingSoonOpen] = useState(false);

  // Surface OAuth-callback toasts (?vercel=connected, ?github=error, …) then scrub the URL.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search);
    const vercel = q.get('vercel');
    const github = q.get('github');
    const supabase = q.get('supabase');
    const message = q.get('message');
    if (vercel === 'connected') {
      toast.success(q.get('username') ? `Vercel connected as @${q.get('username')}` : 'Vercel connected');
    } else if (vercel === 'error' || vercel === 'missing_code') {
      toast.error(message || 'Vercel authorize failed — try again');
    } else if (vercel === 'setup' || q.get('focus') === 'vercel') {
      try {
        const stored = sessionStorage.getItem('xroga-vercel-setup-error');
        if (stored) {
          toast.error(stored);
          sessionStorage.removeItem('xroga-vercel-setup-error');
        } else {
          toast('Connect Vercel here, approve deployment access, then choose a project', { icon: '▲' });
        }
      } catch {
        toast('Connect Vercel in Ship setup below', { icon: '▲' });
      }
      setTimeout(() => {
        document.getElementById('ship-setup')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 200);
    }
    if (github === 'connected') {
      toast.success(q.get('username') ? `GitHub connected as @${q.get('username')}` : 'GitHub connected');
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
      ['vercel', 'github', 'supabase', 'message', 'username', 'pick'].forEach((k) => url.searchParams.delete(k));
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  }, []);

  const comingSoon = useMemo(() => {
    const q = search.toLowerCase().trim();
    const list = INTEGRATIONS.filter((i) => !isConnectableIntegration(i.id));
    if (!q) return list;
    return list.filter((i) => i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q));
  }, [search]);

  const noResults = search.trim().length > 0 && comingSoon.length === 0;

  return (
    <SettingsStack>
      <SettingsPanelHeader
        title="Integrations"
        description="Connect GitHub + Vercel to ship. Supabase and AI keys are optional for static sites. Expo credentials live under Publish."
        action={
          <Badge tone="accent" dot>
            {CONNECTABLE_INTEGRATION_IDS.size} live
          </Badge>
        }
      />

      {/* 1. Ship readiness overview + 2. Required web deployment connections */}
      <ConnectShipWizard />

      {/* 4. Publishing platform setup */}
      <UserOwnedPublishPanel compact />

      <SettingsDivider label="Optional" />

      {/* 3. Optional product-service connections */}
      <ConnectedServicesSection />

      {/* 5. Custom credentials and webhooks */}
      <CustomCredentialsSection />

      <SettingsDivider label="Coming soon" />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search the coming-soon catalogue…"
          className="w-full rounded-token-sm border border-[var(--border-subtle)] bg-[var(--surface-inset)] py-2.5 pl-10 pr-4 text-sm text-[var(--text-primary)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
        />
      </div>

      {noResults && <IntegrationRequestBanner query={search.trim()} />}

      {/* 6. Coming-soon catalogue */}
      <div className="glass-panel overflow-hidden rounded-token-lg">
        <button
          type="button"
          onClick={() => setComingSoonOpen((o) => !o)}
          aria-expanded={comingSoonOpen}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[var(--surface-inset)]"
        >
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Coming soon</h3>
            <p className="text-xs text-[var(--text-secondary)]">{comingSoon.length} wishlist integrations — not live OAuth yet</p>
          </div>
          <ChevronDown
            aria-hidden="true"
            className={cn('h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform', comingSoonOpen && 'rotate-180')}
          />
        </button>
        {comingSoonOpen ? (
          <div className="max-h-72 divide-y divide-[var(--border-subtle)] overflow-y-auto border-t border-[var(--border-subtle)]">
            {comingSoon.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5 opacity-80">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-token-sm bg-[var(--surface-inset)] text-xs font-bold">
                    {item.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">{item.name}</p>
                    <p className="truncate text-[10px] text-[var(--text-muted)]">{item.category}</p>
                  </div>
                </div>
                <Badge tone="neutral" className="shrink-0">
                  Coming soon
                </Badge>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </SettingsStack>
  );
}
