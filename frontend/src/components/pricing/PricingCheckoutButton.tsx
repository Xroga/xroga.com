'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, LockKeyhole, ShieldCheck, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, apiFetch, ApiError } from '@/lib/api';
import { BuyNowButton } from '@/components/ui/Uiverse';
import { requireCheckoutConfirmation, requireCheckoutDestination, type CheckoutConfirmation } from '@/lib/checkoutAdmission';
import styles from './PricingCheckoutButton.module.css';

interface CheckoutButtonProps {
  planTier: 'spark';
  label?: string;
  className?: string;
  onSuccess?: () => void;
}

export function PricingCheckoutButton({
  planTier,
  label = 'Subscribe',
  className,
  onSuccess,
}: CheckoutButtonProps) {
  const [loading, setLoading] = useState(false);
  const [confirmation, setConfirmation] = useState<CheckoutConfirmation | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  async function handleCheckout() {
    if (loading || confirmation) return;
    setLoading(true);
    try {
      // The server prepares an exact-plan, user-bound confirmation.
      const result = await api.billing.createCheckout(planTier);
      setConfirmation(requireCheckoutConfirmation(result.confirmation));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Checkout is unavailable.');
    } finally {
      setLoading(false);
    }
  }

  async function finishCheckout(confirmed: boolean) {
    if (!confirmation || loading) return;
    const selected = confirmation;
    setConfirmation(null);
    setLoading(true);
    try {
      if (!confirmed) {
        await apiFetch(`/api/phase1/business-actions/confirmations/${encodeURIComponent(selected.id)}/cancel`, { method: 'POST' });
        return;
      }
      requireCheckoutConfirmation(selected);
      const result = await api.billing.confirmCheckout(selected.id);
      // Never redirect to an unchecked URL. Paid access is granted only after
      // the signed provider webhook is verified by the backend.
      window.location.assign(requireCheckoutDestination(result.purchaseUrl));
      onSuccess?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Checkout could not complete. Check its status before retrying.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!confirmation) return;
    dialogRef.current?.focus();
    function onEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && !loading) {
        event.preventDefault();
        void finishCheckout(false);
      }
    }
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
    // The confirmation ID is the stable identity of this checkout dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmation?.id, loading]);

  const dialog = confirmation && typeof document !== 'undefined'
    ? createPortal(
        <div className={styles.backdrop}>
          <div
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkout-dialog-title"
            aria-describedby="checkout-dialog-description"
            ref={dialogRef}
            tabIndex={-1}
          >
            <div className={styles.dialogTop}>
              <span className={styles.lockIcon} aria-hidden="true"><LockKeyhole /></span>
              <button type="button" className={styles.closeButton} onClick={() => void finishCheckout(false)} disabled={loading} aria-label="Cancel checkout">
                <X aria-hidden="true" />
              </button>
            </div>
            <span className={styles.eyebrow}>SECURE XROGA CHECKOUT</span>
            <h2 id="checkout-dialog-title">Confirm your subscription</h2>
            <p id="checkout-dialog-description" className={styles.summary}>{confirmation.summary}</p>
            <p className={styles.providerText}><ShieldCheck aria-hidden="true" /> Payment is securely completed on Whop.</p>
            <div className={styles.dialogActions}>
              <button type="button" className={styles.primary} onClick={() => void finishCheckout(true)} disabled={loading}>
                {loading ? 'Preparing checkout…' : 'Continue to secure checkout'}
                {!loading && <ArrowUpRight aria-hidden="true" />}
              </button>
              <button type="button" className={styles.secondary} onClick={() => void finishCheckout(false)} disabled={loading}>Not now</button>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      {className ? (
        <button type="button" onClick={() => void handleCheckout()} disabled={loading || Boolean(confirmation)} className={className}>
          {loading ? 'Opening secure checkout…' : label}
        </button>
      ) : (
        <BuyNowButton
          label={loading ? 'OPENING…' : label === 'Subscribe' ? 'BUY NOW' : label}
          onClick={() => void handleCheckout()}
          disabled={loading || Boolean(confirmation)}
        />
      )}
      {dialog}
    </>
  );
}
