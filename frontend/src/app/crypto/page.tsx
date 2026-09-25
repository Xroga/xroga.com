import type { Metadata } from 'next';
import Link from 'next/link';
import { Arvo, Manrope } from 'next/font/google';
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
  ExternalLink,
  GitBranch,
  Globe2,
  Layers3,
  Network,
  Radar,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  Workflow,
} from 'lucide-react';

import { Logo } from '@/components/layout/Logo';
import { BUILD_KINDS } from '@/lib/cryptoBuilderContent';
import { HACKATHON_SOURCES } from '@/lib/hackathonResearch';
import { buildMetadata } from '@/lib/seo';

import '@/styles/homepage-coding.css';
import { CryptoPromptBar } from './CryptoPromptBar';
import { CryptoSeoSections } from './CryptoSeoSections';
import seoStyles from './crypto-seo.module.css';
import styles from './crypto.module.css';

const arvo = Arvo({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-arvo', display: 'swap' });
const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope', display: 'swap' });

export const metadata: Metadata = buildMetadata({
  title: 'Free AI App Builder for Web3 & Blockchain Apps',
  description:
    'Build Web3 apps, dApps, crypto SaaS and DeFi dashboards with Xroga. A blockchain app builder for Web3 development in real repositories. Start free.',
  path: '/crypto',
  keywords: [
    'free AI app builder',
    'Web3 app',
    'Web3 apps',
    'Web3 app development',
    'blockchain app builder',
    'Web3 website builder',
    'AI website generator',
    'AI dashboard builder',
    'AI SaaS builder',
    'dApp builder',
    'AI crypto builder',
  ],
});

const FEATURE_ICONS = [Bot, Blocks, Radar, ShieldCheck] as const;

const BUILD_ICONS = [
  Bot,
  Braces,
  BarChart3,
  Blocks,
  Network,
  Radar,
  Database,
  Rocket,
] as const;

const PROCESS = [
  {
    number: '01',
    icon: Search,
    title: 'Research the brief',
    copy:
      'Start from official documentation, current ecosystem requirements and the exact product outcome you want.',
  },
  {
    number: '02',
    icon: Code2,
    title: 'Build in the real repo',
    copy:
      'Xroga works against the connected project, applies focused changes and keeps unrelated working code intact.',
  },
  {
    number: '03',
    icon: ShieldCheck,
    title: 'Verify, then ship',
    copy:
      'Run applicable checks first. Push to GitHub and publish through Vercel only with provider-backed evidence.',
  },
] as const;

const FAQS = [
  {
    q: 'What is a Web3 app builder?',
    a:
      'A Web3 app builder helps create software around blockchain data, wallets, decentralized protocols and other on-chain workflows. Xroga focuses on repository-backed product work rather than only generating a visual prototype.',
  },
  {
    q: 'Is Xroga a free AI app builder?',
    a:
      'Yes. Xroga has a free plan with no card required, including limited access to the core building workspace, repository-aware edits, previews and verification. Paid capacity is available when you need more.',
  },
  {
    q: 'Is Xroga a dApp builder?',
    a:
      'Xroga can help build supported Web3 and blockchain applications including wallet-facing interfaces, dApp front ends, dashboards, DAO software, analytics products, crypto SaaS and on-chain monitoring tools.',
  },
  {
    q: 'Can I use Xroga for Web3 app development?',
    a:
      'Yes. You can start a supported Web3 product from a new project or continue from an existing repository while keeping the implementation attached to inspectable code.',
  },
  {
    q: 'Can I build a DeFi dashboard with Xroga?',
    a:
      'Yes. Xroga can help build supported DeFi and crypto dashboards around approved public or authorized data sources, including wallet activity, protocol information, analytics and monitoring workflows.',
  },
  {
    q: 'Can I build a crypto SaaS product?',
    a:
      'Yes. Supported crypto SaaS work can span application interfaces, APIs, accounts, persistent data, dashboards and authorized integrations in the same repository-aware workflow.',
  },
  {
    q: 'Can Xroga build a Web3 website?',
    a:
      'Yes. Xroga can build supported Web3 and crypto websites, and it can continue beyond the marketing surface into the application, APIs and product workflows behind it.',
  },
  {
    q: 'Can I use my existing repository?',
    a:
      'Yes. Xroga is repository-aware and can work against an existing project rather than forcing every build into a new generic template.',
  },
  {
    q: 'Does Xroga custody funds or execute trades?',
    a:
      'No. This page is for building software products and interfaces. Xroga does not present itself as a custody service, exchange, broker or managed trading service.',
  },
  {
    q: 'Can Xroga deploy the finished web product?',
    a:
      'For supported web projects, Xroga can publish through a Vercel account you authorize after applicable validation succeeds.',
  },
  {
    q: 'Is the hackathon research affiliated with the organizers shown?',
    a:
      'No. The organizer links are references to official public sources so you can verify current rules, tracks and requirements yourself.',
  },
] as const;

function FeatureArtwork({ index }: { index: number }) {
  if (index === 0) {
    return (
      <div className={styles.repoArtwork} aria-hidden="true">
        <div className={styles.repoTopline}>
          <span />
          <span />
          <span />
        </div>

        <div className={styles.repoPrompt}>
          Build a wallet activity intelligence dashboard
        </div>

        <div className={styles.repoFlow}>
          <span>plan</span>
          <i />
          <span>code</span>
          <i />
          <span>verify</span>
        </div>

        <div className={styles.repoStatus}>
          <CheckCircle2 />
          <span>Repository change ready for review</span>
        </div>
      </div>
    );
  }

  if (index === 1) {
    return (
      <div className={styles.agentArtwork} aria-hidden="true">
        <div className={styles.agentHalo} />

        <div className={styles.agentOrb}>
          <Sparkles />
        </div>

        <div className={styles.agentBubbleOne}>
          Summarise protocol activity
        </div>

        <div className={styles.agentBubbleTwo}>
          Source-aware result
        </div>
      </div>
    );
  }

  if (index === 2) {
    return (
      <div className={styles.monitorArtwork} aria-hidden="true">
        <div className={styles.monitorGrid} />

        <div className={styles.monitorLine}>
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>

        <div className={styles.monitorCard}>
          <Radar />

          <span>
            <b>Watch event</b>
            address · contract · state
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.shipArtwork} aria-hidden="true">
      <div className={styles.shipRingOuter} />
      <div className={styles.shipRingInner} />

      <div className={styles.shipCore}>
        <Check />
      </div>

      <div className={styles.shipPill}>
        <GitBranch />
        verified → pushed → live
      </div>
    </div>
  );
}

export default function CryptoPage() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': 'https://xroga.com/crypto#webpage',
        url: 'https://xroga.com/crypto',
        name: 'Free AI App Builder for Web3 & Blockchain Apps',
        description:
          'Build Web3 apps, dApps, crypto SaaS and DeFi dashboards with Xroga in real repositories you control.',
        isPartOf: {
          '@id': 'https://xroga.com/#website',
        },
        about: {
          '@id': 'https://xroga.com/crypto#software',
        },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': 'https://xroga.com/crypto#software',
        name: 'Xroga Web3 & Blockchain App Builder',
        applicationCategory: 'DeveloperApplication',
        operatingSystem: 'Web',
        url: 'https://xroga.com/crypto',
        description:
          'A free AI app builder for Web3 and blockchain projects, including dApps, DeFi dashboards, crypto SaaS, wallet tools and on-chain products.',
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
          url: 'https://xroga.com/crypto#builder',
        },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': 'https://xroga.com/crypto#breadcrumb',
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
    <main className={`xv-cb-root ${styles.root}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, '\\u003c'),
        }}
      />

      <section className={styles.hero} id="top">
        <div
          className={styles.heroGlow}
          aria-hidden="true"
        />

        <div className={styles.heroInner}>
          <span className={`${styles.eyebrow} ${seoStyles.heroEyebrow}`}>
            <Sparkles aria-hidden="true" />
            FREE AI APP BUILDER · WEB3 · BLOCKCHAIN APPS · CRYPTO
          </span>

          <h1 className={`xv-cb-h1 ${styles.heroTitle} ${seoStyles.heroTitle}`}>
            Build Web3 &amp; Blockchain Apps
            <br />
            <span>with AI</span>
          </h1>

          <p className={styles.heroSub}>
            Build Web3 apps, dApps, DeFi dashboards, crypto SaaS,
            wallet tools and on-chain products with AI—in a real
            repository you control.{' '}
            <strong>Start free. Keep the code.</strong>
          </p>

          <div className={seoStyles.heroTrust} aria-label="Xroga product advantages">
            <span>Free to start</span>
            <i />
            <span>Real repository</span>
            <i />
            <span>Reviewable code</span>
            <i />
            <span>Verification before shipping</span>
          </div>

          {/* The hero used to carry a "Start building" button between the subtitle and
              the console, linking to `#builder` — the console directly beneath it. It
              scrolled to something already on screen, and it put a second call to action
              in front of the one thing on this page that actually starts a build. The
              header's "Start building" is unchanged, and the anchor stays on the console
              so any inbound `#builder` link still lands. */}
          <div
            className={styles.heroConsole}
            id="builder"
          >
            <CryptoPromptBar />
          </div>

          <div className={styles.stackLabel}>
            RESEARCH FROM OFFICIAL ECOSYSTEM SOURCES
          </div>

          <div
            className={styles.ecosystemRow}
            id="research"
          >
            {HACKATHON_SOURCES.map((source) => (
              <a
                key={source.name}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`xv-cb-eco-card ${styles.ecoLink}`}
                title={source.note}
              >
                {source.name}
              </a>
            ))}
          </div>

          <p className={styles.ecosystemNote}>
            Xroga is not affiliated with or endorsed by the
            organizations shown.
            <strong>
              {' '}
              Check official event details
            </strong>
            , current rules and requirements before you build
            or submit.
          </p>
        </div>
      </section>

      <section
        className={styles.section}
        id="capabilities"
      >
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.kicker}>
              WHAT YOU GET
            </span>

            <h2>
              AI App Builder for Web3
              <br />
              &amp; Blockchain Products
            </h2>
          </div>

          <p>
            Turn Web3 product requirements into repository work,
            supported integrations, validation and publishing
            evidence without hiding the code.
          </p>
        </div>

        <div className={styles.featureGrid}>
          {[
            {
              title: 'Repository-Aware Building',
              copy:
                'Inspect the existing project, make focused changes and keep the work attached to code you own.',
            },
            {
              title: 'AI-Powered Crypto Workflows',
              copy:
                'Turn product requirements and approved sources into agents, interfaces, analytics and automation.',
            },
            {
              title: 'On-chain Monitoring Products',
              copy:
                'Build address, contract, event and protocol-state monitoring surfaces with clear source context.',
            },
            {
              title: 'Verification Before Shipping',
              copy:
                'Run applicable checks first, then push or publish with evidence—or surface the exact blocker.',
            },
          ].map((feature, index) => {
            const Icon = FEATURE_ICONS[index];

            return (
              <article
                className={styles.featureCard}
                key={feature.title}
              >
                <div className={styles.featureVisual}>
                  <FeatureArtwork index={index} />
                </div>

                <div className={styles.featureBody}>
                  <div className={styles.featureIcon}>
                    <Icon />
                  </div>

                  <div>
                    <h3>
                      {feature.title}
                    </h3>

                    <p>
                      {feature.copy}
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section
        className={`${styles.section} ${styles.typesSection}`}
        id="use-cases"
      >
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.kicker}>
              BUILT FOR THE CATEGORY
            </span>

            <h2>
              What Can You Build with
              <br />
              a Web3 App Builder?
            </h2>
          </div>

          <p>
            From Web3 apps and dApps to DeFi dashboards, crypto
            SaaS and on-chain tools, the same repository-aware
            workflow scales with the product.
          </p>
        </div>

        <div className={styles.typesPanel}>
          <div className={styles.typesIntro}>
            <span className={styles.typesMark}>
              <Globe2 />
            </span>

            <h3>
              One builder. Multiple crypto product shapes.
            </h3>

            <p>
              Keep architecture, validation and shipping
              evidence in the same product loop instead of
              stitching together disconnected demos.
            </p>

            <Link href="/features">
              Explore Xroga capabilities
              <ArrowRight />
            </Link>
          </div>

          <div className={styles.typesGrid}>
            {BUILD_KINDS.map((kind, index) => {
              const Icon = BUILD_ICONS[index];

              return (
                <article
                  key={kind.title}
                  className={styles.typeItem}
                >
                  <span>
                    <Icon />
                  </span>

                  <div>
                    <h3>
                      {kind.title}
                    </h3>

                    <p>
                      {kind.body}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <CryptoSeoSections />

      <section
        className={`${styles.section} ${styles.proofSection}`}
      >
        <div className={styles.proofCard}>
          <div
            className={styles.proofGlow}
            aria-hidden="true"
          />

          <span className={styles.kicker}>
            WHAT THE WORKFLOW KEEPS VISIBLE
          </span>

          <blockquote>
            “A build is complete only after the required
            validation passes. Shipping is reported only with
            repository or provider evidence.”
          </blockquote>

          <div className={styles.proofMeta}>
            <span className={styles.proofLogo}>
              <Logo
                href={null}
                variant="homepage"
                height={26}
              />
            </span>

            <div>
              <strong>
                Xroga execution principle
              </strong>

              <small>
                Plan → code → verify → ship
              </small>
            </div>
          </div>
        </div>
      </section>

      <section
        className={styles.section}
        id="workflow"
      >
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.kicker}>
              HOW IT WORKS
            </span>

            <h2>
              One Continuous
              <br />
              Build Loop
            </h2>
          </div>

          <p>
            The layout is simple because the workflow is
            simple: understand the outcome, change the real
            project, verify the result, then deliver it.
          </p>
        </div>

        <div className={styles.processGrid}>
          {PROCESS.map((step) => {
            const Icon = step.icon;

            return (
              <article
                className={styles.processCard}
                key={step.number}
              >
                <div className={styles.processTop}>
                  <span>
                    {step.number}
                  </span>

                  <Icon />
                </div>

                <h3>
                  {step.title}
                </h3>

                <p>
                  {step.copy}
                </p>

                <div className={styles.processLine} />
              </article>
            );
          })}
        </div>
      </section>

      <section
        className={`${styles.section} ${styles.planSection}`}
      >
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.kicker}>
              START FREE · SCALE WITH THE WORK
            </span>

            <h2>
              Build First.
              <br />
              Upgrade When You Need More.
            </h2>
          </div>

          <p>
            Crypto building uses the same Xroga workspace. Start
            free with no card, then move to Pro when you need
            higher capacity and production-focused workflows.
          </p>
        </div>

        <div className={styles.planGrid}>
          <article className={styles.planSideCard}>
            <span>
              BUILD
            </span>

            <h3>
              Repository-Aware Work
            </h3>

            <ul>
              <li><Check /> Existing or new project</li>
              <li><Check /> Focused implementation</li>
              <li><Check /> Web3 product scaffolding</li>
              <li><Check /> Applicable verification</li>
            </ul>
          </article>

          <article className={styles.planMainCard}>
            <div className={styles.planBadge}>
              START HERE
            </div>

            <p>
              XROGA FREE
            </p>

            <div className={styles.price}>
              <strong>
                $0
              </strong>

              <span>
                / forever
              </span>
            </div>

            <Link href="/auth/signup">
              Start building free
              <ArrowRight />
            </Link>

            <ul>
              <li><Check /> No card required</li>
              <li><Check /> Included AI usage</li>
              <li><Check /> Repository-aware edits</li>
              <li><Check /> Preview and verification</li>
            </ul>
          </article>

          <article className={styles.planSideCard}>
            <span>
              SCALE
            </span>

            <h3>
              Xroga Pro
            </h3>

            <ul>
              <li><Check /> Higher monthly AI capacity</li>
              <li><Check /> Faster access pacing</li>
              <li><Check /> Production-focused workflows</li>
              <li><Check /> Same code and provider ownership</li>
            </ul>

            <Link href="/pricing">
              View current pricing
              <ArrowRight />
            </Link>
          </article>
        </div>
      </section>

      <section
        className={`${styles.section} ${styles.faqSection}`}
      >
        <div className={styles.faqIntro}>
          <span className={styles.kicker}>
            FREQUENTLY ASKED QUESTIONS
          </span>

          <h2>
            Web3 &amp; Blockchain App Builder FAQs
          </h2>

          <p>
            Direct answers about building Web3 apps with AI,
            repository ownership, dashboards, SaaS, dApps and
            shipping boundaries.
          </p>

          <Link href="/docs">
            Read the docs
            <ArrowRight />
          </Link>
        </div>

        <div className={styles.faqList}>
          {FAQS.map((item) => (
            <details key={item.q}>
              <summary>
                {item.q}
                <span>
                  +
                </span>
              </summary>

              <p>
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </section>

      <section
        className={`${styles.section} ${styles.insightsSection}`}
      >
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.kicker}>
              XROGA INSIGHTS
            </span>

            <h2>
              Research and docs for the build.
            </h2>
          </div>

          <Link
            href="/research"
            className={styles.textLink}
          >
            Browse research
            <ArrowRight />
          </Link>
        </div>

        <div className={styles.insightGrid}>
          <Link
            href="/research/web3-hackathon-winning-patterns"
            className={styles.insightCard}
          >
            <div className={styles.insightVisual}>
              <Search />
              <span>
                OFFICIAL SOURCES
              </span>
            </div>

            <p>
              Web3 hackathon winning patterns
            </p>

            <ExternalLink />
          </Link>

          <Link
            href="/docs/hackathon-workflows"
            className={styles.insightCard}
          >
            <div className={styles.insightVisual}>
              <Workflow />
              <span>
                WORKFLOW
              </span>
            </div>

            <p>
              Turn rules into a credible MVP
            </p>

            <ArrowRight />
          </Link>

          <Link
            href="/docs/github"
            className={styles.insightCard}
          >
            <div className={styles.insightVisual}>
              <GitBranch />
              <span>
                OWNERSHIP
              </span>
            </div>

            <p>
              Ship through your GitHub repository
            </p>

            <ArrowRight />
          </Link>

          <Link
            href="/docs/vercel"
            className={styles.insightCard}
          >
            <div className={styles.insightVisual}>
              <Rocket />
              <span>
                DEPLOY
              </span>
            </div>

            <p>
              Publish with real provider evidence
            </p>

            <ArrowRight />
          </Link>
        </div>
      </section>

      <section className={styles.finalCta}>
        <div
          className={styles.finalGlow}
          aria-hidden="true"
        />

        <span className={styles.finalOrb}>
          <Layers3 />
        </span>

        <h2>
          Build the crypto product.
        </h2>

        <p>
          Describe the outcome. Xroga works against the
          project and keeps the evidence visible.
        </p>

        <Link href="/auth/signup">
          Start building
          <ArrowRight />
        </Link>
      </section>

      {/* The homepage footer, not a second one built beside it. This page carried
          its own copy — same links, same wording, its own markup and its own
          stylesheet — so every change to the site footer had to be made twice and
          the two drifted apart. */}
    </main>
  );
}
