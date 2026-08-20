import type { Metadata } from 'next';
import Link from 'next/link';
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
import { HomepageChatBar } from '@/components/terminal/HomepageChatBar';
import {
  BUILD_KINDS,
  PLACEHOLDERS,
  PROMPT_SUGGESTIONS,
} from '@/lib/cryptoBuilderContent';
import { HACKATHON_SOURCES } from '@/lib/hackathonResearch';
import { buildMetadata } from '@/lib/seo';

import '@/styles/homepage-coding.css';
import styles from './crypto.module.css';

export const metadata: Metadata = buildMetadata({
  title: 'Crypto Builder — Build Web3 Apps & AI Agents',
  description:
    'Build crypto agents, Web3 applications, DeFi dashboards, DAO tooling, on-chain monitoring and hackathon projects with Xroga AI.',
  path: '/crypto',
  keywords: [
    'crypto builder',
    'AI crypto agent builder',
    'Web3 builder',
    'DeFi app builder',
    'on-chain analytics',
    'crypto hackathon builder',
    'AI Web3 development',
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
    q: 'What can Xroga build for crypto?',
    a:
      'Crypto agents, Web3 front ends, DeFi dashboards, DAO and governance tooling, token and wallet utilities, on-chain monitoring, analytics products and hackathon MVPs.',
  },
  {
    q: 'Does Xroga custody funds or execute trades?',
    a:
      'No. This page is for building software products and interfaces. Xroga does not present itself as a custody service or a managed trading service.',
  },
  {
    q: 'Can I use my existing repository?',
    a:
      'Yes. Xroga is repository-aware and can work against an existing project rather than forcing every build into a new generic template.',
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
        <div className={styles.repoPrompt}>Build a wallet activity intelligence dashboard</div>
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
        <div className={styles.agentBubbleOne}>Summarise protocol activity</div>
        <div className={styles.agentBubbleTwo}>Source-aware result</div>
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
  const softwareLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Xroga Crypto Builder',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Web',
    url: 'https://xroga.com/crypto',
    description:
      'Build AI crypto agents, Web3 applications, DeFi products, on-chain analytics and hackathon projects with Xroga AI.',
  };

  return (
    <main className={`xv-cb-root ${styles.root}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(softwareLd).replace(/</g, '\\u003c'),
        }}
      />

      <section className={styles.hero} id="top">
        <div className={styles.heroGlow} aria-hidden="true" />

        <header className={styles.nav}>
          <Link href="/" className={styles.brand} aria-label="Xroga home">
            <Logo href={null} variant="homepage" height={34} />
          </Link>

          <nav className={styles.navLinks} aria-label="Crypto navigation">
            <a href="#capabilities">Capabilities</a>
            <a href="#workflow">Workflow</a>
            <a href="#research">Research</a>
            <Link href="/docs">Docs</Link>
          </nav>

          <div className={styles.navActions}>
            <Link href="/auth/login" className={styles.signIn}>
              Sign in
            </Link>
            <Link href="/auth/signup" className={styles.navCta}>
              Start building
            </Link>
          </div>
        </header>

        <div className={styles.heroInner}>
          <div className={styles.eyebrow}>
            <Sparkles />
            XROGA CRYPTO BUILDER
          </div>

          <h1 className={`xv-cb-h1 ${styles.heroTitle}`}>
            AI Crypto Builder
            <br />
            That <span>Ships</span>
          </h1>

          <p className={styles.heroSub}>
            Build crypto agents, Web3 apps, DeFi dashboards, DAO tooling and
            on-chain products in a real repository. Xroga is for crypto product
            work, <strong>not only hackathons.</strong>
          </p>

          <a href="#builder" className={styles.primaryButton}>
            Start building <ArrowRight />
          </a>

          <div className={styles.heroConsole} id="builder">
            <div className={styles.consoleHead}>
              <span>XROGA AI · CRYPTO</span>
              <small>repository-aware builder</small>
            </div>

            <HomepageChatBar
              placeholders={PLACEHOLDERS}
              suggestions={PROMPT_SUGGESTIONS}
              ariaLabel="Describe the crypto product or AI agent you want to build"
              fallbackPrompt="Build a crypto product with Xroga AI"
              className={styles.promptBar}
            />
          </div>

          <div className={styles.stackLabel}>RESEARCH FROM OFFICIAL ECOSYSTEM SOURCES</div>
          <div className={styles.ecosystemRow} id="research">
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
            Xroga is not affiliated with or endorsed by the organizations shown.
            <strong> Check official event details</strong>, current rules and
            requirements before you build or submit.
          </p>
        </div>
      </section>

      <section className={styles.section} id="capabilities">
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.kicker}>WHAT YOU GET</span>
            <h2>
              Everything You Need to
              <br />
              Build Crypto Products
            </h2>
          </div>
          <p>
            A focused software loop from current research to repository work,
            validation and publishing.
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
              <article className={styles.featureCard} key={feature.title}>
                <div className={styles.featureVisual}>
                  <FeatureArtwork index={index} />
                </div>
                <div className={styles.featureBody}>
                  <div className={styles.featureIcon}>
                    <Icon />
                  </div>
                  <div>
                    <h3>{feature.title}</h3>
                    <p>{feature.copy}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className={`${styles.section} ${styles.typesSection}`}>
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.kicker}>BUILT FOR THE CATEGORY</span>
            <h2>
              Built for Every Type
              <br />
              of Crypto Product
            </h2>
          </div>
          <p>
            From focused research tools to full Web3 applications, the same
            repository-aware workflow scales with the product.
          </p>
        </div>

        <div className={styles.typesPanel}>
          <div className={styles.typesIntro}>
            <span className={styles.typesMark}>
              <Globe2 />
            </span>
            <h3>One builder. Multiple crypto product shapes.</h3>
            <p>
              Keep architecture, validation and shipping evidence in the same
              product loop instead of stitching together disconnected demos.
            </p>
            <Link href="/features">
              Explore Xroga capabilities <ArrowRight />
            </Link>
          </div>

          <div className={styles.typesGrid}>
            {BUILD_KINDS.map((kind, index) => {
              const Icon = BUILD_ICONS[index];
              return (
                <article key={kind.title} className={styles.typeItem}>
                  <span>
                    <Icon />
                  </span>
                  <div>
                    <h3>{kind.title}</h3>
                    <p>{kind.body}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.proofSection}`}>
        <div className={styles.proofCard}>
          <div className={styles.proofGlow} aria-hidden="true" />
          <span className={styles.kicker}>WHAT THE WORKFLOW KEEPS VISIBLE</span>
          <blockquote>
            “A build is complete only after the required validation passes.
            Shipping is reported only with repository or provider evidence.”
          </blockquote>
          <div className={styles.proofMeta}>
            <span className={styles.proofLogo}>
              <Logo href={null} variant="homepage" height={26} />
            </span>
            <div>
              <strong>Xroga execution principle</strong>
              <small>Plan → code → verify → ship</small>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section} id="workflow">
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.kicker}>HOW IT WORKS</span>
            <h2>
              One Continuous
              <br />
              Build Loop
            </h2>
          </div>
          <p>
            The layout is simple because the workflow is simple: understand the
            outcome, change the real project, verify the result, then deliver it.
          </p>
        </div>

        <div className={styles.processGrid}>
          {PROCESS.map((step) => {
            const Icon = step.icon;
            return (
              <article className={styles.processCard} key={step.number}>
                <div className={styles.processTop}>
                  <span>{step.number}</span>
                  <Icon />
                </div>
                <h3>{step.title}</h3>
                <p>{step.copy}</p>
                <div className={styles.processLine} />
              </article>
            );
          })}
        </div>
      </section>

      <section className={`${styles.section} ${styles.planSection}`}>
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.kicker}>SIMPLE PRICING</span>
            <h2>
              One Plan.
              <br />
              Everything Included.
            </h2>
          </div>
          <p>
            No crypto-specific surcharge. The Crypto Builder sits inside the
            same Xroga AI product-building plan.
          </p>
        </div>

        <div className={styles.planGrid}>
          <article className={styles.planSideCard}>
            <span>BUILD</span>
            <h3>Research + Code</h3>
            <ul>
              <li><Check /> Repository inspection</li>
              <li><Check /> Focused implementation</li>
              <li><Check /> Crypto product scaffolding</li>
              <li><Check /> Current-source research</li>
            </ul>
          </article>

          <article className={styles.planMainCard}>
            <div className={styles.planBadge}>XROGA AI</div>
            <p>ONE PRODUCT-BUILDING PLAN</p>
            <div className={styles.price}>
              <strong>$19</strong>
              <span>/ 30 days</span>
            </div>
            <Link href="/auth/signup">
              Start building <ArrowRight />
            </Link>
            <ul>
              <li><Check /> All product-building features</li>
              <li><Check /> GitHub repository workflow</li>
              <li><Check /> Vercel publishing workflow</li>
              <li><Check /> Validation and repair loop</li>
            </ul>
          </article>

          <article className={styles.planSideCard}>
            <span>SHIP</span>
            <h3>Verify + Publish</h3>
            <ul>
              <li><Check /> Applicable checks</li>
              <li><Check /> Reviewable changes</li>
              <li><Check /> GitHub evidence</li>
              <li><Check /> Vercel evidence</li>
            </ul>
          </article>
        </div>
      </section>

      <section className={`${styles.section} ${styles.faqSection}`}>
        <div className={styles.faqIntro}>
          <span className={styles.kicker}>FREQUENTLY ASKED QUESTIONS</span>
          <h2>Crypto Builder, without the vague claims.</h2>
          <p>
            What this page can help you build, how shipping works and where the
            boundaries are.
          </p>
          <Link href="/docs">
            Read the docs <ArrowRight />
          </Link>
        </div>

        <div className={styles.faqList}>
          {FAQS.map((item) => (
            <details key={item.q}>
              <summary>
                {item.q}
                <span>+</span>
              </summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className={`${styles.section} ${styles.insightsSection}`}>
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.kicker}>XROGA INSIGHTS</span>
            <h2>Research and docs for the build.</h2>
          </div>
          <Link href="/research" className={styles.textLink}>
            Browse research <ArrowRight />
          </Link>
        </div>

        <div className={styles.insightGrid}>
          <Link href="/research/web3-hackathon-winning-patterns" className={styles.insightCard}>
            <div className={styles.insightVisual}>
              <Search />
              <span>OFFICIAL SOURCES</span>
            </div>
            <p>Web3 hackathon winning patterns</p>
            <ExternalLink />
          </Link>

          <Link href="/docs/hackathon-workflows" className={styles.insightCard}>
            <div className={styles.insightVisual}>
              <Workflow />
              <span>WORKFLOW</span>
            </div>
            <p>Turn rules into a credible MVP</p>
            <ArrowRight />
          </Link>

          <Link href="/docs/github" className={styles.insightCard}>
            <div className={styles.insightVisual}>
              <GitBranch />
              <span>OWNERSHIP</span>
            </div>
            <p>Ship through your GitHub repository</p>
            <ArrowRight />
          </Link>

          <Link href="/docs/vercel" className={styles.insightCard}>
            <div className={styles.insightVisual}>
              <Rocket />
              <span>DEPLOY</span>
            </div>
            <p>Publish with real provider evidence</p>
            <ArrowRight />
          </Link>
        </div>
      </section>

      <section className={styles.finalCta}>
        <div className={styles.finalGlow} aria-hidden="true" />
        <span className={styles.finalOrb}>
          <Layers3 />
        </span>
        <h2>Build the crypto product.</h2>
        <p>Describe the outcome. Xroga works against the project and keeps the evidence visible.</p>
        <Link href="/auth/signup">
          Start building <ArrowRight />
        </Link>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerBrand}>
          <Logo href="/" variant="homepage" height={30} />
          <p>
            Repository-aware AI product building
            <br />
            with validation before shipping.
          </p>
        </div>

        <div className={styles.footerColumns}>
          <div>
            <span>Product</span>
            <Link href="/features">Features</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/crypto">Crypto</Link>
            <Link href="/showcase">Showcase</Link>
          </div>
          <div>
            <span>Learn</span>
            <Link href="/docs">Docs</Link>
            <Link href="/research">Research</Link>
            <Link href="/community">Community</Link>
            <Link href="/about">About</Link>
          </div>
          <div>
            <span>Legal</span>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/refund">Refund</Link>
            <Link href="/contact">Contact</Link>
          </div>
        </div>

        <div className={styles.footerBase}>
          <span>© {new Date().getFullYear()} XROGA AI</span>
          <span>Build with evidence. Ship with ownership.</span>
        </div>
      </footer>
    </main>
  );
}
