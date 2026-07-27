'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';

export function PaymentMethodIcons() {
  return null;
}

export function SubscriptionManagePanel() {
  const [ready, setReady] = useState<boolean | null>(null);

  useEffect(() => {
    void api.billing.status()
      .then((status) => setReady(status.lemonApi && status.lemonWebhook && status.lemonStore && status.plans.some((plan) => plan.ready)))
      .catch(() => setReady(null));
  }, []);

  return (
    <div className="p-4 sm:p-5 rounded-xl border border-[var(--card-border)] bg-white/[0.02]">
      <div className="flex items-start gap-3">
        {ready ? <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" /> : <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />}
        <div>
          <h3 className="font-semibold text-sm">Subscription management</h3>
          <p className="text-xs sm:text-sm text-[var(--muted)] mt-1 leading-relaxed">
            {ready === true
              ? 'Checkout and verified billing webhooks are configured. A self-service billing portal is not connected, so pause, cancellation, invoice, and renewal controls remain unavailable here.'
              : ready === false
                ? 'External setup required: the canonical billing provider is not fully configured. Xroga will not invent subscription, payment, cancellation, or invoice state.'
                : 'Billing configuration could not be verified. No successful billing state is being assumed.'}
          </p>
          <button type="button" disabled className="mt-3 rounded-lg border border-[var(--card-border)] px-3 py-2 text-xs font-semibold opacity-50 cursor-not-allowed">Billing portal unavailable</button>
        </div>
      </div>
    </div>
  );
}
