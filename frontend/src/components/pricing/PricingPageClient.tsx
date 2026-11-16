'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  BadgeCheck,
  BrainCircuit,
  BriefcaseBusiness,
  ClipboardList,
  CircleAlert,
  Gamepad2,
  BadgeDollarSign,
  Check,
  Code2,
  Compass,
  CreditCard,
  FileStack,
  GitBranch,
  Info,
  Orbit,
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
    'Xroga Black Hole V∞ — starter experience',
    'Limited included starter usage',
    'AI chat, research and project context',
    'Edit code and preview your projects',
    'Connect eligible plugins and MCP services',
    'No credit card required',
  ],
  spark: [
    'Expanded Black Hole V∞ workflows',
    'More available capacity for bigger tasks',
    'Longer research, coding and repair sessions',
    'Code edits, live previews and verification',
    'Supported plugins, apps and MCP tools',
    'Connected publishing and browser workflows',
  ],
} as const;

const COMPARISON_GROUPS = [
  {
    title: 'AI chat & research',
    icon: Sparkles,
    rows: [
      { name: 'Xroga Black Hole V∞ AI experience', free: 'Starter access', pro: 'Expanded work capacity', detail: 'The public AI identity; underlying routing depends on the active system and task.' },
      { name: 'AI chat workspace', free: 'Included', pro: 'Included' },
      { name: 'Plain-language requests and follow-up work', free: 'Included', pro: 'Included' },
      { name: 'Web search and source-based research', free: 'Included', pro: 'Included', detail: 'Subject to supported search tools and available usage.' },
      { name: 'Analyze documents, files and screenshots', free: 'Included', pro: 'Included', detail: 'Supported input formats and processing limits apply.' },
      { name: 'Work with project context', free: 'Included', pro: 'Included' },
      { name: 'AI usage access', free: 'Limited starter use', pro: 'Expanded capacity', detail: 'No daily message-count promise; available usage depends on your plan allowance.' },
      { name: 'Advanced work capacity', free: 'Starter scope', pro: 'More room', detail: 'Not a guarantee of unlimited model usage or a separate provider checkpoint.' },
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
      { name: 'Connect supported plugins and apps', free: 'Where supported', pro: 'Where supported', detail: 'App availability, authentication and provider limits apply.' },
      { name: 'Custom MCP server connections', free: 'When enabled', pro: 'When enabled', detail: 'Requires a compatible MCP server and reviewed permissions.' },
      { name: 'GitHub integration', free: 'With connection', pro: 'With connection' },
      { name: 'Vercel deployment workflows', free: 'With connection', pro: 'With connection', detail: 'Deployment requires provider access and passing build checks.' },
      { name: 'Supabase-backed application workflows', free: 'Supported', pro: 'Supported' },
      { name: 'Connected business-app tasks', free: 'Where enabled', pro: 'Where enabled', detail: 'Only supported operations with the permissions you grant.' },
      { name: 'Chrome extension and browser automation', free: 'When available', pro: 'When available', detail: 'Supported extension or worker must be installed and enabled; some deployments disable this feature.' },
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
      { name: 'Included AI usage', free: 'Limited starter use', pro: 'Higher capacity' },
      { name: 'Available-usage status in workspace', free: 'When available', pro: 'When available' },
      { name: 'Monthly Pro subscription', free: '—', pro: 'Cancel anytime' },
    ],
  },
] as const;

const FAQS = [
  { question: 'Does Free require a credit card?', answer: 'No. Free is $0 and provides limited starter usage without requiring payment details.' },
  { question: 'How is usage different between Free and Pro?', answer: 'Free supports lighter tasks with a smaller starter allowance. Pro offers more available working capacity for bigger projects. Neither plan promises unlimited requests or a fixed number of daily messages.' },
  { question: 'Is Xroga Black Hole V∞ included in both plans?', answer: 'Black Hole V∞ is Xroga’s public AI identity. Free provides starter access, while Pro gives more room for involved work. The active system and task determine routing; an exclusive premium model checkpoint is not promised.' },
  { question: 'What changes when I upgrade to Xroga Pro?', answer: 'Pro increases available working capacity for sustained research, coding, debugging, previews and verification. Supported integrations still require access and authorization.' },
  { question: 'What is Full Access pacing?', answer: 'Where offered, Full Access can make existing working capacity available earlier. It does not create extra or unlimited usage.' },
  { question: 'What happens when my available usage is exhausted?', answer: 'New AI work may pause until more access becomes available under your plan. Completed work and existing files are not automatically erased because usage is exhausted.' },
  { question: 'Can I connect plugins, apps and MCP servers?', answer: 'Xroga supports connected applications and compatible custom MCP integrations. Available services, provider limits, authentication and permission checks apply.' },
  { question: 'Are app connections or MCP operations unlimited?', answer: 'There is no unlimited-use guarantee. You can connect eligible services where supported, subject to account capabilities, provider restrictions, usage capacity and any external fees.' },
  { question: 'Can I install a Chrome extension for browser automation?', answer: 'Browser automation requires a supported extension or browser worker that is installed, authorized and enabled. It is not available on every deployment; check the workspace before relying on it.' },
  { question: 'Can Xroga edit code and preview a project?', answer: 'Yes. Compatible projects can use repository-aware editing, builds, browser previews and verification according to the available tools and workspace permissions.' },
  { question: 'Can I use an existing GitHub repository?', answer: 'Yes. Connect a repository you own or have permission to edit. Git operations use the access you explicitly grant.' },
  { question: 'Does Xroga own my code?', answer: 'Your project can remain in repositories and provider accounts you control. Refer to the applicable Xroga terms for the legal details of ownership and generated output.' },
  { question: 'Can I cancel Xroga Pro?', answer: 'Subscription and cancellation controls are handled through your billing account. Pro costs $25 per month; review the checkout terms before subscribing.' },
  { question: 'What happens to projects if I return to Free?', answer: 'Your available usage returns to Free-level limits. Existing work is not automatically deleted solely because you changed plans, though account and provider policies still apply.' },
  { question: 'Do both plans use the same workspace?', answer: 'Yes. Both plans use the Xroga workspace, with different available usage and supported connected-service access.' },
  { question: 'Where can I read technical documentation?', answer: 'Open Docs for deeper information about available features, connectors, projects and technical workflows.' },
] as const;

const PRO_SCENES = [
  { name: 'Research', icon: Search },
  { name: 'Think', icon: BrainCircuit },
  { name: 'Work', icon: BriefcaseBusiness },
  { name: 'Plan', icon: ClipboardList },
  { name: 'Fix', icon: CircleAlert },
  { name: 'Code', icon: Code2 },
  { name: 'Game', icon: Gamepad2 },
  { name: 'Publish', icon: Rocket },
  { name: 'Earn', icon: BadgeDollarSign },
] as const;

function PlanShowcase({ paid }: { paid: boolean }) {
  const [index, setIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    if (!paid) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(preference.matches);
    sync();
    preference.addEventListener('change', sync);
    return () => preference.removeEventListener('change', sync);
  }, [paid]);
  useEffect(() => {
    if (!paid || reducedMotion) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') setIndex((previous) => (previous + 1) % PRO_SCENES.length);
    }, 2100);
    return () => window.clearInterval(interval);
  }, [paid, reducedMotion]);
  const scene = PRO_SCENES[index];
  const Active = paid ? scene.icon : Compass;
  return (
    <span
      className={paid ? styles.proShowcase : styles.freeShowcase}
      role="img"
      aria-label={paid ? 'Xroga Pro: continuously changing research, thinking, work, planning, coding, games, publishing and earning icons' : 'Xroga Free: explore icon'}
    >
      <span className={styles.showcaseOrb} aria-hidden="true">
        <span className={styles.orbLines} />
        <span className={styles.orbCenter}>
          <Active key={paid ? scene.name : 'free'} className={styles.showcaseSymbol} strokeWidth={1.65} />
        </span>
      </span>
    </span>
  );
}

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
        Where enabled, pacing can make existing work capacity available sooner.
        It does not increase the overall allowance.
      </span>
    </span>
  );
}

export function PricingPageClient() {
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState(false);
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [featureQuery, setFeatureQuery] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);

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
          <h1 id="pricing-title" className={styles.heroTitle}>
            <Orbit className={styles.heroTitleIcon} aria-hidden="true" />
            <span className={styles.heroTitleCopy}>Pricing build beyond the ordinary</span>
          </h1>
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
                      ? 'Start with Black Hole V∞, explore your ideas and build with limited starter access.'
                      : 'Go further with expanded AI capacity, code editing, previews and connected workflows.'}
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
                        className={`${styles.ctaButton} ${styles.proCta} ${styles.proUiverse}`}
                        disabled
                      >
                        Current plan
                      </button>
                    ) : loggedIn ? (
                      <div className={styles.proCtaWrap}>
                        <CheckoutButton planTier="spark" label="Try Xroga Pro" className={`${styles.ctaButton} ${styles.proCta} ${styles.proUiverse}`} />
                        <CtaParticles />
                      </div>
                    ) : (
                      <div className={styles.proCtaWrap}>
                        <button
                          type="button"
                          className={`${styles.ctaButton} ${styles.proCta} ${styles.proUiverse}`}
                          onClick={() => router.push('/auth/signup')}
                        >
                          Try Xroga Pro
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
            <BadgeCheck className={styles.compareOrnament} aria-hidden="true" />
            <h2 id="compare-title">Compare features across plans</h2>
            <p>One workspace. A plan that fits your next idea.</p>
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
              No credit card required on Free
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
