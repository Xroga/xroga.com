'use client';

import { useEffect, useState } from 'react';
import { api, type Invoice, type SubscriptionInfo } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';
import { CryptoTopUpModal } from '@/components/billing/CryptoTopUpModal';
import { formatPrice } from '@/lib/plans';
import toast from 'react-hot-toast';
import Skeleton from 'react-loading-skeleton';
import { CreditCard, ExternalLink, Download, XCircle, Zap } from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';
import 'react-loading-skeleton/dist/skeleton.css';

export function BillingDashboard() {
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCrypto, setShowCrypto] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const actions = useAppStore((s) => s.actions);
  const setActions = useAppStore((s) => s.setActions);

  useEffect(() => {
    Promise.all([
      api.billing.subscription(),
      api.billing.invoices(),
      api.actions.balance(),
    ])
      .then(([sub, invs, balance]) => {
        setSubscription(sub);
        setInvoices(invs);
        setActions(balance);
      })
      .catch((err) => toast.error((err as Error).message))
      .finally(() => setLoading(false));
  }, [setActions]);

  async function handlePortal() {
    setActionLoading('portal');
    try {
      const { portalUrl } = await api.billing.portal();
      window.location.href = portalUrl;
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCancel() {
    if (!confirm('Cancel your subscription? You will keep access until the end of your billing period.')) return;
    setActionLoading('cancel');
    try {
      await api.billing.cancel();
      toast.success('Subscription canceled');
      const sub = await api.billing.subscription();
      setSubscription(sub);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return <Skeleton height={400} baseColor="#1a1a2e" highlightColor="#2a2a3e" />;
  }

  const renewalDate = subscription?.renewalDate
    ? format(new Date(subscription.renewalDate), 'MMM d, yyyy')
    : '—';

  return (
    <div className="space-y-6">
      <h2 className="font-semibold text-lg">Plan & Billing</h2>

      {/* Current plan */}
      <div className="p-5 rounded-xl border border-violet-500/30 bg-gradient-to-br from-violet-500/10 to-cyan-500/5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-[var(--muted)] uppercase tracking-wide">Current Plan</p>
            <p className="text-2xl font-bold capitalize mt-1">{subscription?.planTier ?? 'spark'}</p>
            {subscription?.subscriptionStatus === 'unpaid' && (
              <span className="inline-block mt-2 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-xs">
                No active subscription
              </span>
            )}
            {subscription?.subscriptionStatus === 'active' && (
              <p className="text-sm text-[var(--muted)] mt-2">Renews on {renewalDate}</p>
            )}
          </div>
          <Zap className="w-8 h-8 text-violet-400" />
        </div>

        <div className="mt-4 flex items-end gap-2">
          <span className="text-3xl font-bold">{actions?.remaining.toLocaleString() ?? 0}</span>
          <span className="text-[var(--muted)] mb-1">/ {actions?.total.toLocaleString() ?? 0} Actions</span>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <Link
            href="/pricing"
            className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors"
          >
            Upgrade Plan
          </Link>
          {subscription?.subscriptionStatus === 'active' && (
            <>
              <button
                type="button"
                onClick={handlePortal}
                disabled={actionLoading === 'portal'}
                className="px-4 py-2 rounded-lg border border-[var(--card-border)] hover:bg-white/5 text-sm transition-colors disabled:opacity-50"
              >
                Manage Subscription
              </button>
              <button
                type="button"
                onClick={() => setShowCrypto(true)}
                className="px-4 py-2 rounded-lg border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10 text-sm transition-colors"
              >
                Top Up (Crypto)
              </button>
            </>
          )}
          {subscription?.subscriptionStatus === 'unpaid' && (
            <Link
              href="/pricing"
              className="px-4 py-2 rounded-lg border border-amber-500/30 text-amber-300 hover:bg-amber-500/10 text-sm transition-colors"
            >
              Subscribe from $19/mo
            </Link>
          )}
        </div>
      </div>

      {/* Payment method */}
      {subscription?.paymentMethod && (
        <div className="p-4 rounded-xl border border-[var(--card-border)] bg-[var(--card)]">
          <div className="flex items-center gap-3">
            <CreditCard className="w-5 h-5 text-[var(--muted)]" />
            <div>
              <p className="text-sm font-medium">Payment Method</p>
              <p className="text-xs text-[var(--muted)]">Card ending in {subscription.paymentMethod.last4}</p>
            </div>
          </div>
        </div>
      )}

      {/* Invoice history */}
      <div>
        <h3 className="font-medium mb-3">Invoice History</h3>
        {invoices.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No invoices yet.</p>
        ) : (
          <div className="space-y-2">
            {invoices.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between p-3 rounded-lg border border-[var(--card-border)] bg-[var(--card)]"
              >
                <div>
                  <p className="text-sm">{inv.description ?? 'Subscription payment'}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {format(new Date(inv.created_at), 'MMM d, yyyy')} · {formatPrice(inv.amount_cents / 100, inv.currency)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    inv.status === 'paid' ? 'bg-green-500/20 text-green-300' : 'bg-amber-500/20 text-amber-300'
                  }`}>
                    {inv.status}
                  </span>
                  {inv.receipt_url && (
                    <a href={inv.receipt_url} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300">
                      <Download className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cancel */}
      {subscription?.subscriptionStatus === 'active' && (
        <button
          type="button"
          onClick={handleCancel}
          disabled={actionLoading === 'cancel'}
          className="flex items-center gap-2 text-sm text-red-400 hover:underline disabled:opacity-50"
        >
          <XCircle className="w-4 h-4" />
          Cancel Subscription
        </button>
      )}

      <CryptoTopUpModal open={showCrypto} onClose={() => setShowCrypto(false)} />

      <p className="text-xs text-[var(--muted)]">
        Payments processed securely by Paddle. Crypto top-ups via Coinbase Commerce.
        <a href="https://paddle.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 ml-1 text-violet-400 hover:underline">
          Learn more <ExternalLink className="w-3 h-3" />
        </a>
      </p>
    </div>
  );
}
