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

  return <BuyNowButton label={label === 'Subscribe' ? 'BUY NOW' : label} onClick={handleCheckout} disabled={loading} />;
}
