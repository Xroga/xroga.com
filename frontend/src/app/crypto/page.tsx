import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Cormorant_Garamond, Manrope } from 'next/font/google';
import {
  ArrowRight,
  BarChart3,
  Blocks,
  Bot,
  Braces,
  Check,
  CheckCircle2,
  Code2,
  Database,
  GitBranch,
  Globe2,
  Layers3,
  Network,
  Rocket,
  ShieldCheck,
  Sparkles,
  WalletCards,
  Workflow,
  Boxes,
} from 'lucide-react';

import { Logo } from '@/components/layout/Logo';
import { buildMetadata } from '@/lib/seo';

import '@/styles/homepage-coding.css';
import { CryptoPromptBar } from './CryptoPromptBar';
import {
  ExactCryptoCardVisual,
  ExactFolderVisual,
  ExactMarketChartVisual,
  ExactWebsiteBuildVisual,
  ExactRepoPullRequestVisual,
} from './CryptoExactVisuals';
import './crypto-uiverse-exact.css';
import styles from './crypto-seo.module.css';

const manrope = Manrope({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-manrope',
});

const editorial = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-editorial',
});

export const metadata: Metadata = buildMetadata({
  title: 'Free AI App Builder for Web3 & Blockchain Apps | Xroga',
  description:
    'Build Web3 apps, dApps, crypto SaaS and DeFi dashboards with Xroga. A blockchain app builder for Web3 app development in real repositories. Start free.',
  path: '/crypto',
  keywords: [
    'free ai app builder',
    'web3 app',
    'web3 apps',
    'web3 app development',
    'blockchain app builder',
    'web3 website builder',
    'ai dashboard builder',
    'ai saas builder',
    'dapp builder',
    'ai crypto builder',
  ],
});

const PRODUCT_TYPES = [
  {
    icon: Globe2,
    title: 'Web3 Apps',
    copy: 'Build wallet-facing applications, blockchain interfaces, API-backed products and other Web3 application experiences.',
  },
  {
    icon: Blocks,
    title: 'Blockchain Applications',
    copy: 'Create software around blockchain data, transaction activity, supported contract interactions and on-chain workflows.',
  },
  {
    icon: BarChart3,
    title: 'DeFi Apps & Dashboards',
    copy: 'Build position views, protocol analytics, wallet activity and monitoring surfaces over approved data sources.',
  },
  {
    icon: Boxes,
    title: 'Crypto SaaS Products',
    copy: 'Create research platforms, analytics products, account-based tools and subscription software for crypto users.',
  },
  {
    icon: Braces,
    title: 'dApps & On-Chain Tools',
    copy: 'Build decentralized application interfaces, monitoring systems, wallet utilities and blockchain-connected products.',
  },
  {
    icon: Network,
    title: 'DAO & Governance Tools',
    copy: 'Create proposal dashboards, voting interfaces, treasury views and contributor workflows.',
  },
  {
    icon: WalletCards,
    title: 'Wallet & Token Tools',
    copy: 'Build interfaces for wallet activity, token data, balances, approvals and supported crypto workflows.',
  },
  {
    icon: Bot,
    title: 'AI Crypto Agents',
    copy: 'Create AI-powered research, monitoring, summarization and automation workflows using approved sources.',
  },
] as const;

const DEVELOPMENT = [
  {
    icon: Sparkles,
    title: 'Start a new Web3 app',
    copy: 'Describe the users, workflow, screens, data and outcome. Xroga turns the requirements into implementation work.',
  },
  {
    icon: GitBranch,
    title: 'Continue an existing project',
    copy: 'Connect the repository you already have and make focused changes without intentionally replacing unrelated working code.',
  },
  {
    icon: Database,
    title: 'Connect UI, APIs & data',
    copy: 'Work across the interface, application logic, persistent data and supported external services in one project.',
  },
  {
    icon: ShieldCheck,
    title: 'Verify before deployment',
    copy: 'Run applicable builds, type checks, tests and runtime checks before presenting the work as ready.',
  },
] as const;

const DASHBOARD_EXAMPLES = [
  'Wallet activity',
  'DeFi positions',
  'Token analytics',
  'Protocol data',
  'Governance',
  'On-chain alerts',
] as const;

const SAAS_EXAMPLES = [
  ['Crypto Research SaaS', 'Organize research, data and AI summaries into a focused product.'],
  ['Wallet Intelligence', 'Build monitoring and analytics around approved wallet activity.'],
  ['Protocol Analytics', 'Turn blockchain and protocol data into product interfaces.'],
  ['DAO Software', 'Create governance, treasury and contributor experiences.'],
] as const;

const PROCESS = [
  ['01', 'Describe', 'Tell Xroga what you want to build, who will use it and what must be true when the work is complete.'],
  ['02', 'Build', 'Xroga works in the project and implements the product instead of returning only a mockup or explanation.'],
  ['03', 'Verify', 'Applicable checks run against the project and blockers stay visible instead of being hidden.'],
  ['04', 'Ship', 'Review the result and use supported GitHub or Vercel workflows through accounts you authorize.'],
] as const;

const FAQS = [
  {
    q: 'What is a Web3 app builder?',
    a: 'A Web3 app builder helps create software that uses blockchain data, wallets, decentralized protocols or other Web3 technologies. Xroga uses AI to help build those products while keeping the resulting work connected to an inspectable repository.',
  },
  {
    q: 'Can I build a Web3 app with AI?',
    a: 'Yes. Describe the product you want to create and Xroga can help implement supported interfaces, application logic, APIs, data workflows and integrations inside the project.',
  },
  {
    q: 'Is Xroga a free AI app builder?',
    a: 'Xroga has a free plan that lets you start building without a card. Paid capacity is available when you need more usage.',
  },
  {
    q: 'Can Xroga build blockchain applications?',
    a: 'Xroga can help build supported blockchain and Web3 applications including dashboards, wallet-facing tools, analytics products, DAO software, crypto SaaS and on-chain monitoring interfaces.',
  },
  {
    q: 'Can I use Xroga for Web3 app development?',
    a: 'Yes. You can start a new project or work from an existing repository, then build across supported UI, APIs, data and integrations.',
  },
  {
    q: 'Can Xroga build dApps?',
    a: 'Xroga can help build supported decentralized application interfaces and related Web3 product workflows. Exact requirements depend on the blockchain, contracts, infrastructure and integrations involved.',
  },
  {
    q: 'Can I build a DeFi dashboard with Xroga?',
    a: 'Yes. Xroga can help create supported DeFi dashboards and analytics interfaces around approved market, wallet, protocol or blockchain data sources.',
  },
  {
    q: 'Can Xroga build a Web3 website?',
    a: 'Yes. Xroga can build supported websites and web applications for Web3, blockchain and crypto products while keeping the project attached to code you can inspect.',
  },
  {
    q: 'Can Xroga work with an existing repository?',
    a: 'Yes. Xroga is repository-aware and can work against an existing project rather than forcing every build into a new generic template.',
  },
  {
    q: 'Does Xroga custody cryptocurrency or execute trades?',
    a: 'No. Xroga is a software-building platform, not a broker, exchange, custody provider or managed trading service.',
  },
] as const;

function GlowButton({
  href,
  children,
  secondary = false,
}: {
  href: string;
  children: ReactNode;
  secondary?: boolean;
}) {
  if (secondary) {
    return (
      <Link href={href} className={styles.secondaryButton}>
        <span>{children}</span>
        <ArrowRight aria-hidden="true" />
      </Link>
    );
  }

  return (
    <Link href={href} className="xv-uiv-button">
      <span className="xv-uiv-fold" aria-hidden="true" />
      <span className="xv-uiv-points_wrapper" aria-hidden="true">
        {Array.from({ length: 10 }, (_, index) => (
          <i className="xv-uiv-point" key={index} />
        ))}
      </span>
      <span className="xv-uiv-inner">
        <svg
          className="xv-uiv-icon"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.5"
          aria-hidden="true"
        >
          <polyline points="13.18 1.37 13.18 9.64 21.45 9.64 10.82 22.63 10.82 14.36 2.55 14.36 13.18 1.37" />
        </svg>
        {children}
      </span>
    </Link>
  );
}

export default function CryptoPage() {
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': 'https://xroga.com/crypto#webpage',
        url: 'https://xroga.com/crypto',
        name: 'Free AI App Builder for Web3 & Blockchain Apps | Xroga',
        description:
          'Build Web3 apps, dApps, crypto SaaS and DeFi dashboards with Xroga. A blockchain app builder for Web3 app development in real repositories.',
        isPartOf: { '@id': 'https://xroga.com/#website' },
      },
      {
        '@type': 'WebSite',
        '@id': 'https://xroga.com/#website',
        url: 'https://xroga.com/',
        name: 'Xroga AI',
      },
      {
        '@type': 'SoftwareApplication',
        '@id': 'https://xroga.com/#software',
        name: 'Xroga AI',
        applicationCategory: 'DeveloperApplication',
        operatingSystem: 'Web',
        url: 'https://xroga.com/',
        description:
          'AI app builder and coding agent for repository-backed software work, verification and supported deployment workflows.',
        offers: [
          {
            '@type': 'Offer',
            name: 'Free',
            price: '0',
            priceCurrency: 'USD',
            url: 'https://xroga.com/pricing',
          },
          {
            '@type': 'Offer',
            name: 'Xroga Pro',
            price: '25',
            priceCurrency: 'USD',
            url: 'https://xroga.com/pricing',
          },
        ],
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: 'https://xroga.com/',
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Web3 & Blockchain App Builder',
            item: 'https://xroga.com/crypto',
          },
        ],
      },
    ],
  };

  return (
    <main className={`${styles.root} ${manrope.variable} ${editorial.variable}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(ld).replace(/</g, '\\u003c'),
        }}
      />

      <section className={styles.hero} id="top">
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.heroInner}>
          <div className={styles.seoEyebrow}>
            <Sparkles aria-hidden="true" />
            FREE AI APP BUILDER · WEB3 · BLOCKCHAIN APPS · CRYPTO
          </div>

          <h1 className={styles.heroTitle}>
            <span className={styles.heroSansLine}>Build Web3 &amp; Blockchain</span>
            <br />
            <span className={styles.heroSerifLine}>
              <span className={styles.heroMutedText}>Apps with</span>{' '}
              <span className={styles.heroBrightText}>AI</span>
            </span>
          </h1>

          <p className={styles.heroSub}>
            Build Web3 apps, dApps, DeFi dashboards, crypto SaaS, wallet tools and
            on-chain products with AI — inside a real repository you control.
          </p>

          <div className={styles.heroActions}>
            <GlowButton href="/auth/signup">Start Building Free</GlowButton>
            <GlowButton href="#what-you-can-build" secondary>
              See What You Can Build
            </GlowButton>
          </div>

          <div className={styles.heroConsole} id="builder">
            <CryptoPromptBar />
          </div>

          <div className={styles.trustStrip} aria-label="Xroga workflow benefits">
            <span><CheckCircle2 /> Free to start</span>
            <span><GitBranch /> Real repository</span>
            <span><Code2 /> Reviewable code</span>
            <span><ShieldCheck /> Verification before shipping</span>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.introSection}`}>
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.kicker}>AI APP BUILDER FOR WEB3</span>
            <h2>Build the product behind the crypto idea.</h2>
          </div>
          <p>
            Xroga is an AI app builder for real Web3, blockchain and crypto software.
            Start from an idea or an existing repository and keep the result inspectable.
          </p>
        </div>

        <div className={styles.introGrid}>
          <article className={styles.statementCard}>
            <span>01 / BUILD</span>
            <h3>Not just a crypto website generator.</h3>
            <p>
              Work across interfaces, APIs, data, application logic and supported
              integrations instead of stopping at a static landing page.
            </p>
          </article>

          <article className={styles.statementCard}>
            <span>02 / OWN</span>
            <h3>Real repository. Code you control.</h3>
            <p>
              Build in a codebase your team can inspect, continue developing and hand
              off without being trapped inside a visual prototype.
            </p>
          </article>

          <article className={styles.statementCard}>
            <span>03 / VERIFY</span>
            <h3>From crypto idea to verified code.</h3>
            <p>
              Applicable checks happen before the work is presented as ready, with
              blockers surfaced rather than hidden.
            </p>
          </article>
        </div>
      </section>

      <section className={`${styles.section} ${styles.freeSection}`}>
        <div className={styles.freePanel}>
          <div className={styles.freeCopy}>
            <span className={styles.kicker}>FREE AI APP BUILDER</span>
            <h2>Start a Web3 project before you pay.</h2>
            <p>
              Use Xroga&apos;s free plan to turn a Web3 or blockchain idea into a working
              project, explore the workflow and build against a real repository before
              you need more capacity.
            </p>
            <div className={styles.miniPoints}>
              <span><Check /> No card required</span>
              <span><Check /> Repository-aware edits</span>
              <span><Check /> Preview &amp; verification</span>
            </div>
            <GlowButton href="/auth/signup">Start Free</GlowButton>
          </div>

          <ExactFolderVisual />
        </div>
      </section>

      <section className={styles.section} id="what-you-can-build">
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.kicker}>BLOCKCHAIN APP BUILDER</span>
            <h2>What can you build with Xroga?</h2>
          </div>
          <p>
            From focused crypto utilities to full Web3 applications, the same
            repository-aware workflow scales with the product.
          </p>
        </div>

        <div className={styles.productGrid}>
          {PRODUCT_TYPES.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className={styles.tiltShell}>
                <span className={styles.tiltHit} />
                <span className={styles.tiltHit} />
                <span className={styles.tiltHit} />
                <span className={styles.tiltHit} />
                <article className={styles.productCard}>
                  <div className={styles.productIcon}><Icon /></div>
                  <h3>{item.title}</h3>
                  <p>{item.copy}</p>
                  <span className={styles.cardArrow}><ArrowRight /></span>
                </article>
              </div>
            );
          })}
        </div>
      </section>

      <section className={`${styles.section} ${styles.devSection}`}>
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.kicker}>WEB3 APP DEVELOPMENT</span>
            <h2>Build a Web3 app without starting from zero.</h2>
          </div>
          <p>
            A real Web3 product can need UI, APIs, persistent data, wallet experiences,
            blockchain data and deployment configuration. Keep those parts in one project.
          </p>
        </div>

        <div className={styles.devLayout}>
          <div className={styles.devSteps}>
            {DEVELOPMENT.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className={styles.devStep}>
                  <span><Icon /></span>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.copy}</p>
                  </div>
                </article>
              );
            })}
          </div>

          <ExactRepoPullRequestVisual />
        </div>
      </section>

      <section className={`${styles.section} ${styles.dashboardSection}`}>
        <div className={styles.splitFeature}>
          <div className={styles.dashboardExactStack}>
            <ExactCryptoCardVisual />
            <ExactMarketChartVisual />
          </div>

          <div className={styles.splitCopy}>
            <span className={styles.kicker}>AI DASHBOARD BUILDER</span>
            <h2>Build DeFi &amp; crypto analytics dashboards.</h2>
            <p>
              Turn approved market, wallet, protocol and blockchain data into usable
              product experiences with interfaces, logic and data flows in the same repo.
            </p>
            <div className={styles.chipGrid}>
              {DASHBOARD_EXAMPLES.map((item) => <span key={item}>{item}</span>)}
            </div>
            <GlowButton href="/auth/signup" secondary>Build a Crypto Dashboard</GlowButton>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.kicker}>AI SAAS BUILDER</span>
            <h2>Build crypto SaaS products, not just demos.</h2>
          </div>
          <p>
            Create account-based products with supported dashboards, application logic,
            APIs, persistent data and external integrations.
          </p>
        </div>

        <div className={styles.saasGrid}>
          {SAAS_EXAMPLES.map(([title, copy], index) => (
            <div key={title} className={styles.tiltShell}>
              <span className={styles.tiltHit} />
              <span className={styles.tiltHit} />
              <span className={styles.tiltHit} />
              <span className={styles.tiltHit} />
              <article className={styles.tiltCard}>
                <div className={styles.tiltTop}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <Layers3 />
                </div>
                <h3>{title}</h3>
                <p>{copy}</p>
                <div className={styles.tiltLine} />
              </article>
            </div>
          ))}
        </div>
      </section>

      <section className={`${styles.section} ${styles.websiteSection}`}>
        <div className={styles.websitePanel}>
          <div className={styles.websiteCopy}>
            <span className={styles.kicker}>WEB3 WEBSITE BUILDER</span>
            <h2>Build the website — then build the product behind it.</h2>
            <p>
              Create a Web3 or crypto project website, then keep going into the actual
              application, dashboard, API and product workflow in the same development environment.
            </p>
            <div className={styles.websiteKinds}>
              <span>Crypto project websites</span>
              <span>DeFi websites</span>
              <span>Blockchain startup websites</span>
              <span>Web3 landing pages</span>
            </div>
            <p className={styles.editorialLine}>
              Not just a Web3 website. <strong>Build the product behind it.</strong>
            </p>
          </div>

          <div className={styles.websiteBuildVisual}>
            <ExactWebsiteBuildVisual />
          </div>
        </div>
      </section>

      <section className={styles.section} id="workflow">
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.kicker}>HOW IT WORKS</span>
            <h2>From Web3 idea to working product.</h2>
          </div>
          <p>
            A simple build loop keeps the request, repository work, checks and release
            evidence connected.
          </p>
        </div>

        <div className={styles.processGridFour}>
          {PROCESS.map(([number, title, copy]) => (
            <article className={styles.processCard} key={number}>
              <div className={styles.processTop}>
                <span>{number}</span>
                <Workflow />
              </div>
              <h3>{title}</h3>
              <p>{copy}</p>
              <div className={styles.processLine} />
            </article>
          ))}
        </div>

        <div className={styles.flowRail}>
          <span>DESCRIBE</span><i />
          <span>BUILD</span><i />
          <span>VERIFY</span><i />
          <span>SHIP</span>
        </div>
      </section>

      <section className={`${styles.section} ${styles.whySection}`}>
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.kicker}>WHY XROGA</span>
            <h2>Built for more than a prototype.</h2>
          </div>
          <p>
            Generating code is only the beginning. Xroga keeps the work tied to a real
            project, real checks and code you can continue using.
          </p>
        </div>

        <div className={styles.whyGrid}>
          <article><GitBranch /><h3>Real repository</h3><p>Your project stays attached to inspectable code.</p></article>
          <article><Code2 /><h3>Existing code support</h3><p>Use Xroga for new builds or focused work inside a project you already have.</p></article>
          <article><ShieldCheck /><h3>Verification before shipping</h3><p>Applicable checks help separate generated code from code that actually passed validation.</p></article>
          <article><Rocket /><h3>Provider-backed shipping</h3><p>Use supported GitHub and Vercel workflows through accounts you authorize.</p></article>
        </div>

        <div className={styles.proofQuote}>
          <span className={styles.proofLogo}>
            <Logo href={null} variant="homepage" height={24} />
          </span>
          <blockquote>
            “A build is complete only after the required validation passes.”
          </blockquote>
          <small>From crypto idea to verified code.</small>
        </div>
      </section>

      <section className={`${styles.section} ${styles.planSection}`}>
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.kicker}>SIMPLE ACCESS</span>
            <h2>Start free. Scale when you need more.</h2>
          </div>
          <p>
            Xroga&apos;s free plan is built to let you start. Move to Pro when you need
            more capacity for ongoing product work.
          </p>
        </div>

        <div className={styles.planGrid}>
          <article className={styles.planSideCard}>
            <span>BUILD</span>
            <h3>Research + Code</h3>
            <ul>
              <li><Check /> Repository inspection</li>
              <li><Check /> Focused implementation</li>
              <li><Check /> Web3 product scaffolding</li>
              <li><Check /> Current-source research</li>
            </ul>
          </article>

          <article className={styles.planMainCard}>
            <div className={styles.planBadge}>START FREE</div>
            <p>XROGA AI</p>
            <div className={styles.price}><strong>$0</strong><span>to start</span></div>
            <Link href="/auth/signup">Start building free <ArrowRight /></Link>
            <ul>
              <li><Check /> Included AI usage</li>
              <li><Check /> Repository-aware edits</li>
              <li><Check /> Preview and verification</li>
              <li><Check /> No card required</li>
            </ul>
          </article>

          <article className={styles.planSideCard}>
            <span>SHIP</span>
            <h3>Verify + Publish</h3>
            <ul>
              <li><Check /> Applicable checks</li>
              <li><Check /> Reviewable changes</li>
              <li><Check /> GitHub workflow</li>
              <li><Check /> Vercel workflow</li>
            </ul>
          </article>
        </div>
      </section>

      <section className={`${styles.section} ${styles.faqSection}`}>
        <div className={styles.faqIntro}>
          <span className={styles.kicker}>WEB3 &amp; BLOCKCHAIN APP BUILDER FAQ</span>
          <h2>Clear answers before you build.</h2>
          <p>
            What Xroga can build, how the workflow works and where the boundaries are.
          </p>
          <Link href="/docs">Read the docs <ArrowRight /></Link>
        </div>

        <div className={styles.faqList}>
          {FAQS.map((item) => (
            <details key={item.q}>
              <summary>{item.q}<span>+</span></summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className={styles.finalCta}>
        <div className={styles.finalGlow} aria-hidden="true" />
        <span className={styles.finalOrb}><Layers3 /></span>
        <span className={styles.kicker}>FREE AI APP BUILDER · WEB3 · BLOCKCHAIN</span>
        <h2>Build your Web3 product with Xroga.</h2>
        <p>
          Go from an idea to real, reviewable software. Build Web3 apps, blockchain
          products, DeFi dashboards, crypto SaaS and on-chain tools with AI.
        </p>
        <GlowButton href="/auth/signup">Start Building Free</GlowButton>
        <div className={styles.finalTags}>
          <span>Web3 Apps</span>
          <span>Blockchain Apps</span>
          <span>Crypto SaaS</span>
          <span>DeFi Dashboards</span>
          <span>On-Chain Tools</span>
        </div>
      </section>
    </main>
  );
}
