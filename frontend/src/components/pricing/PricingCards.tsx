'use client';

import { useState } from 'react';
import { Check, ChevronDown, ChevronUp, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  GALACTIC_PLANS,
  FEATURE_HIGHLIGHTS,
  ACTION_COST_TABLE,
  formatPrice,
  getEmergingPrice,
  type BillingRegion,
  type PlanDefinition,
} from '@/lib/plans';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';

interface PricingCardsProps {
  compact?: boolean;
  onSelectPlan?: (tier: string) => void;
}

export function PricingCards({ compact, onSelectPlan }: PricingCardsProps) {
  const [region, setRegion] = useState<BillingRegion>('global');
  const [emergingCurrency, setEmergingCurrency] = useState<'PKR' | 'INR'>('PKR');
  const [showCosts, setShowCosts] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);

  async function handleSubscribe(tier: string) {
    if (onSelectPlan) {
      onSelectPlan(tier);
      return;
    }

    setLoading(tier);
    try {
      const { checkoutUrl } = await api.billing.createCheckout(tier, region);
      window.location.href = checkoutUrl;
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(null);
    }
  }

  function getDisplayPrice(plan: PlanDefinition) {
    if (region === 'global') return plan.prices.global;
    return getEmergingPrice(plan, emergingCurrency);
  }

  return (
    <div className="space-y-12">
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
        <div className="flex items-center rounded-full border border-[var(--card-border)] p-1 bg-white/5">
          <button
            type="button"
            onClick={() => setRegion('emerging')}
            className={cn(
              'px-4 py-2 rounded-full text-sm transition-all',
              region === 'emerging' ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/30' : 'text-[var(--muted)]'
            )}
          >
            🌍 Emerging
          </button>
          <button
            type="button"
            onClick={() => setRegion('global')}
            className={cn(
              'px-4 py-2 rounded-full text-sm transition-all',
              region === 'global' ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/30' : 'text-[var(--muted)]'
            )}
          >
            🌎 Global
          </button>
        </div>
        {region === 'emerging' && (
          <div className="flex gap-2 text-sm">
            {(['PKR', 'INR'] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setEmergingCurrency(c)}
                className={cn(
                  'px-3 py-1 rounded-lg border transition-colors',
                  emergingCurrency === c ? 'border-violet-500 text-violet-300' : 'border-[var(--card-border)] text-[var(--muted)]'
                )}
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={cn(
        'grid gap-4',
        compact ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'
      )}>
        {GALACTIC_PLANS.map((plan) => {
          const price = getDisplayPrice(plan);
          return (
            <div
              key={plan.tier}
              className={cn(
                'relative rounded-2xl border p-5 flex flex-col transition-all hover:scale-[1.02]',
                plan.highlighted
                  ? 'border-violet-500/60 bg-gradient-to-b from-violet-500/20 to-transparent shadow-lg shadow-violet-500/20'
                  : 'border-[var(--card-border)] bg-[var(--card)] hover:border-violet-500/30'
              )}
            >
              {plan.highlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-violet-600 text-xs font-medium">
                  Most Popular
                </span>
              )}
              <h3 className="text-lg font-bold">{plan.name}</h3>
              <p className="text-xs text-[var(--muted)] mt-1">{plan.bestFor}</p>
              <div className="mt-4">
                <span className="text-3xl font-bold">{formatPrice(price.amount, price.currency)}</span>
                <span className="text-[var(--muted)] text-sm">/mo</span>
              </div>
              <ul className="mt-4 space-y-2 text-sm flex-1">
                <li className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-violet-400" />
                  {plan.actions.toLocaleString()} Actions
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-400" />
                  {plan.concurrency === 999 ? 'Unlimited' : plan.concurrency} concurrent tasks
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-400" />
                  {plan.quality} quality
                </li>
              </ul>
              <button
                type="button"
                disabled={loading === plan.tier}
                onClick={() => handleSubscribe(plan.tier)}
                className={cn(
                  'mt-5 w-full py-2.5 rounded-xl text-sm font-medium transition-all',
                  plan.highlighted
                    ? 'bg-gradient-to-r from-violet-600 to-cyan-500 hover:shadow-lg hover:shadow-violet-500/30'
                    : 'bg-violet-600/80 hover:bg-violet-600',
                  loading === plan.tier && 'opacity-50'
                )}
              >
                {loading === plan.tier ? 'Redirecting...' : 'Subscribe'}
              </button>
            </div>
          );
        })}
      </div>

      {!compact && (
        <>
          <div>
            <h2 className="text-xl font-bold text-center mb-6">Everything Included</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {FEATURE_HIGHLIGHTS.map((f) => (
                <div key={f.title} className="p-4 rounded-xl border border-[var(--card-border)] bg-[var(--card)]">
                  <span className="text-2xl">{f.icon}</span>
                  <h3 className="font-medium mt-2 text-sm">{f.title}</h3>
                  <p className="text-xs text-[var(--muted)] mt-1">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] overflow-hidden">
            <button
              type="button"
              onClick={() => setShowCosts(!showCosts)}
              className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
            >
              <span className="font-medium">Action Cost Table</span>
              {showCosts ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </button>
            {showCosts && (
              <div className="border-t border-[var(--card-border)]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[var(--muted)] border-b border-[var(--card-border)]">
                      <th className="text-left p-3 font-medium">Task</th>
                      <th className="text-right p-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ACTION_COST_TABLE.map((row) => (
                      <tr key={row.task} className="border-b border-[var(--card-border)] last:border-0">
                        <td className="p-3">{row.task}</td>
                        <td className="p-3 text-right font-mono text-violet-300">{row.cost}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
