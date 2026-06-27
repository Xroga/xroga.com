'use client';

import { useMemo } from 'react';
import { useCurrencyStore } from '@/store/useCurrencyStore';
import { formatMoney, type CurrencyCode } from '@/lib/currency';

export function usePlanPrice(usdAmount: number) {
  const currency = useCurrencyStore((s) => s.currency);
  const showUsd = useCurrencyStore((s) => s.showUsd);
  const country = useCurrencyStore((s) => s.country);
  const setShowUsd = useCurrencyStore((s) => s.setShowUsd);

  const display = useMemo(() => {
    if (showUsd || country === 'US') {
      return { primary: formatMoney(usdAmount, 'USD'), secondary: null as string | null, currency: 'USD' as CurrencyCode };
    }
    const local = formatMoney(usdAmount, currency);
    const usd = formatMoney(usdAmount, 'USD');
    return { primary: local, secondary: usd, currency };
  }, [usdAmount, currency, showUsd, country]);

  return { ...display, showUsd, setShowUsd, country, isForeign: country !== 'US' };
}

export function CurrencyToggle() {
  const { isForeign, showUsd, setShowUsd, currency } = usePlanPrice(0);
  if (!isForeign) return null;
  return (
    <button
      type="button"
      onClick={() => setShowUsd(!showUsd)}
      className="text-[10px] px-2.5 py-1 rounded-full border border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
    >
      {showUsd ? `Show ${currency}` : 'Show USD $'}
    </button>
  );
}

export function PlanPrice({ usd, className }: { usd: number; className?: string }) {
  const { primary, secondary } = usePlanPrice(usd);
  return (
    <span className={className}>
      {primary}
      <span className="text-xs font-normal text-[var(--muted)]">/mo</span>
      {secondary && <span className="block text-[10px] text-[var(--muted)] font-normal">≈ {secondary}/mo USD</span>}
    </span>
  );
}
