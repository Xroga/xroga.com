'use client';

import Link from 'next/link';
import { CreditCard, ArrowRight } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { UpgradeProButton } from '@/components/ui/Uiverse';
import { SubscriptionManagePanel } from '@/components/billing/SubscriptionManagePanel';
import { useRouter } from 'next/navigation';

export function PlanUsageSettingsPanel() {
  const router = useRouter();
  const planName = useAppStore((s) => s.planName);
  const planTier = useAppStore((s) => s.planTier);

  return (
    <div className="space-y-5">
      <h2 className="font-semibold text-lg flex items-center gap-2">
        <CreditCard className="w-5 h-5 text-[var(--accent)]" />
        Plan
      </h2>

      <div className="p-5 rounded-xl border border-[var(--accent)]/30 bg-gradient-to-br from-[var(--accent)]/10 to-transparent">
        <p className="font-medium text-lg">{planName ?? 'Basic'}</p>
        {planTier && planTier !== 'unpaid' && (
          <p className="text-xs text-[var(--muted)] capitalize mt-0.5">{planTier} tier</p>
        )}
        <p className="text-sm text-[var(--muted)] mt-3">
          Legacy token quotas and provider usage meters have been removed. Plan billing stays available
          below.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <UpgradeProButton onClick={() => router.push('/pricing')} />
          <Link
            href="/dashboard/billing"
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold border border-[var(--card-border)] hover:border-[var(--accent)]/40 transition-colors"
          >
            Manage billing <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      <SubscriptionManagePanel />
    </div>
  );
}
