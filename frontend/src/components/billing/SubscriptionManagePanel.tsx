'use client';

const PAYMENT_METHODS = [
  { name: 'Visa', src: 'https://raw.githubusercontent.com/aaronfagan/svg-credit-card-payment-icons/main/flat-rounded/visa.svg' },
  { name: 'Mastercard', src: 'https://raw.githubusercontent.com/aaronfagan/svg-credit-card-payment-icons/main/flat-rounded/mastercard.svg' },
  { name: 'Maestro', src: 'https://raw.githubusercontent.com/aaronfagan/svg-credit-card-payment-icons/main/flat-rounded/maestro.svg' },
  { name: 'American Express', src: 'https://raw.githubusercontent.com/aaronfagan/svg-credit-card-payment-icons/main/flat-rounded/amex.svg' },
  { name: 'JCB', src: 'https://raw.githubusercontent.com/aaronfagan/svg-credit-card-payment-icons/main/flat-rounded/jcb.svg' },
  { name: 'Discover', src: 'https://raw.githubusercontent.com/aaronfagan/svg-credit-card-payment-icons/main/flat-rounded/discover.svg' },
  { name: 'Diners Club', src: 'https://raw.githubusercontent.com/aaronfagan/svg-credit-card-payment-icons/main/flat-rounded/diners.svg' },
  { name: 'UnionPay', src: 'https://raw.githubusercontent.com/aaronfagan/svg-credit-card-payment-icons/main/flat-rounded/unionpay.svg' },
  { name: 'PayPal', src: 'https://cdn.simpleicons.org/paypal/003087' },
  { name: 'Google Pay', src: 'https://cdn.simpleicons.org/googlepay/4285F4' },
] as const;

export function PaymentMethodIcons() {
  return (
    <div className="grid grid-cols-5 gap-2 sm:gap-2.5">
      {PAYMENT_METHODS.map((m) => (
        <div
          key={m.name}
          title={m.name}
          className="h-10 sm:h-11 rounded-lg bg-white border border-[var(--card-border)] flex items-center justify-center p-1.5 shrink-0 shadow-sm"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={m.src} alt={m.name} className="h-full w-full object-contain" />
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
            className="px-4 py-2 rounded-lg bg-red-500/12 border border-red-500/40 text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-500/20 transition-colors"
          >
            Cancel subscription
          </button>
        </div>
        <p className="text-[10px] text-[var(--muted)] leading-relaxed pt-1 border-t border-[var(--card-border)]/40">
          Cancellation takes effect at the end of your billing period. You retain access until then. No retroactive refunds for the current period.
        </p>
      </div>

      <div className="p-4 sm:p-5 rounded-xl border border-[var(--card-border)] bg-white/[0.02] space-y-3">
        <h3 className="font-semibold text-sm">Payment methods</h3>
        <p className="text-xs sm:text-sm text-[var(--muted)] leading-relaxed">
          Checkout is powered by Lemon Squeezy — cards and local methods via Lemon as merchant of record.
        </p>
        <PaymentMethodIcons />
      </div>
    </div>
  );
}
