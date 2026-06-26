'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
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

      const paddleToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
      if (paddleToken && result.priceId) {
        const { initializePaddle } = await import('@paddle/paddle-js');
        const paddle = await initializePaddle({
          token: paddleToken,
          environment: (process.env.NEXT_PUBLIC_PADDLE_ENV as 'sandbox' | 'production') ?? 'production',
        });
        if (paddle) {
          paddle.Checkout.open({
            items: [{ priceId: result.priceId, quantity: 1 }],
            customData: result.customData,
          });
          onSuccess?.();
          return;
        }
      }

      toast.error('Checkout not configured. Set Paddle price IDs on the API.');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : (err as Error).message;
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCheckout}
      disabled={loading}
      className={cn(
        'px-4 py-2.5 rounded-xl text-sm font-semibold transition-all',
        'bg-gradient-to-r from-[var(--accent)] to-[var(--primary)] text-black hover:opacity-90 disabled:opacity-50',
        className
      )}
    >
      {loading ? 'Opening checkout…' : label}
    </button>
  );
}
