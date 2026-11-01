'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { api, apiFetch, ApiError } from '@/lib/api';
import { BuyNowButton } from '@/components/ui/Uiverse';
import {requireCheckoutConfirmation,requireCheckoutDestination,type CheckoutConfirmation} from '@/lib/checkoutAdmission';

interface CheckoutButtonProps {
  planTier: 'spark';
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
  const [confirmation,setConfirmation]=useState<CheckoutConfirmation|null>(null);

  async function handleCheckout() {
    setLoading(true);
    try {
      const result = await api.billing.createCheckout(planTier);

      setConfirmation(requireCheckoutConfirmation(result.confirmation));
    } catch (err) {
      const message = err instanceof ApiError ? err.message : (err as Error).message;
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function finishCheckout(confirmed:boolean){
    if(!confirmation||loading)return;
    const selected=confirmation;setConfirmation(null);setLoading(true);
    try{
      if(!confirmed){await apiFetch(`/api/phase1/business-actions/confirmations/${encodeURIComponent(selected.id)}/cancel`,{method:'POST'});return;}
      requireCheckoutConfirmation(selected);
      const result=await api.billing.confirmCheckout(selected.id);
      window.location.assign(requireCheckoutDestination(result.purchaseUrl));onSuccess?.();
    }catch(error){toast.error(error instanceof Error?error.message:'Checkout approval could not complete. Check its status before trying again.');}
    finally{setLoading(false);}
  }

  if(confirmation)return <div role="group" aria-label="Confirm checkout">
    <p>{confirmation.summary}</p>
    <button type="button" onClick={()=>void finishCheckout(true)} disabled={loading}>Continue to secure checkout</button>
    <button type="button" onClick={()=>void finishCheckout(false)} disabled={loading}>Cancel</button>
  </div>;

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
