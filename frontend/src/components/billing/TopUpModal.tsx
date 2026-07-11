'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { X, Zap, Sparkles } from 'lucide-react';
import { GALACTIC_PLANS, COMING_SOON_PLANS } from '@/lib/plans';
import { CheckoutButton } from './CheckoutButton';
import { CurrencyToggle } from '@/hooks/usePlanPrice';
import { usePlanPrice } from '@/hooks/usePlanPrice';
import { useT } from '@/components/providers/LanguageProvider';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';

interface TopUpModalProps {
  open: boolean;
  onClose: () => void;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

export function TopUpModal({ open, onClose }: TopUpModalProps) {
  const router = useRouter();
  const t = useT();
  const usage = useAppStore((s) => s.tokenUsage);
  const remaining = usage?.totalTokensRemaining ?? 0;
  const total = usage?.totalLimit ?? 7_000_000;
  const percentUsed = usage?.percentUsed ?? 0;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative w-full sm:max-w-2xl xv-topup-modal rounded-t-2xl sm:rounded-2xl border border-[var(--card-border)] max-h-[94vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="shrink-0 px-5 pt-5 pb-4 border-b border-[var(--card-border)]/60 bg-[var(--card)]/95 backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-full bg-[var(--accent)]/15 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-[var(--accent)]" />
                </div>
                <h2 className="text-lg font-bold">Token Balance & Plans</h2>
              </div>

              <div className="rounded-xl bg-gradient-to-br from-[var(--accent)]/10 to-violet-500/5 border border-[var(--accent)]/20 p-3 mb-3">
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-[var(--muted)]">Remaining</span>
                  <span className="font-bold font-mono">
                    {formatTokens(remaining)} <span className="text-[var(--muted)] font-normal">/ {formatTokens(total)}</span>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-violet-500 transition-all"
                    style={{ width: `${Math.min(100, percentUsed)}%` }}
                  />
                </div>
                <p className="text-[10px] text-[var(--muted)] mt-1.5">{percentUsed.toFixed(0)}% used this month</p>
              </div>

              <p className="text-[10px] text-[var(--muted)]">{t('checkout.methods')}</p>
              <div className="mt-2">
                <CurrencyToggle />
              </div>
            </div>
            <button type="button" onClick={onClose} className="p-2 rounded-full hover:bg-white/5 shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 bg-[var(--background)]/80">
          <p className="text-xs font-semibold text-[var(--muted)] mb-3 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
            Higher plans include more AI tokens & XRG
          </p>

          <div className="space-y-3">
            {GALACTIC_PLANS.map((plan) => (
              <PlanRow key={plan.tier} plan={plan} onSuccess={onClose} />
            ))}
          </div>

          <div className="mt-4 xv-billing-card rounded-xl border-dashed px-4 py-3 opacity-80">
            <p className="text-[10px] font-semibold text-[var(--muted)] mb-2">Micro tiers — coming soon</p>
            <div className="flex gap-2">
              {COMING_SOON_PLANS.map((p) => (
                <div key={p.price} className="flex-1 text-center py-2 rounded-lg bg-white/[0.04] border border-[var(--card-border)]/50">
                  <p className="text-sm font-bold">{p.price}</p>
                  <p className="text-[8px] text-[var(--muted)]">/mo</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="shrink-0 flex flex-wrap gap-2 justify-center px-5 py-4 border-t border-[var(--card-border)]/60 bg-[var(--card)]/90">
          <Link href="/pricing" onClick={onClose} className="xv-pricing-details-btn !text-xs">
            Full pricing details
          </Link>
          <button
            type="button"
            onClick={() => {
              onClose();
              router.push('/dashboard/home');
            }}
            className="xv-footer-pill !text-xs !text-[var(--foreground)]"
          >
            Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

function PlanRow({ plan, onSuccess }: { plan: (typeof GALACTIC_PLANS)[0]; onSuccess: () => void }) {
  const { primary, secondary } = usePlanPrice(plan.usdPrice);
  return (
    <div
      className={cn(
        'xv-billing-card flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-3 rounded-xl px-4 py-3.5 transition-all',
        plan.highlight && 'xv-billing-card--highlight'
      )}
    >
      <div className="flex-1 min-w-[140px]">
        {plan.highlight && (
          <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--accent)] block mb-0.5">
            ★ Most Popular
          </span>
        )}
        <p className="font-bold text-[var(--foreground)]">{plan.name}</p>
        <p className="text-[10px] text-[var(--muted)]">{plan.tagline}</p>
        <div className="flex flex-wrap gap-2 mt-1.5">
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] font-semibold">
            {plan.aiTokensLabel}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-semibold">
            {plan.xrgLabel}
          </span>
        </div>
      </div>
      <div className="text-left sm:text-right shrink-0">
        <p className="text-lg font-bold text-[var(--foreground)]">
          {primary}
          <span className="text-[10px] font-normal text-[var(--muted)]">/mo</span>
        </p>
        {secondary && <p className="text-[9px] text-[var(--muted)]">≈ {secondary}/mo</p>}
      </div>
      <div className="w-full sm:w-auto shrink-0 sm:ml-auto">
        <CheckoutButton planTier={plan.tier} className="!w-full sm:!w-auto min-w-[100px]" onSuccess={onSuccess} />
      </div>
    </div>
  );
}
