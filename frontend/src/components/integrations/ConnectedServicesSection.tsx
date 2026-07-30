'use client';

import { useEffect, useState } from 'react';
import { FreeApiOptionsPanel } from '@/components/integrations/FreeApiOptionsPanel';
import { Key, Lock } from 'lucide-react';
import { loadCredentials, hasVault } from '@/lib/credentialVault';
import toast from 'react-hot-toast';
import { SettingsPanelHeader } from '@/components/settings/SettingsPrimitives';

const CONNECTABLE = [
  { id: 'brevo', name: 'Brevo', detail: 'Transactional email' },
  { id: 'cloudflare', name: 'Cloudflare', detail: 'CDN, DNS, SSL, R2 storage' },
  { id: 'lemon_squeezy', name: 'Lemon Squeezy', detail: 'Payments & subscriptions (MoR)' },
] as const;

/**
 * Optional product-service connections. GitHub/Vercel/Supabase — the required
 * web deployment connections — live exclusively in ConnectShipWizard so
 * connection state isn't shown or managed from two places at once.
 */
export function ConnectedServicesSection() {
  const [customCount, setCustomCount] = useState(0);
  const vaultReady = hasVault();

  useEffect(() => {
    setCustomCount(loadCredentials().length);
  }, []);

  function connectSoon(name: string) {
    toast(`${name} connect — add credentials in Custom API Keys`, { icon: '🔑' });
  }

  return (
    <div className="glass-panel rounded-token-lg p-4 space-y-4">
      <SettingsPanelHeader
        icon={<Lock className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />}
        title="Optional connections"
        description="Product services beyond the required GitHub + Vercel deploy path."
      />

      <div className="space-y-2">
        {CONNECTABLE.map((svc) => (
          <div
            key={svc.id}
            className="flex items-start gap-3 rounded-token-md border border-[var(--border-subtle)] bg-[var(--surface-inset)] p-3"
          >
            <Key className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--text-primary)]">{svc.name}</p>
              <p className="text-xs text-[var(--text-secondary)]">{svc.detail}</p>
              <button
                type="button"
                className="mt-2 rounded-token-sm border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-bold hover:border-[var(--accent)]/50"
                onClick={() => connectSoon(svc.name)}
              >
                Connect
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-token-md border border-[var(--border-subtle)] p-3">
        <p className="mb-1 text-xs font-semibold text-[var(--text-secondary)]">More free options</p>
        <FreeApiOptionsPanel compact />
      </div>

      <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
        {vaultReady ? (
          <>
            Your vault has {customCount} custom credential{customCount === 1 ? '' : 's'}. Unlock with your vault password to view or copy keys below.
          </>
        ) : (
          <>
            <strong className="text-[var(--text-primary)]">Set a vault password</strong> in Custom API Keys — required every time you view or copy an integrated key.
          </>
        )}
      </p>
    </div>
  );
}
