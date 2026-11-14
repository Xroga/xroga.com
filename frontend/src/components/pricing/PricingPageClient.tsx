'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  BadgeCheck,
  Check,
  Code2,
  Compass,
  CreditCard,
  FileStack,
  Github,
  Info,
  LockKeyhole,
  Minus,
  Orbit,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  Workflow,
  X,
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

const COMPARISON_GROUPS = [
  {
    title: 'AI chat & research',
    icon: Sparkles,
    rows: [
      { name: 'AI chat workspace', free: 'Included', pro: 'Included' },
      { name: 'Plain-language requests and follow-up work', free: 'Included', pro: 'Included' },
      { name: 'Web search and source-based research', free: 'Included', pro: 'Included', detail: 'Subject to supported search tools and available usage.' },
      { name: 'Analyze documents, files and screenshots', free: 'Included', pro: 'Included', detail: 'Supported input formats and processing limits apply.' },
      { name: 'Work with project context', free: 'Included', pro: 'Included' },
      { name: 'AI capacity per billing cycle', free: 'Included', pro: 'Higher' },
      { name: 'Full Access capacity pacing', free: '—', pro: 'Included', detail: 'Makes remaining capacity available sooner; does not increase the cycle allowance.' },
    ],
  },
  {
    title: 'Software & app building',
    icon: Code2,
    rows: [
      { name: 'AI website and web-app builder', free: 'Included', pro: 'Included' },
      { name: 'SaaS, dashboards and client portals', free: 'Included', pro: 'Included', detail: 'Scope depends on the task, tools and available capacity.' },
      { name: 'APIs, extensions and custom tools', free: 'Included', pro: 'Included' },
      { name: 'Game and Web3 project code workflows', free: 'Included', pro: 'Included', detail: 'Supported development workflows, not guaranteed app-store or chain publication.' },
      { name: 'UI and responsive interface implementation', free: 'Included', pro: 'Included' },
      { name: 'Multi-file implementations and iterations', free: 'Capacity-limited', pro: 'More room' },
      { name: 'Work from an existing codebase', free: 'Included', pro: 'Included' },
    ],
  },
  {
    title: 'Coding & verification',
    icon: Github,
    rows: [
      { name: 'Repository inspection and code understanding', free: 'Included', pro: 'Included' },
      { name: 'Code edits, fixes and refactoring', free: 'Included', pro: 'Included' },
      { name: 'Build, test and error diagnosis', free: 'Included', pro: 'Included' },
      { name: 'Preview and browser-based checks', free: 'When supported', pro: 'When supported' },
      { name: 'Repair and re-test cycles', free: 'Capacity-limited', pro: 'More room' },
      { name: 'GitHub branches, commits and pull requests', free: 'With connection', pro: 'With connection' },
      { name: 'Reviewable results and verification evidence', free: 'Included', pro: 'Included' },
    ],
  },
  {
    title: 'Connected apps & delivery',
    icon: Workflow,
    rows: [
      { name: 'Connect supported external services', free: 'Included', pro: 'Included', detail: 'Availability depends on each connector and account authorization.' },
      { name: 'GitHub integration', free: 'With connection', pro: 'With connection' },
      { name: 'Vercel deployment workflows', free: 'With connection', pro: 'With connection', detail: 'Deployment requires provider access and passing build checks.' },
      { name: 'Supabase-backed application workflows', free: 'Supported', pro: 'Supported' },
      { name: 'Connected business-app tasks', free: 'Where enabled', pro: 'Where enabled', detail: 'Only supported operations with the permissions you grant.' },
      { name: 'Prepare production-ready project changes', free: 'Capacity-limited', pro: 'More room' },
      { name: 'Use your own code and provider accounts', free: 'Yes', pro: 'Yes' },
    ],
  },
  {
    title: 'Files, output & control',
    icon: FileStack,
    rows: [
      { name: 'Create code and project files', free: 'Included', pro: 'Included' },
      { name: 'Work with supported documents and assets', free: 'Included', pro: 'Included' },
      { name: 'Conversation and project continuity', free: 'Included', pro: 'Included', detail: 'Subject to retention, access and workspace limits.' },
      { name: 'User-authorized external actions', free: 'Included', pro: 'Included' },
      { name: 'Confirmation for sensitive operations', free: 'Required', pro: 'Required' },
      { name: 'Account access and permission controls', free: 'Included', pro: 'Included' },
    ],
  },
  {
    title: 'Subscription & usage',
    icon: CreditCard,
    rows: [
      { name: 'Subscription price', free: '$0', pro: '$25/month' },
      { name: 'Credit card to get started', free: 'Not required', pro: 'Required to subscribe' },
      { name: 'Monthly AI capacity', free: 'Included', pro: 'Higher capacity' },
      { name: 'Cycle and capacity status in workspace', free: 'Included', pro: 'Included' },
      { name: 'Monthly Pro subscription', free: '—', pro: 'Cancel anytime' },
    ],
  },
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
  const [featureQuery, setFeatureQuery] = useState('');

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
  const normalizedQuery = featureQuery.trim().toLowerCase();
  const visibleGroups = COMPARISON_GROUPS.map((group) => ({
    ...group,
    rows: group.rows.filter((row) =>
      [group.title, row.name, row.free, row.pro, 'detail' in row ? row.detail : '']
        .some((value) => String(value ?? '').toLowerCase().includes(normalizedQuery)),
    ),
  })).filter((group) => group.rows.length > 0);
  const totalFeatureCount = COMPARISON_GROUPS.reduce((count, group) => count + group.rows.length, 0);
  const visibleFeatureCount = visibleGroups.reduce((count, group) => count + group.rows.length, 0);

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

        <div className={styles.heroInner}>
          <div className={styles.heroIcon} aria-hidden="true"><Orbit /></div>
          <div className={styles.heroKicker}>
            <Sparkles aria-hidden="true" /> XROGA PRICING
          </div>
          <h1 id="pricing-title" className={styles.heroTitle}>
            Build beyond
            <span> the ordinary.</span>
          </h1>
          <p className={styles.heroCopy}>
            One AI workspace for research, software building, connected work and real verification.
            Start free, or go further with Xroga Pro for $25/month.
          </p>
          <div className={styles.heroFacts} aria-label="Pricing highlights">
            <span><strong>$0</strong> to start</span>
            <i aria-hidden="true" />
            <span><strong>$25</strong> per month for Pro</span>
            <i aria-hidden="true" />
            <span><strong>No card</strong> for Free</span>
          </div>
        </div>
      </section>

      <div className={styles.shell}>
        <section className={styles.plansSection} aria-labelledby="plans-title">
          <div className={styles.sectionHead}>
            <span className={styles.eyebrow}>TWO PLANS. ONE WORKFLOW.</span>
            <h2 id="plans-title">
              Two plans.
              <em> One powerful workspace.</em>
            </h2>
            <p>
              The same powerful Xroga workspace, with more available capacity for
              ambitious projects on Pro.
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
                    <div className={styles.planIdentity}>
                      <span className={styles.planEmblem} aria-hidden="true">
                        {isFree ? <Compass /> : <Rocket />}
                      </span>
                      <span className={styles.planName}>{plan.name}</span>
                      <p className={styles.planTagline}>{plan.tagline}</p>
                    </div>

                    {isCurrent ? (
                      <span className={styles.currentBadge}>Current plan</span>
                    ) : !isFree ? (
                      <span className={styles.popularBadge}>
                        <Zap aria-hidden="true" />
                        FOR ACTIVE BUILDERS
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

        <section className={styles.compareSection} aria-labelledby="compare-title">
          <div className={styles.compareHeading}>
            <div className={styles.sectionHeadCompact}>
              <span className={styles.eyebrow}><BadgeCheck aria-hidden="true" /> EXPLORE WHAT'S INCLUDED</span>
              <h2 id="compare-title">Compare Xroga <em>Free & Pro.</em></h2>
              <p>Explore the full feature categories, not just an eight-row summary.
                Both plans use the same core capabilities; some operations require a supported connected service.</p>
            </div>
            <div className={styles.featureSearch}>
              <Search aria-hidden="true" />
              <label htmlFor="pricing-feature-search" className={styles.visuallyHidden}>Search plan features</label>
              <input
                id="pricing-feature-search"
                type="search"
                value={featureQuery}
                onChange={(event) => setFeatureQuery(event.target.value)}
                placeholder="Search all features..."
              />
              {featureQuery && (
                <button type="button" aria-label="Clear feature search" onClick={() => setFeatureQuery('')}>
                  <X aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
          <div className={styles.tableMeta}>
            <span>{visibleFeatureCount} of {totalFeatureCount} features</span>
            <span><LockKeyhole aria-hidden="true" /> Connected actions require your authorization</span>
          </div>
          <div className={styles.compareScroll} tabIndex={0} role="region" aria-label="Scrollable Free and Pro feature comparison">
            <table className={styles.comparisonTable}>
              <colgroup><col className={styles.featureColumn} /><col className={styles.freeColumn} /><col className={styles.proColumn} /></colgroup>
              <thead>
                <tr>
                  <th scope="col">Features and capabilities</th>
                  <th scope="col"><span>Free <small>$0 / month</small></span></th>
                  <th scope="col"><span className={styles.proHeader}><Sparkles aria-hidden="true" /> Xroga Pro <small>$25 / month</small></span></th>
                </tr>
              </thead>
              {visibleGroups.map((group) => {
                const GroupIcon = group.icon;
                return (
                  <tbody key={group.title}>
                    <tr className={styles.groupRow}>
                      <th scope="rowgroup" colSpan={3}><GroupIcon aria-hidden="true" /> {group.title}</th>
                    </tr>
                    {group.rows.map((row) => (
                      <tr key={row.name}>
                        <th scope="row" className={styles.featureName}>
                          <span>{row.name}</span>
                          {'detail' in row && <small>{row.detail}</small>}
                        </th>
                        <td className={styles.valueCell}>
                          {row.free === '—' ? <Minus className={styles.unavailableIcon} aria-label="Not included" /> : <Check className={styles.includedIcon} aria-hidden="true" />}
                          <span>{row.free}</span>
                        </td>
                        <td className={`${styles.valueCell} ${styles.proCell}`}>
                          {row.pro === '—' ? <Minus className={styles.unavailableIcon} aria-label="Not included" /> : <Check className={styles.includedIcon} aria-hidden="true" />}
                          <span>{row.pro}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                );
              })}
            </table>
            {visibleGroups.length === 0 && (
              <div className={styles.emptySearch}>
                <Search aria-hidden="true" />
                <p>No matching features. Try a different term.</p>
                <button type="button" onClick={() => setFeatureQuery('')}>Show all features</button>
              </div>
            )}
          </div>
          <p className={styles.compareFootnote}>
            Feature availability depends on your plan's current capacity, connected accounts,
            provider support and permissions. This comparison does not promise universal support
            for every external integration or automatic publishing.
          </p>
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
