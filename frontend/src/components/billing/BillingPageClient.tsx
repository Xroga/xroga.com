'use client';

import { Lock, Shield } from 'lucide-react';
import { PageFullscreenFrame } from '@/components/layout/PageFullscreenFrame';
import { PlanUsageSettingsPanel } from '@/components/settings/PlanUsageSettingsPanel';
import { SubscriptionManagePanel } from '@/components/billing/SubscriptionManagePanel';

export function BillingPageClient() {
  return (
    <PageFullscreenFrame>
      <div className="max-w-4xl mx-auto space-y-8">
        <header>
          <h1 className="text-2xl sm:text-3xl font-bold">Plan & Usage</h1>
          <p className="text-sm text-[var(--muted)] mt-1">One Xroga AI plan, durable 30-day cycles, and truthful capacity pacing.</p>
        </header>

        <PlanUsageSettingsPanel />
        <SubscriptionManagePanel />

        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div className="glass-panel rounded-xl p-4 flex gap-3">
            <Shield className="w-5 h-5 text-[var(--accent)] shrink-0" />
            <div><p className="font-semibold">Verified checkout</p><p className="text-[var(--muted)] text-xs mt-1">Paid access is activated only by a valid signed Lemon Squeezy event.</p></div>
          </div>
          <div className="glass-panel rounded-xl p-4 flex gap-3">
            <Lock className="w-5 h-5 text-[var(--accent)] shrink-0" />
            <div><p className="font-semibold">No hidden provider balance</p><p className="text-[var(--muted)] text-xs mt-1">Xroga shows capacity percentages, pacing, and cycle dates without exposing internal provider accounting.</p></div>
          </div>
        </div>
      </div>
    </PageFullscreenFrame>
  );
}
