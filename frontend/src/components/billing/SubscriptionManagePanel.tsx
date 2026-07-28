'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';

export function PaymentMethodIcons() {
  return null;
}

export function SubscriptionManagePanel() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    void api.billing.status()
      .then((status) => setReady(status.lemonApi && status.lemonWebhook && status.lemonStore && status.plans.some((plan) => plan.ready)))
      .catch(() => setReady(null));
  }, []);

  async function openPortal() {
    setOpening(true);
    try {
      const { portalUrl } = await api.billing.portal();
      window.location.assign(portalUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Subscription management could not be opened');
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="p-4 sm:p-5 rounded-xl border border-[var(--card-border)] bg-white/[0.02]">
      <div className="flex items-start gap-3">
        {ready ? <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" /> : <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />}
        <div>
          <h3 className="font-semibold text-sm">Subscription management</h3>
          <p className="text-xs sm:text-sm text-[var(--muted)] mt-1 leading-relaxed">
            {ready === true
              ? 'Checkout and verified billing webhooks are configured. Paid subscribers can open Lemon Squeezy’s signed portal to manage payment details, invoices, pause, cancellation, and renewal.'
              : ready === false
                ? 'External setup required: the canonical billing provider is not fully configured. Xroga will not invent subscription, payment, cancellation, or invoice state.'
                : 'Billing configuration could not be verified. No successful billing state is being assumed.'}
          </p>
          <button
            type="button"
            disabled={ready !== true || opening}
            onClick={() => void openPortal()}
            className="mt-3 rounded-lg border border-[var(--card-border)] px-3 py-2 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {opening ? 'Opening…' : ready === true ? 'Manage subscription' : 'Billing portal unavailable'}
          </button>
        </div>
      </div>
    </div>
  );
}
