import Link from 'next/link';
import { GALACTIC_PLANS } from '@/lib/plans';
import { CheckoutButton } from '@/components/billing/CheckoutButton';

export default function BillingPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold font-terminal">Billing</h1>
        <p className="text-sm text-[var(--muted)] mt-1">Manage your plan and action fuel.</p>
      </div>

      <div className="glass-panel rounded-xl p-6">
        <h2 className="font-semibold mb-2">Current Plan</h2>
        <p className="text-sm text-[var(--muted)] mb-4">
          Upgrade anytime — all 92 features stay unlocked on every tier.
        </p>
        <Link href="/pricing" className="text-sm text-[var(--accent)] hover:underline">
          Compare Galactic Tiers →
        </Link>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {GALACTIC_PLANS.slice(0, 4).map((plan) => (
          <div key={plan.tier} className="glass-panel rounded-xl p-5">
            <h3 className="font-semibold">{plan.name}</h3>
            <p className="text-2xl font-bold mt-1">{plan.priceLabel}<span className="text-xs text-[var(--muted)]">/mo</span></p>
            <p className="text-xs text-[var(--muted)] mt-1">{plan.actionsLabel}</p>
            <CheckoutButton planTier={plan.tier} className="mt-4 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
