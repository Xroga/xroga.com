'use client';

const PAYMENT_METHODS = [
  { name: 'Visa', slug: 'visa' },
  { name: 'Mastercard', slug: 'mastercard' },
  { name: 'American Express', slug: 'americanexpress' },
  { name: 'PayPal', slug: 'paypal' },
  { name: 'Google Pay', slug: 'googlepay' },
  { name: 'Apple Pay', slug: 'applepay' },
  { name: 'UPI', slug: 'upi' },
  { name: 'Paddle', slug: 'paddle' },
] as const;

export function PaymentMethodIcons() {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {PAYMENT_METHODS.map((m) => (
        <div
          key={m.slug}
          title={m.name}
          className="h-9 min-w-[52px] px-2.5 rounded-lg bg-white border border-[var(--card-border)] flex items-center justify-center shrink-0"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://cdn.simpleicons.org/${m.slug}/111827`}
            alt={m.name}
            className="h-4 w-auto max-w-[44px] object-contain"
          />
        </div>
      ))}
    </div>
  );
}

export function SubscriptionManagePanel() {
  return (
    <div className="space-y-4">
      <div className="p-4 sm:p-5 rounded-xl border border-[var(--card-border)] bg-white/[0.02] space-y-3">
        <h3 className="font-semibold text-sm">Pause instead of cancel</h3>
        <p className="text-xs sm:text-sm text-[var(--muted)] leading-relaxed">
          Cancel anytime — or, if you just need a break, pause your subscription for up to 3 months. We keep your data safe, stop all billing, and you can reactivate instantly without losing progress.
        </p>
        <p className="text-xs text-[var(--muted)] leading-relaxed">
          Many members pause when they are busy, not because they dislike the product. Pausing avoids losing your projects and makes it easy to return.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={() => window.open('mailto:hello@xroga.com?subject=Pause%20my%20Xroga%20subscription', '_blank')}
            className="px-4 py-2 rounded-lg bg-[var(--accent)]/15 border border-[var(--accent)]/35 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--accent)]/25 transition-colors"
          >
            Pause subscription
          </button>
          <button
            type="button"
            onClick={() => window.open('mailto:hello@xroga.com?subject=Cancel%20my%20Xroga%20subscription', '_blank')}
            className="px-4 py-2 rounded-lg border border-[var(--card-border)] text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          >
            Cancel subscription
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-5 rounded-xl border border-[var(--card-border)] bg-white/[0.02] space-y-3">
        <h3 className="font-semibold text-sm">Cancel anytime — immediate stop</h3>
        <p className="text-xs sm:text-sm text-[var(--muted)] leading-relaxed">
          Cancel anytime directly from your dashboard. Cancellation takes effect immediately and you will not be billed again.
        </p>
        <p className="text-xs text-[var(--muted)] leading-relaxed">
          We do not offer retroactive refunds for the current billing period. You retain full access until your paid period ends.
        </p>
      </div>

      <div className="p-4 sm:p-5 rounded-xl border border-[var(--card-border)] bg-white/[0.02] space-y-3">
        <h3 className="font-semibold text-sm">Payment methods</h3>
        <p className="text-xs sm:text-sm text-[var(--muted)] leading-relaxed">
          Checkout is powered by Paddle — cards, PayPal, Google Pay, and UPI (region-dependent).
        </p>
        <PaymentMethodIcons />
      </div>
    </div>
  );
}
