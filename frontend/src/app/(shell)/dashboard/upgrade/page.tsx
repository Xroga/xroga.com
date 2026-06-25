import Link from 'next/link';
import { Rocket } from 'lucide-react';

const plans = [
  { name: 'Spark', price: 19, actions: 2000, concurrency: 2, current: true },
  { name: 'Nova', price: 59, actions: 6000, concurrency: 5 },
  { name: 'Zenith', price: 150, actions: 20000, concurrency: 15 },
  { name: 'Singularity', price: 499, actions: 50000, concurrency: 999 },
];

export default function UpgradePage() {
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Rocket className="w-6 h-6 text-violet-400" />
          Upgrade Your Plan
        </h1>
        <p className="text-sm text-[var(--muted)]">All 92 features unlocked in every plan. Pay only for Actions.</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`p-6 rounded-xl border ${plan.current ? 'border-violet-500 bg-violet-500/10' : 'border-[var(--card-border)] bg-[var(--card)]'}`}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-lg">{plan.name}</h3>
              {plan.current && <span className="text-xs text-violet-300">Current</span>}
            </div>
            <p className="text-3xl font-bold mb-4">${plan.price}<span className="text-sm text-[var(--muted)]">/mo</span></p>
            <ul className="space-y-1 text-sm text-[var(--muted)] mb-4">
              <li>{plan.actions.toLocaleString()} Actions</li>
              <li>{plan.concurrency === 999 ? 'Unlimited' : plan.concurrency} concurrent tasks</li>
            </ul>
            {!plan.current && (
              <button className="w-full py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-sm transition-colors">
                Upgrade to {plan.name}
              </button>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-[var(--muted)]">
        Paddle payment integration coming in Phase 5.{' '}
        <Link href="/" className="text-violet-400 hover:underline">Learn more</Link>
      </p>
    </div>
  );
}
