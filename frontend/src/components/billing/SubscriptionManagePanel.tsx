'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { CheckoutButton } from './CheckoutButton';

export function PaymentMethodIcons() { return null; }

export function SubscriptionManagePanel() {
  const [status, setStatus] = useState<Awaited<ReturnType<typeof api.billing.status>> | null>(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => { void api.billing.status().then(setStatus).catch(() => setStatus(null)); }, []);

  async function openPortal() {
    if (opening) return;
    setOpening(true);
    try {
      const { manageUrl } = await api.billing.portal();
      window.location.assign(manageUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Subscription management could not be opened');
    } finally { setOpening(false); }
  }

  return (
    <div className="p-4 sm:p-5 rounded-xl border border-[var(--card-border)] bg-white/[0.02]">
      <div className="flex items-start gap-3">
        {status?.isPaid ? <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" /> : <Sparkles className="w-5 h-5 text-[var(--accent)] shrink-0" />}
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-sm">{status?.isPaid ? 'Xroga Pro subscription' : 'Upgrade when you are ready'}</h3>
          <p className="text-xs sm:text-sm text-[var(--muted)] mt-1 leading-relaxed">
            {status?.isPaid
              ? status.cancelAtPeriodEnd
                ? 'Your cancellation is scheduled. Xroga Pro remains active through the paid period.'
                : 'Your subscription is active and confirmed by Whop.'
              : 'Free requires no card. Xroga Pro adds higher usage and production workflows for $25/month.'}
          </p>
          <div className="mt-3">
            {status?.isPaid ? (
              <button type="button" disabled={!status.manageAvailable || opening} onClick={() => void openPortal()} className="rounded-lg border border-[var(--card-border)] px-3 py-2 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed">
                {opening ? 'Opening…' : status.manageAvailable ? 'Manage subscription' : 'Management link unavailable'}
              </button>
            ) : <CheckoutButton planTier="spark" label="Upgrade to Xroga Pro" className="xv-pricing-cta xv-pricing-cta--solid !w-auto !px-4" />}
          </div>
        </div>
      </div>
    </div>
  );
}
