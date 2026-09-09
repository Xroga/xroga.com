import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { GALACTIC_PLANS } from '@/lib/plans';

export function HomepagePricingPreview({ loggedIn }: { loggedIn: boolean }) {
  return (
    <section className="xv-home-pricing" aria-labelledby="homepage-pricing-title">
      <header className="xv-home-pricing__heading">
        <p>START FREE. SCALE WHEN THE WORK DOES.</p>
        <h2 id="homepage-pricing-title">Simple access to <em>real building.</em></h2>
        <span>Start without a card. Move to Pro when you need more capacity.</span>
      </header>
      <div className="xv-home-pricing__grid">
        {GALACTIC_PLANS.map((plan) => {
          const features = plan.tier === 'free'
            ? [`${plan.actions} AI actions included`, 'Repository-aware edits', 'Preview and verification', 'No card required']
            : [`${plan.actions.toLocaleString('en-US')} AI actions included`, `${plan.concurrency} concurrent tasks`, 'Higher-capacity pacing'];
          return (
          <article className={plan.highlight ? 'is-pro' : undefined} key={plan.tier}>
            <div className="xv-home-pricing__plan">
              <span>{plan.name}</span>
              <strong>{plan.priceLabel}<small>{plan.usdPrice > 0 ? '/month' : ' forever'}</small></strong>
              <p>{plan.tagline}</p>
            </div>
            <ul>
              {features.map((feature) => <li key={feature}><Check aria-hidden="true" />{feature}</li>)}
            </ul>
            <Link href={loggedIn ? (plan.tier === 'free' ? '/workspace' : '/pricing') : (plan.tier === 'free' ? '/auth/signup' : '/pricing')}>
              {plan.tier === 'free' ? 'Start building free' : 'View Xroga Pro'} <ArrowRight aria-hidden="true" />
            </Link>
          </article>
          );
        })}
      </div>
    </section>
  );
}
