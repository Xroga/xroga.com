'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Check,
  CircleGauge,
  Code2,
  GitBranch,
  Info,
  Monitor,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';

import { CheckoutButton } from '@/components/billing/CheckoutButton';
import { api } from '@/lib/api';
import { GALACTIC_PLANS } from '@/lib/plans';
import { createClient } from '@/lib/supabase/client';

import styles from './PricingPage.module.css';

type BillingStatus = Awaited<ReturnType<typeof api.billing.status>>;

const PLAN_FEATURES = {
  free: [
    'AI app builder + coding agent',
    'New or existing GitHub repositories',
    'Repository-aware edits and debugging',
    'Browser preview + verification',
    'Live web research, files and documents',
    'Included monthly AI capacity',
  ],
  spark: [
    'Everything in Free',
    'Higher monthly AI capacity',
    'Full Access pacing',
    'Longer end-to-end builds and multi-file changes',
    'More build → test → repair cycles',
    'Production-focused GitHub, Vercel and Supabase workflows',
  ],
} as const;

const OUTCOMES = [
  {
    icon: Code2,
    title: 'Build',
    body: 'Websites, SaaS, dashboards, portals and product interfaces from a plain-language brief.',
  },
  {
    icon: GitBranch,
    title: 'Code',
    body: 'Start fresh or work inside a real repository with reviewable edits, fixes and refactors.',
  },
  {
    icon: Monitor,
    title: 'Verify',
    body: 'Run builds, inspect the product in a browser and feed observed failures back into repair.',
  },
  {
    icon: Rocket,
    title: 'Ship',
    body: 'Move through GitHub and supported provider workflows while keeping your accounts and code.',
  },
] as const;

const COMPARISON = [
  ['Price', '$0', '$25/month'],
  ['Card required', 'No', 'Yes, to subscribe'],
  ['Core AI building workspace', 'Included', 'Included'],
  ['Existing GitHub repositories', 'Included', 'Included'],
  ['Browser preview + verification', 'Included', 'Included'],
  ['Monthly AI capacity', 'Included', 'Higher'],
  ['Full Access pacing', '—', 'Included'],
  ['Production-focused workflows', 'Supported', 'More room for sustained work'],
] as const;

const FAQS = [
  {
    question: 'Does Free require a credit card?',
    answer:
      'No. Free is $0 and does not require a card. It includes the core Xroga building workflow with included monthly AI capacity.',
  },
  {
    question: 'What changes when I upgrade to Xroga Pro?',
    answer:
      'The core workflow stays familiar. Pro adds higher monthly AI capacity, Full Access pacing and more room for long research, coding, verification, repair and production workflows.',
  },
  {
    question: 'What is Full Access pacing?',
    answer:
      'Full Access is a Pro pacing option that can make remaining working capacity for the current billing cycle available earlier instead of waiting for later progressive unlocks. It changes timing, not the total monthly capacity.',
  },
  {
    question: 'What happens when my currently available capacity is used?',
    answer:
      'Your project state and completed work remain preserved. New AI work can continue when more capacity unlocks or when the next billing cycle begins.',
  },
  {
    question: 'Can I use an existing GitHub repository?',
    answer:
      'Yes. Xroga supports workflows that start from new projects or repositories you already own, subject to the repository access you authorize.',
  },
  {
    question: 'Does Xroga own my code?',
    answer:
      'Xroga is designed around repositories and provider accounts you authorize, so your source and deployment workflow are not trapped inside a closed generated preview.',
  },
] as const;

function CtaParticles() {
  return (
    <>
      <span className={styles.fold} aria-hidden="true" />
      <span className={styles.pointsWrapper} aria-hidden="true">
        {Array.from({ length: 10 }, (_, index) => (
          <i key={index} className={styles.point} />
        ))}
      </span>
    </>
  );
}

function FullAccessInfo() {
  return (
    <span className={styles.tooltipWrap}>
      <button
        type="button"
        className={styles.infoButton}
        aria-label="What is Full Access pacing?"
      >
        <Info aria-hidden="true" />
      </button>
      <span className={styles.tooltip} role="tooltip">
        Makes remaining working capacity for the current cycle available earlier.
        It does not add extra monthly capacity.
      </span>
    </span>
  );
}

export function PricingPageClient() {
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState(false);
  const [status, setStatus] = useState<BillingStatus | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await createClient().auth.getSession();
        const hasSession = Boolean(data.session);
        setLoggedIn(hasSession);

        if (hasSession) {
          setStatus(await api.billing.status());
        }
      } catch {
        setStatus(null);
      }
    })();
  }, []);

  const freeCurrent = status?.plan === 'free';
  const proCurrent = status?.plan === 'spark';

  function openFree() {
    if (freeCurrent) return;
    router.push(loggedIn ? '/workspace' : '/auth/signup');
  }

  return (
    <main className={styles.root}>
      <section className={styles.hero} aria-labelledby="pricing-title">
        <div className={styles.gridGlow} aria-hidden="true" />
        <div className={styles.starField} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>

        <div className={styles.heroKicker}>
  XROGA PRICING
</div>

          <h1 id="pricing-title" className={styles.heroTitle}>
            Start free.
            <span> Build further with Pro.</span>
          </h1>

          <p className={styles.heroCopy}>
            One product workflow for research, code, verification and shipping.
            Free lets you start for $0. Pro is $25/month when you need more capacity.
          </p>

          <div className={styles.heroFacts} aria-label="Pricing highlights">
            <span>
              <strong>$0</strong>
              no card
            </span>
            <i aria-hidden="true" />
            <span>
              <strong>$25</strong>
              monthly Pro
            </span>
            <i aria-hidden="true" />
            <span>
              <strong>Cancel</strong>
              anytime
            </span>
          </div>
        </div>
      </section>

      <div className={styles.shell}>
        <section className={styles.plansSection} aria-labelledby="plans-title">
          <div className={styles.sectionHead}>
            <span className={styles.eyebrow}>TWO PLANS. ONE WORKFLOW.</span>
            <h2 id="plans-title">
              Pick the capacity you need,
              <em> not a different product.</em>
            </h2>
            <p>
              Both plans start with Xroga&apos;s core building workflow. Pro is the
              upgrade for longer, more demanding product work.
            </p>
          </div>

          <div className={styles.planGrid}>
            {GALACTIC_PLANS.map((plan) => {
              const isFree = plan.tier === 'free';
              const isCurrent = isFree ? freeCurrent : proCurrent;
              const features = PLAN_FEATURES[plan.tier];

              return (
                <article
                  key={plan.tier}
                  className={`${styles.planCard} ${
                    isFree ? styles.freeCard : styles.proCard
                  }`}
                >
                  {!isFree && <div className={styles.proHalo} aria-hidden="true" />}

                  <div className={styles.planTop}>
                    <div>
                      <span className={styles.planName}>{plan.name}</span>
                      <p className={styles.planTagline}>{plan.tagline}</p>
                    </div>

                    {isCurrent ? (
                      <span className={styles.currentBadge}>Current plan</span>
                    ) : !isFree ? (
                      <span className={styles.popularBadge}>
                        <Zap aria-hidden="true" />
                        BUILDER PICK
                      </span>
                    ) : null}
                  </div>

                  <div className={styles.priceRow}>
                    <strong className={styles.price}>{plan.priceLabel}</strong>
                    <span className={styles.priceMeta}>
                      <b>per month</b>
                      <small>{isFree ? 'no card required' : 'billed monthly'}</small>
                    </span>
                  </div>

                  <p className={styles.planLead}>
                    {isFree
                      ? 'Explore the real Xroga workflow, work on real code and finish a smaller build with included capacity.'
                      : 'For active builders who need more room for sustained research, implementation, verification and shipping.'}
                  </p>

                  <ul className={styles.featureList}>
                    {features.map((feature) => (
                      <li key={feature}>
                        <span className={styles.check}>
                          <Check aria-hidden="true" />
                        </span>
                        <span>
                          {feature}
                          {feature === 'Full Access pacing' ? <FullAccessInfo /> : null}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className={styles.planCta}>
                    {isFree ? (
                      <button
                        type="button"
                        className={`${styles.ctaButton} ${styles.freeCta}`}
                        onClick={openFree}
                        disabled={isCurrent}
                      >
                        {isCurrent ? 'Current plan' : 'Start building free'}
                        {!isCurrent && <ArrowRight aria-hidden="true" />}
                      </button>
                    ) : isCurrent ? (
                      <button
                        type="button"
                        className={`${styles.ctaButton} ${styles.proCta}`}
                        disabled
                      >
                        Current plan
                      </button>
                    ) : loggedIn ? (
                      <div className={styles.proCtaWrap}>
                        <CheckoutButton planTier="spark" label="Get Xroga Pro — $25/month" className={`${styles.ctaButton} ${styles.proCta}`} />
                        <CtaParticles />
                      </div>
                    ) : (
                      <div className={styles.proCtaWrap}>
                        <button
                          type="button"
                          className={`${styles.ctaButton} ${styles.proCta}`}
                          onClick={() => router.push('/auth/signup')}
                        >
                          Get Xroga Pro — $25/month
                          <ArrowRight aria-hidden="true" />
                        </button>
                        <CtaParticles />
                      </div>
                    )}
                  </div>

                  <p className={styles.planNote}>
                    {isFree
                      ? 'Build in plain language. Go technical only when you want to.'
                      : 'Your code · Your accounts · Your deployment workflow'}
                  </p>
                </article>
              );
            })}
          </div>
        </section>

        <section className={styles.outcomesSection} aria-labelledby="outcomes-title">
          <div className={styles.sectionHeadCompact}>
            <span className={styles.eyebrow}>WHAT XROGA HELPS YOU DO</span>
            <h2 id="outcomes-title">
              From brief to <em>working software.</em>
            </h2>
          </div>

          <div className={styles.outcomeGrid}>
            {OUTCOMES.map((outcome) => {
              const Icon = outcome.icon;
              return (
                <article key={outcome.title} className={styles.outcomeCard}>
                  <span className={styles.outcomeIcon}>
                    <Icon aria-hidden="true" />
                  </span>
                  <h3>{outcome.title}</h3>
                  <p>{outcome.body}</p>
                </article>
              );
            })}
          </div>

          <div className={styles.capabilityLinks}>
            <Link href="/features">
              Explore all features <ArrowRight aria-hidden="true" />
            </Link>
            <Link href="/ai-app-builder">AI App Builder</Link>
            <Link href="/ai-coding-agent">AI Coding Agent</Link>
            <Link href="/docs">Docs</Link>
          </div>
        </section>

        <section className={styles.capacitySection} aria-labelledby="capacity-title">
          <div className={styles.capacityCopy}>
            <span className={`${styles.eyebrow} ${styles.shimmerText}`}>
              CAPACITY, WITHOUT TOKEN MATH
            </span>
            <h2 id="capacity-title">
              Same workflow.
              <em> More room with Pro.</em>
            </h2>
            <p>
              Xroga shows understandable capacity and cycle status instead of
              turning pricing into internal model accounting.
            </p>
          </div>

          <div className={styles.capacityPanel}>
            <div className={styles.capacityRow}>
              <div>
                <span>Free</span>
                <strong>Included monthly AI capacity</strong>
              </div>
              <div className={styles.progressTrack} aria-hidden="true">
                <span className={`${styles.progressBar} ${styles.freeProgress}`} />
              </div>
            </div>

            <div className={styles.capacityRow}>
              <div>
                <span>Xroga Pro</span>
                <strong>Higher capacity + Full Access pacing</strong>
              </div>
              <div className={styles.progressTrack} aria-hidden="true">
                <span className={`${styles.progressBar} ${styles.proProgress}`} />
                <span className={styles.progressSpark} />
              </div>
            </div>

            <p className={styles.capacityNote}>
              Visual comparison only — your live capacity and unlock timing are
              shown inside Xroga.
            </p>
          </div>
        </section>

        <section className={styles.compareSection} aria-labelledby="compare-title">
          <div className={styles.sectionHeadCompact}>
            <span className={styles.eyebrow}>FREE VS PRO</span>
            <h2 id="compare-title">
              The difference, <em>in eight rows.</em>
            </h2>
          </div>

          <div className={styles.compareTable} role="table" aria-label="Free and Pro plan comparison">
            <div className={styles.compareHeader} role="row">
              <span role="columnheader">Capability</span>
              <span role="columnheader">Free</span>
              <span role="columnheader">Xroga Pro</span>
            </div>

            {COMPARISON.map(([label, free, pro]) => (
              <div className={styles.compareRow} role="row" key={label}>
                <strong className={styles.compareLabel} role="rowheader">
                  {label}
                </strong>
                <span role="cell">
                  <Check aria-hidden="true" />
                  {free}
                </span>
                <span role="cell" className={styles.proCell}>
                  <Sparkles aria-hidden="true" />
                  {pro}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.faqSection} aria-labelledby="faq-title">
          <div className={styles.faqIntro}>
            <span className={styles.eyebrow}>PRICING FAQ</span>
            <h2 id="faq-title">
              Clear enough to decide <em>in one read.</em>
            </h2>
            <p>
              Need implementation details instead? The docs go deeper without
              turning the pricing page into a manual.
            </p>
            <Link className={styles.textLink} href="/docs">
              Open docs <ArrowRight aria-hidden="true" />
            </Link>
          </div>

          <div className={styles.faqList}>
            {FAQS.map((faq) => (
              <details key={faq.question} className={styles.faqItem}>
                <summary>
                  <span>{faq.question}</span>
                  <span className={styles.plus} aria-hidden="true">
                    +
                  </span>
                </summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className={styles.finalCta} aria-labelledby="final-title">
          <div className={styles.orbitDot} aria-hidden="true" />
          <div className={styles.finalGlow} aria-hidden="true" />

          <div className={styles.finalCopy}>
            <span className={styles.eyebrow}>YOUR IDEA IS ENOUGH TO START</span>
            <h2 id="final-title">
              Build something <em>real.</em>
            </h2>
            <p>
              Start for $0. Upgrade only when the work needs more room.
            </p>
          </div>

          <div className={styles.finalActions}>
            <button
              type="button"
              className={`${styles.ctaButton} ${styles.finalPrimary}`}
              onClick={openFree}
            >
              Start building free
              <ArrowRight aria-hidden="true" />
            </button>

            <div className={styles.trustLine}>
              <ShieldCheck aria-hidden="true" />
              No card on Free
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
