'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { api, ApiError } from '@/lib/api';
import { BuyNowButton } from '@/components/ui/Uiverse';
import type { PlanTier } from '@/lib/plans';

interface CheckoutButtonProps {
  planTier: PlanTier;
  label?: string;
  className?: string;
  onSuccess?: () => void;
}

export function CheckoutButton({
  planTier,
  label = 'Subscribe',
  className,
  onSuccess,
}: CheckoutButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleCheckout() {
    setLoading(true);
    try {
      const result = await api.billing.createCheckout(planTier);

      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
        onSuccess?.();
        return;
      }

      toast.error(
        'Checkout not configured. Add Lemon Squeezy keys on Fly (LEMONSQUEEZY_API_KEY, STORE_ID, VARIANT_*) — see docs/LEMONSQUEEZY_SETUP.md',
      );
    } catch (err) {
      const message = err instanceof ApiError ? err.message : (err as Error).message;
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  if (className) {
    return (
      <button type="button" onClick={handleCheckout} disabled={loading} className={className}>
        {loading ? 'Opening…' : label}
      </button>
    );
  }

  return (
    <BuyNowButton
      label={label === 'Subscribe' ? 'BUY NOW' : label}
      onClick={handleCheckout}
      disabled={loading}
    />
  );
}
