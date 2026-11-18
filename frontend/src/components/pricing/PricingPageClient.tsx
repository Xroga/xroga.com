'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  ScanSearch,
  CircleHelp,
  BrainCircuit,
  BriefcaseBusiness,
  ClipboardList,
  Check,
  Code2,
  Compass,
  CreditCard,
  FileStack,
  GitBranch,
  Info,
  LockKeyhole,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  Workflow,
  X,
  ChevronDown,
  Zap,
} from 'lucide-react';

import { PricingCheckoutButton as CheckoutButton } from './PricingCheckoutButton';
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
    icon: GitBranch,
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

const FAQ_SECTIONS = [
  { id: 'plans', label: 'Plans and usage' },
  { id: 'billing', label: 'Billing and payments' },
  { id: 'managing', label: 'Managing your plan' },
] as const;

const FAQS = [
  {
    category: 'billing',
    question: 'Does Free require a credit card?',
    answer:
      'No. Free is $0 and does not require a card. It includes the core Xroga building workflow with included monthly AI capacity.',
  },
  {
    category: 'plans',
    question: 'What changes when I upgrade to Xroga Pro?',
    answer:
      'The core workflow stays familiar. Pro adds higher monthly AI capacity, Full Access pacing and more room for long research, coding, verification, repair and production workflows.',
  },
  {
    category: 'plans',
    question: 'What is Full Access pacing?',
    answer:
      'Full Access is a Pro pacing option that can make remaining working capacity for the current billing cycle available earlier instead of waiting for later progressive unlocks. It changes timing, not the total monthly capacity.',
  },
  {
    category: 'plans',
    question: 'Does Xroga reset my usage every day?',
    answer:
      'AI capacity is tracked over your plan cycle. Working capacity may unlock progressively, but Xroga does not promise a fixed daily task count or a full daily reset. Check your workspace for your actual remaining allowance and next reset.',
  },
  {
    category: 'plans',
    question: 'What happens when my currently available capacity is used?',
    answer:
      'Your project state and completed work remain preserved. New AI work can continue when more capacity unlocks or when the next billing cycle begins.',
  },
  {
    category: 'managing',
    question: 'Can I use an existing GitHub repository?',
    answer:
      'Yes. Xroga supports workflows that start from new projects or repositories you already own, subject to the repository access you authorize.',
  },
  {
    category: 'managing',
    question: 'Does Xroga own my code?',
    answer:
      'Xroga is designed around repositories and provider accounts you authorize, so your source and deployment workflow are not trapped inside a closed generated preview.',
  },
  {
    category: 'billing',
    question: 'How are Pro payments handled?',
    answer:
      'After you select Pro, Xroga requests confirmation of the selected plan and then sends you to Whop for secure payment. Pro access depends on verified payment confirmation.',
  },
  {
    category: 'billing',
    question: 'Can I cancel my Pro subscription?',
    answer:
      'Xroga Pro is a monthly subscription advertised as cancel anytime. Review your account billing settings for available subscription-management options.',
  },
] as const;

/* Quiet pricing marks: the plan icons are intentionally static. */
function PlanShowcase({ paid }: { paid: boolean }) {
  const Icon = paid ? Sparkles : Compass;
  return (
    <span className={paid ? styles.proShowcase : styles.freeShowcase} aria-hidden="true">
      <Icon className={styles.showcaseSymbol} strokeWidth={1.65} />
    </span>
  );
}

/* Payment hover icons adapted from user-supplied Uiverse.io by fthisilak.
   These decorative icons never indicate completed payment. */
function PaymentIconSequence() {
  return (
    <span className={styles.paymentIconContainer} aria-hidden="true">
      <svg viewBox="0 0 24 24" className={[styles.paymentIcon, styles.cardIcon].join(' ')}><path d="M20,8H4V6H20M20,18H4V12H20M20,4H4C2.89,4 2,4.89 2,6V18C2,19.11 2.89,20 4,20H20C21.11,20 22,19.11 22,18V6C22,4.89 21.11,4 20,4Z" fill="currentColor" /></svg>
      <svg viewBox="0 0 24 24" className={[styles.paymentIcon, styles.receiptIcon].join(' ')}><path d="M2,17H22V21H2V17M6.25,7H9V6H6V3H18V6H15V7H17.75L19,17H5L6.25,7M9,10H15V8H9V10M9,13H15V11H9V13Z" fill="currentColor" /></svg>
      <svg viewBox="0 0 24 24" className={[styles.paymentIcon, styles.dollarIcon].join(' ')}><path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z" fill="currentColor" /></svg>
      <svg viewBox="0 0 24 24" className={[styles.paymentIcon, styles.checkIcon].join(' ')}><path d="M9,16.17L4.83,12L3.41,13.41L9,19L21,7L19.59,5.59L9,16.17Z" fill="currentColor" /></svg>
      <svg viewBox="0 0 24 24" className={[styles.paymentIcon, styles.walletIcon].join(' ')}><path d="M21,18V19A2,2 0 0,1 19,21H5C3.89,21 3,20.1 3,19V5A2,2 0 0,1 5,3H19A2,2 0 0,1 21,5V6H12C10.89,6 10,6.9 10,8V16A2,2 0 0,0 12,18M12,16H22V8H12M16,13.5A1.5,1.5 0 0,1 14.5,12A1.5,1.5 0 0,1 16,10.5A1.5,1.5 0 0,1 17.5,12A1.5,1.5 0 0,1 16,13.5Z" fill="currentColor" /></svg>
    </span>
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
  const finalCtaRef = useRef<HTMLElement>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [featureQuery, setFeatureQuery] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  const [faqCategory, setFaqCategory] = useState<(typeof FAQ_SECTIONS)[number]['id']>('plans');

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

  // Scroll reveal is progressively enhanced: with JS disabled, no observer,
  // or reduced-motion preference, the CTA stays visible.
  useEffect(() => {
    const card = finalCtaRef.current;
    if (!card || typeof IntersectionObserver === 'undefined'
        || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (card.getBoundingClientRect().top <= window.innerHeight * .9) return;

    card.classList.add(styles.finalCtaPending);
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      card.classList.remove(styles.finalCtaPending);
      observer.disconnect();
    }, { threshold: .12, rootMargin: '0px 0px -6% 0px' });
    observer.observe(card);
    return () => {
      observer.disconnect();
      card.classList.remove(styles.finalCtaPending);
    };
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
          <p className={styles.heroKicker}>Pricing</p>
          <h1 id="pricing-title" className={styles.heroTitle}>
            Simple plans. <span>Serious work.</span>
          </h1>
          <p className={styles.heroCopy}>Start free. Build with your own tools and projects. Upgrade when you need more AI capacity.</p>
        </div>
      </section>

      <div className={styles.shell}>
        <section className={styles.plansSection} aria-label="Xroga Free and Pro pricing plans">
          <div className={styles.planGrid}>
            {GALACTIC_PLANS.map((plan) => {
              const isFree = plan.tier === 'free';
              const isCurrent = isFree ? freeCurrent : proCurrent;
              const features = PLAN_FEATURES[plan.tier];

              return (
                <article
                  key={plan.tier}
                  id={isFree ? 'free-plan-card' : 'pro-plan-card'}
                  className={`${styles.planCard} ${
                    isFree ? styles.freeCard : styles.proCard
                  }`}
                >
                  {!isFree && <div className={styles.proHalo} aria-hidden="true" />}

                  <div className={styles.planTop}>
                    <div className={styles.planIdentity}>
                      <PlanShowcase paid={!isFree} />
                      <div className={styles.planIdentityText}>
                        <h2 className={styles.planName}>{plan.name}</h2>
                        <p className={styles.planTagline}>{plan.tagline}</p>
                      </div>
                    </div>

                    {isCurrent ? (
                      <span className={styles.currentBadge}>Current plan</span>
                    ) : !isFree ? (
                      <span className={styles.popularBadge}>
                        MORE CAPACITY
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
                    {features.map((feature, featureIndex) => (
                      <li key={feature}>
                        <span className={styles.check}>
                          {isFree ? <Check aria-hidden="true" /> : (() => {
                            const Icons = [Search, BrainCircuit, BriefcaseBusiness, ClipboardList, Code2, Rocket];
                            const FeatureIcon = Icons[featureIndex] ?? Sparkles;
                            return <FeatureIcon aria-hidden="true" />;
                          })()}
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
                        <CheckoutButton planTier="spark" label="Try Xroga Pro" trailingContent={<PaymentIconSequence />} className={`${styles.ctaButton} ${styles.proCta}`} />
                      </div>
                    ) : (
                      <div className={styles.proCtaWrap}>
                        <button
                          type="button"
                          className={`${styles.ctaButton} ${styles.proCta}`}
                          onClick={() => router.push('/auth/signup')}
                        >
                          <span>Try Xroga Pro</span>
                          <PaymentIconSequence />
                        </button>
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


        <section className={styles.usageSection} aria-labelledby="usage-heading">
          <div className={styles.usageHeader}>
            <span className={styles.usageEyebrow}>A CLEARER WAY TO PLAN YOUR WORK</span>
            <h2 id="usage-heading">How usage works.</h2>
            <p>Your available capacity depends on your plan and the work you run. Here's what to expect.</p>
          </div>
          <div className={styles.usageGrid}>
            <div className={styles.usageItem}>
              <span className={styles.usageNumber}>01 / FREE</span>
              <h3>Start with included capacity</h3>
              <p>Free includes a smaller monthly AI allowance to explore real tasks, research, and building.</p>
            </div>
            <div className={styles.usageItem}>
              <span className={styles.usageNumber}>02 / PRO</span>
              <h3>More room for bigger work</h3>
              <p>Pro includes a higher monthly allowance for longer projects, with Full Access pacing available.</p>
            </div>
            <div className={styles.usageItem}>
              <span className={styles.usageNumber}>03 / DURING THE DAY</span>
              <h3>Capacity can become available</h3>
              <p>Working capacity may unlock in stages. Daily availability isn't a guaranteed fixed number of tasks or a full daily reset.</p>
            </div>
            <div className={styles.usageItem}>
              <span className={styles.usageNumber}>04 / CYCLE RESET</span>
              <h3>Your allowance renews</h3>
              <p>Your monthly allowance renews with your plan cycle. Check your signed-in workspace for remaining usage and reset timing.</p>
            </div>
          </div>
          <p className={styles.usageNote}>
            <Info aria-hidden="true" />
            Usage depends on task complexity. Full Access changes when remaining capacity is available, not the plan's total monthly allowance.
          </p>
        </section>

        <section className={styles.compareSection} aria-labelledby="compare-title">
          <div className={styles.compareHeading}>
            <ScanSearch className={styles.compareOrnament} aria-hidden="true" />
            <h2 id="compare-title">Compare features across plans</h2>
            <p>A clear side-by-side look at what is included in each plan.</p>
          </div>
          <div className={styles.compareScroll} tabIndex={0} role="region" aria-label="Free and Pro feature comparison; scroll horizontally on narrow screens">
            <table className={styles.comparisonTable}>
              <caption className={styles.visuallyHidden}>
                Compare Xroga Free and Pro feature availability across six categories.
              </caption>
              <colgroup>
                <col className={styles.featureColumn} />
                <col className={styles.freeColumn} />
                <col className={styles.proColumn} />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">
                    <div className={styles.featureSearch}>
                      <Search aria-hidden="true" />
                      <label htmlFor="pricing-feature-search" className={styles.visuallyHidden}>Search Xroga plan features</label>
                      <input
                        id="pricing-feature-search"
                        type="search"
                        value={featureQuery}
                        onChange={(event) => setFeatureQuery(event.target.value)}
                        placeholder="Search features..."
                      />
                      {featureQuery && (
                        <button type="button" aria-label="Clear feature search" onClick={() => setFeatureQuery('')}>
                          <X aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </th>
                  <th scope="col">
                    <div className={styles.comparePlanHeading}>
                      <span>Free</span>
                      <small>$0/month</small>
                      <a href="#free-plan-card">Try Free</a>
                    </div>
                  </th>
                  <th scope="col">
                    <div className={styles.comparePlanHeading}>
                      <span>Pro</span>
                      <small>$25/month</small>
                      <a href="#pro-plan-card">Try Xroga Pro</a>
                    </div>
                  </th>
                </tr>
              </thead>
              {visibleGroups.map((group) => {
                const GroupIcon = group.icon;
                const isCollapsed = !normalizedQuery && collapsedGroups.includes(group.title);
                return (
                  <tbody key={group.title}>
                    <tr className={styles.groupRow}>
                      <th scope="rowgroup" colSpan={3}>
                        <button
                          type="button"
                          className={styles.groupToggle}
                          aria-expanded={!isCollapsed}
                          onClick={() => setCollapsedGroups(current =>
                            current.includes(group.title) ? current.filter(title => title !== group.title) : [...current, group.title]
                          )}
                        >
                          <span><GroupIcon aria-hidden="true" /> {group.title}</span>
                          <ChevronDown className={isCollapsed ? undefined : styles.groupExpanded} aria-hidden="true" />
                        </button>
                      </th>
                    </tr>
                    {!isCollapsed && group.rows.map((row) => (
                      <tr key={row.name}>
                        <th scope="row" className={styles.featureName}>
                          <span>{row.name}</span>
                          {'detail' in row && <small>{row.detail}</small>}
                        </th>
                        <td className={styles.valueCell}>
                          {row.free === '—' ? <X className={styles.unavailableIcon} aria-label="Not included" /> : <Check className={styles.includedIcon} aria-hidden="true" />}
                          <span>{row.free}</span>
                        </td>
                        <td className={`${styles.valueCell} ${styles.proCell}`}>
                          {String(row.pro) === '—' ? <X className={styles.unavailableIcon} aria-label="Not included" /> : <Check className={styles.includedIcon} aria-hidden="true" />}
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
                <p>No matching features. Try a different search.</p>
                <button type="button" onClick={() => setFeatureQuery('')}>Show all features</button>
              </div>
            )}
          </div>
          <div className={styles.compareMeta}>
            <span>{visibleFeatureCount} of {totalFeatureCount} features</span>
            <span><LockKeyhole aria-hidden="true" /> Connected actions require your authorization</span>
          </div>
          <p className={styles.compareFootnote}>
            Plans have finite monthly capacity. Availability also depends on connected accounts,
            provider support and permissions; publishing and external actions are not automatic.
          </p>
        </section>

        <section className={styles.faqSection} aria-labelledby="faq-title">
          <div className={styles.faqIntro}>
            <CircleHelp className={styles.faqTopIcon} aria-hidden="true" />
            <h2 id="faq-title">FAQ</h2>
          </div>
          <div className={styles.faqTabs} role="tablist" aria-label="FAQ categories">
            {FAQ_SECTIONS.map((section) => (
              <button
                key={section.id}
                id={'faq-tab-'+section.id}
                type="button"
                role="tab"
                aria-controls="faq-panel"
                aria-selected={faqCategory === section.id}
                className={faqCategory === section.id ? styles.faqTabActive : undefined}
                onClick={() => setFaqCategory(section.id)}
              >
                {section.label}
              </button>
            ))}
          </div>
          <div
            id="faq-panel"
            className={styles.faqBody}
            role="tabpanel"
            aria-labelledby={'faq-tab-'+faqCategory}
            tabIndex={0}
          >
            <h3 className={styles.faqCategoryTitle}>
              {FAQ_SECTIONS.find((section) => section.id === faqCategory)?.label}
            </h3>
            <div className={styles.faqList} key={faqCategory}>
              {FAQS.filter((faq) => faq.category === faqCategory).map((faq) => (
                <details key={faq.question} className={styles.faqItem}>
                  <summary>
                    <span>{faq.question}</span>
                    <span className={styles.plus} aria-hidden="true">+</span>
                  </summary>
                  <p>{faq.answer}</p>
                </details>
              ))}
            </div>
            <Link className={styles.faqDocsLink} href="/docs">
              Explore documentation <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </section>

        <section ref={finalCtaRef} className={styles.finalCta} aria-labelledby="final-title">
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
