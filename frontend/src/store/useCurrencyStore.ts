'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CurrencyCode } from '@/lib/currency';
import { currencyForCountry, isUsdRegion } from '@/lib/currency';

interface CurrencyState {
  country: string;
  currency: CurrencyCode;
  showUsd: boolean;
  loaded: boolean;
  setShowUsd: (v: boolean) => void;
  detect: () => Promise<void>;
}

export const useCurrencyStore = create<CurrencyState>()(
  persist(
    (set, get) => ({
      country: 'US',
      currency: 'USD',
      showUsd: false,
      loaded: false,
      setShowUsd: (showUsd) => set({ showUsd }),
      detect: async () => {
        if (get().loaded) return;
        try {
          const res = await fetch('/api/geo');
          const data = (await res.json()) as { country?: string };
          const country = data.country ?? 'US';
          const currency = currencyForCountry(country);
          set({
            country,
            currency,
            showUsd: isUsdRegion(country),
            loaded: true,
          });
        } catch {
          set({ loaded: true });
        }
      },
    }),
    { name: 'xroga-currency', partialize: (s) => ({ showUsd: s.showUsd, country: s.country, currency: s.currency }) }
  )
);
