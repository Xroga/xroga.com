'use client';

import { useEffect } from 'react';
import { useCurrencyStore } from '@/store/useCurrencyStore';

export function CurrencyDetector() {
  const detect = useCurrencyStore((s) => s.detect);
  useEffect(() => {
    void detect();
  }, [detect]);
  return null;
}
