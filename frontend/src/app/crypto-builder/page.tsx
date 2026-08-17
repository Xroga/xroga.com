import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  Bitcoin,
  Blocks,
  Bot,
  Braces,
  CheckCircle2,
  Code2,
  ExternalLink,
  GitBranch,
  Globe2,
  Layers3,
  Moon,
  Network,
  Radar,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  Workflow,
} from 'lucide-react';

import { Logo } from '@/components/layout/Logo';
import { HomepageChatBar } from '@/components/terminal/HomepageChatBar';

import {
  BUILD_KINDS,
  PLACEHOLDERS,
  PROMPT_SUGGESTIONS,
  STAGES,
} from '@/lib/cryptoBuilderContent';

import {
  HACKATHON_SOURCES,
  WINNING_PATTERNS,
} from '@/lib/hackathonResearch';

import { buildMetadata } from '@/lib/seo';

import '@/styles/homepage-coding.css';
import '@/styles/crypto-builder.css';

export const metadata: Metadata = buildMetadata({
  title: 'Crypto Builder for Web3 Apps and AI Agents',
  description:
    'Build AI crypto agents, Web3 apps, DeFi tools, DAO products, on-chain analytics, monitoring systems and hackathon projects with XROGA AI.',
  path: '/crypto-builder',
  keywords: [
    'crypto builder',
    'AI crypto agent builder',
    'Web3 builder',
    'DeFi app builder',
    'smart contract builder',
    'on-chain analytics',
    'crypto hackathon builder',
    'AI Web3 development',
  ],
});

const BUILD_ICONS = [
  Bot,
  Braces,
  BarChart3,
  Blocks,
  Network,
  Radar,
  Code2,
  Rocket,
];

const STAGE_ICONS = [
  Search,
  Code2,
  ShieldCheck,
  Rocket,
];

const SOURCE_LOGOS: Record<
  (typeof HACKATHON_SOURCES)[number]['name'],
  string
> = {
  'OKX Web3': 'https://web3.okx.com/favicon.ico',
  ETHGlobal: 'https://ethglobal.com/favicon.ico',
  Solana: 'https://solana.com/favicon.ico',
  Chainlink: 'https://chain.link/favicon.ico',
  Polygon: 'https://polygon.technology/favicon.ico',
  Avalanche: 'https://build.avax.network/favicon.ico',
  'BNB Chain': 'https://www.bnbchain.org/favicon.ico',
  Aptos: 'https://aptos.dev/favicon.ico',
  Sui: 'https://docs.sui.io/favicon.ico',
  Devpost: 'https://devpost.com/favicon.ico',
  DoraHacks: 'https://dorahacks.io/favicon.ico',
  Mantle: 'https://www.mantle.xyz/favicon.ico',
};

const FEATURE_CARDS = [
  {
    icon: Bot,
    title: 'AI Crypto Agents',
    copy:
      'Build agents for research, monitoring, analysis, automation and crypto workflows.',
  },
  {
    icon: Blocks,
    title: 'DeFi Applications',
    copy:
      'Build dashboards, protocol interfaces, staking tools and on-chain products.',
  },
  {
    icon: Network,
    title: 'Web3 Platforms',
    copy:
      'Create blockchain-connected products with real application architecture.',
  },
  {
    icon: Radar,
    title: 'On-chain Monitoring',
    copy:
      'Track addresses, contracts, events, protocol state and important activity.',
  },
  {
    icon: Workflow,
    title: 'DAO Tools',
    copy:
      'Build governance, voting, treasury and community coordination products.',
  },
  {
    icon: BarChart3,
    title: 'Analytics Dashboards',
    copy:
      'Turn blockchain and market information into clear product intelligence.',
  },
  {
    icon: Code2,
    title: 'Smart Contract Apps',
    copy:
      'Build interfaces and systems that interact with contracts you control.',
  },
  {
    icon: Rocket,
    title: 'Hackathon Projects',
    copy:
      'Move from official rules to a working, inspectable technical submission.',
  },
];

export default function CryptoBuilderPage() {
  const softwareLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Xroga Crypto Builder',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Web',
    url: 'https://xroga.com/crypto-builder',
    description:
      'Build AI crypto agents, Web3 applications, DeFi products, on-chain analytics and hackathon projects with Xroga AI.',
  };

  return (
    <main className="xcb-root">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(softwareLd).replace(
            /</g,
            '\\u003c',
          ),
        }}
      />

      {/* ======================================================
          CSS-ONLY DAY / NIGHT TOGGLE

          Keeping this page as a Server Component means your
          existing metadata architecture stays intact.
      ====================================================== */}

      <input
        type="checkbox"
        id="xcb-theme-toggle"
        className="xcb-theme-checkbox"
        aria-label="Toggle light and dark appearance"
      />

      <div
        className="xcb-site-background"
        aria-hidden="true"
      />

      <div
        className="xcb-ambient xcb-ambient--one"
        aria-hidden="true"
      />

      <div
        className="xcb-ambient xcb-ambient--two"
        aria-hidden="true"
      />

      <div className="xcb-page-shell">
        {/* ====================================================
            FLOATING NAVIGATION
        ==================================================== */}

        <header className="xcb-navbar">
          <Link
            href="/"
            className="xcb-navbar-brand"
            aria-label="Xroga home"
          >
            <Logo
              href={null}
              variant="homepage"
              height={40}
            />

            <span>
              Crypto Builder
            </span>
          </Link>

          <nav
            className="xcb-navbar-links"
            aria-label="Crypto Builder"
          >
            <a href="#builder">
              Builder
            </a>

            <a href="#capabilities">
              Capabilities
            </a>

            <a href="#workflow">
              How it works
            </a>

            <a href="#research">
              Research
            </a>

            <Link href="/community">
              Community
            </Link>

            <Link href="/docs">
              Docs
            </Link>
          </nav>

          <div className="xcb-navbar-actions">
            <a
              className="xcb-nav-search"
              href="#research"
              aria-label="Research sources"
            >
              <Search />
            </a>

            <label
              htmlFor="xcb-theme-toggle"
              className="xcb-theme-switch"
              aria-label="Toggle day and night mode"
            >
              <span className="xcb-theme-sun">
                <Sun />
              </span>

              <i />

              <span className="xcb-theme-moon">
                <Moon />
              </span>
            </label>

            <Link
              href="/auth/login"
              className="xcb-signin"
            >
              Sign in
            </Link>

            <Link
              href="/auth/signup"
              className="xcb-gradient-button"
            >
              Get started
            </Link>
          </div>
        </header>

        {/* ====================================================
            HERO
        ==================================================== */}

        <section
          className="xcb-hero"
          id="builder"
        >
          <div className="xcb-hero-copy">
            <div className="xcb-hero-tags">
              <span>
                <Sparkles />
                AI POWER
              </span>

              <span>
                <Network />
                WEB3 READY
              </span>

              <span>
                <Rocket />
                BUILD & DEPLOY
              </span>
            </div>

            <h1>
              Build the next
              <br />

              generation of
              <br />

              <strong>
                Crypto Products
              </strong>
            </h1>

            <p>
              Turn ideas into real Web3 products. Build AI
              crypto agents, DeFi apps, analytics products,
              monitoring systems and more with Xroga AI.
            </p>

            <div className="xcb-hero-loop">
              <span>
                Research
              </span>

              <i />

              <span>
                Build
              </span>

              <i />

              <span>
                Verify
              </span>

              <i />

              <span>
                Deploy
              </span>
            </div>

            <div className="xcb-hero-actions">
              <a
                href="#prompt"
                className="xcb-gradient-button xcb-gradient-button--large"
              >
                Start building
                <ArrowRight />
              </a>

              <a
                href="#workflow"
                className="xcb-secondary-button"
              >
                <span className="xcb-play-button">
                  <ArrowRight />
                </span>

                See how it works
              </a>
            </div>

            <div className="xcb-hero-proof">
              <div>
                <ShieldCheck />
              </div>

              <span>
                <b>
                  Evidence before claims
                </b>

                Xroga reports what was verified, what
                failed and what still requires external
                setup.
              </span>
            </div>
          </div>

          {/* ==================================================
              AI-GENERATED HERO VISUAL
          ================================================== */}

          <div className="xcb-hero-art">
            <div
              className="xcb-generated-image"
              aria-hidden="true"
            />

            <div
              className="xcb-art-glow"
              aria-hidden="true"
            />

            <div className="xcb-floating-token xcb-token--btc">
              <Bitcoin />
            </div>

            <div className="xcb-floating-token xcb-token--code">
              <Braces />
            </div>

            <div className="xcb-floating-token xcb-token--network">
              <Network />
            </div>

            <div className="xcb-hero-core">
              <div className="xcb-core-orbit xcb-core-orbit--outer" />

              <div className="xcb-core-orbit xcb-core-orbit--inner" />

              <div className="xcb-core-cube">
                <span>
                  <Logo
                    href={null}
                    variant="homepage"
                    height={54}
                  />
                </span>
              </div>
            </div>

            <div className="xcb-art-caption">
              <Sparkles />

              <span>
                <small>
                  BLACK HOLE V∞
                </small>

                <b>
                  Crypto build intelligence
                </b>
              </span>
            </div>
          </div>

          {/* ==================================================
              HERO FACT PANEL — NO FAKE METRICS
          ================================================== */}

          <aside className="xcb-hero-rail">
            <article>
              <span className="xcb-rail-icon">
                <Search />
              </span>

              <div>
                <strong>
                  Research
                </strong>

                <p>
                  Start from current official ecosystem
                  information.
                </p>
              </div>
            </article>

            <article>
              <span className="xcb-rail-icon">
                <Code2 />
              </span>

              <div>
                <strong>
                  Build
                </strong>

                <p>
                  Work against one focused project and
                  repository.
                </p>
              </div>
            </article>

            <article>
              <span className="xcb-rail-icon">
                <ShieldCheck />
              </span>

              <div>
                <strong>
                  Verify
                </strong>

                <p>
                  Check what can actually be validated
                  before presenting it as working.
                </p>
              </div>
            </article>

            <article>
              <span className="xcb-rail-icon">
                <Rocket />
              </span>

              <div>
                <strong>
                  Deploy
                </strong>

                <p>
                  Deliver through accounts and services
                  you authorise.
                </p>
              </div>
            </article>
          </aside>
        </section>

        {/* ====================================================
            PROMPT BUILDER
        ==================================================== */}

        <section
          className="xcb-builder"
          id="prompt"
        >
          <div className="xcb-builder-decoration xcb-builder-decoration--left">
            <span />
            <i />
          </div>

          <div className="xcb-builder-decoration xcb-builder-decoration--right">
            <span />
            <i />
          </div>

          <div className="xcb-builder-heading">
            <Sparkles />

            <span>
              <h2>
                Describe what you want to build
              </h2>

              <p>
                Just describe the idea in plain English.
                Xroga carries the build workflow forward.
              </p>
            </span>
          </div>

          <div className="xcb-chat-wrapper">
            <HomepageChatBar
              placeholders={PLACEHOLDERS}
              suggestions={PROMPT_SUGGESTIONS}
              ariaLabel="Describe the crypto product or AI agent you want to build"
              fallbackPrompt="Build a crypto product with Xroga AI"
              className="xcb-prompt-bar"
            />
          </div>

          <div className="xcb-builder-chips">
            <span>
              DeFi Dashboard
            </span>

            <span>
              Trading Automation
            </span>

            <span>
              NFT Platform
            </span>

            <span>
              AI Agent
            </span>

            <span>
              DAO Tool
            </span>

            <span>
              On-chain Monitor
            </span>
          </div>
        </section>

        {/* ====================================================
            CAPABILITIES
        ==================================================== */}

        <section
          className="xcb-section"
          id="capabilities"
        >
          <header className="xcb-section-header xcb-section-header--center">
            <p>
              WHAT YOU CAN BUILD
            </p>

            <h2>
              Endless possibilities,
              <br />

              <strong>
                one crypto workspace.
              </strong>
            </h2>

            <span>
              From focused automation to complete Web3
              applications, Xroga keeps the work attached
              to a real product.
            </span>
          </header>

          <div className="xcb-capability-grid">
            {FEATURE_CARDS.map((item) => {
              const Icon = item.icon;

              return (
                <article
                  className="xcb-capability-card"
                  key={item.title}
                >
                  <div className="xcb-capability-icon">
                    <Icon />
                  </div>

                  <span>
                    <h3>
                      {item.title}
                    </h3>

                    <p>
                      {item.copy}
                    </p>
                  </span>
                </article>
              );
            })}
          </div>
        </section>

        {/* ====================================================
            FOUR-STEP WORKFLOW
        ==================================================== */}

        <section
          className="xcb-section"
          id="workflow"
        >
          <header className="xcb-section-header xcb-section-header--center">
            <p>
              HOW IT WORKS
            </p>

            <h2>
              From idea to
              <br />

              <strong>
                working evidence.
              </strong>
            </h2>

            <span>
              Separate research, implementation,
              validation and delivery so every important
              step stays inspectable.
            </span>
          </header>

          <div className="xcb-workflow-grid">
            {STAGES.map((stage, index) => {
              const Icon =
                STAGE_ICONS[index] ?? Search;

              return (
                <article key={stage.title}>
                  <header>
                    <div className="xcb-workflow-icon">
                      <Icon />
                    </div>

                    <small>
                      0{index + 1}
                    </small>
                  </header>

                  <h3>
                    {stage.title}
                  </h3>

                  <p>
                    {stage.body}
                  </p>

                  {index < STAGES.length - 1 ? (
                    <div
                      className="xcb-workflow-connector"
                      aria-hidden="true"
                    >
                      <i />
                      <span />
                      <i />
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>

        {/* ====================================================
            BUILD SESSION / BLACK HOLE
        ==================================================== */}

        <section className="xcb-build-session">
          <div className="xcb-session-visual">
            <span className="xcb-session-ring xcb-session-ring--one" />
            <span className="xcb-session-ring xcb-session-ring--two" />
            <span className="xcb-session-ring xcb-session-ring--three" />

            <div className="xcb-session-core">
              <Sparkles />
            </div>

            <i className="xcb-session-node xcb-session-node--one">
              <GitBranch />
            </i>

            <i className="xcb-session-node xcb-session-node--two">
              <Braces />
            </i>

            <i className="xcb-session-node xcb-session-node--three">
              <ShieldCheck />
            </i>
          </div>

          <div className="xcb-session-copy">
            <p>
              BLACK HOLE V∞
            </p>

            <h2>
              One intelligence across
              <br />

              <strong>
                the entire build.
              </strong>
            </h2>

            <span>
              Understand the project, maintain context,
              coordinate research, build work and
              verification, then keep the final result
              attached to the same project.
            </span>

            <div className="xcb-session-list">
              <article>
                <CheckCircle2 />

                <span>
                  <b>
                    Understand
                  </b>

                  Goal, project and repository
                </span>
              </article>

              <article>
                <CheckCircle2 />

                <span>
                  <b>
                    Plan
                  </b>

                  Product and technical direction
                </span>
              </article>

              <article>
                <CheckCircle2 />

                <span>
                  <b>
                    Connect
                  </b>

                  Context across the build
                </span>
              </article>

              <article>
                <CheckCircle2 />

                <span>
                  <b>
                    Verify
                  </b>

                  Evidence before claims
                </span>
              </article>
            </div>
          </div>
        </section>

        {/* ====================================================
            OFFICIAL ECOSYSTEM STRIP
        ==================================================== */}

        <section className="xcb-ecosystem">
          <header>
            <p>
              OFFICIAL SOURCES WE REFERENCE
            </p>

            <span>
              Not partnerships or endorsements.
            </span>
          </header>

          <div>
            {HACKATHON_SOURCES.slice(0, 10).map(
              (source) => (
                <a
                  key={source.name}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  title={source.name}
                >
                  <span
                    className="xcb-source-logo-small"
                    style={{
                      backgroundImage: `url("${SOURCE_LOGOS[source.name]}")`,
                    }}
                    aria-hidden="true"
                  />

                  <b>
                    {source.name}
                  </b>
                </a>
              ),
            )}
          </div>
        </section>

        {/* ====================================================
            OFFICIAL RESEARCH
        ==================================================== */}

        <section
          className="xcb-section xcb-research"
          id="research"
        >
          <header className="xcb-research-heading">
            <div>
              <p>
                OFFICIAL SOURCES
              </p>

              <h2>
                Research first.
                <br />

                <strong>
                  Build against reality.
                </strong>
              </h2>
            </div>

            <span>
              Xroga is not affiliated with or endorsed by
              the organisations shown unless explicitly
              stated.
            </span>
          </header>

          <div className="xcb-research-grid">
            {HACKATHON_SOURCES.map(
              (source, index) => (
                <a
                  key={source.name}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="xcb-research-card"
                >
                  <header>
                    <small>
                      {String(index + 1).padStart(
                        2,
                        '0',
                      )}
                    </small>

                    <ExternalLink />
                  </header>

                  <div className="xcb-research-brand">
                    <span
                      className="xcb-source-logo"
                      style={{
                        backgroundImage: `url("${SOURCE_LOGOS[source.name]}")`,
                      }}
                      aria-hidden="true"
                    />

                    <h3>
                      {source.name}
                    </h3>
                  </div>

                  <p>
                    {source.note}
                  </p>

                  <footer>
                    <span>
                      Official source
                    </span>

                    <ArrowRight />
                  </footer>
                </a>
              ),
            )}
          </div>

          <p className="xcb-research-disclaimer">
            Prize pools, tracks, grants, bounties,
            eligibility, and claim processes are set by
            each organiser and change between events.
            Verify current rules directly with the
            organiser before you build.
          </p>
        </section>

        {/* ====================================================
            JUDGING SIGNALS
        ==================================================== */}

        <section className="xcb-section">
          <header className="xcb-research-heading">
            <div>
              <p>
                BUILD EVIDENCE
              </p>

              <h2>
                Make important work
                <br />

                <strong>
                  easy to inspect.
                </strong>
              </h2>
            </div>

            <span>
              Strong submissions make working behaviour,
              integration depth and technical evidence
              visible.
            </span>
          </header>

          <div className="xcb-pattern-grid">
            {WINNING_PATTERNS.map(
              (pattern, index) => (
                <article key={pattern.name}>
                  <small>
                    {String(index + 1).padStart(
                      2,
                      '0',
                    )}
                  </small>

                  <span>
                    <h3>
                      {pattern.name}
                    </h3>

                    <p>
                      {pattern.evidence}
                    </p>
                  </span>

                  <ArrowRight />
                </article>
              ),
            )}
          </div>
        </section>

        {/* ====================================================
            FINAL CTA — NO TESTIMONIALS
        ==================================================== */}

        <section className="xcb-final">
          <div
            className="xcb-final-ai-art"
            aria-hidden="true"
          />

          <div className="xcb-final-copy">
            <p>
              READY TO BUILD?
            </p>

            <h2>
              Build what belongs
              <br />

              <strong>
                to you.
              </strong>
            </h2>

            <span>
              Start with the idea. Keep the code, evidence
              and project connected through the entire
              build.
            </span>

            <div>
              <Link
                href="/auth/signup"
                className="xcb-gradient-button xcb-gradient-button--large"
              >
                Start building now
                <ArrowRight />
              </Link>

              <a
                href="#research"
                className="xcb-secondary-button"
              >
                Explore research
              </a>
            </div>
          </div>

          <aside className="xcb-final-proof">
            <article>
              <GitBranch />

              <span>
                <b>
                  Your repository
                </b>

                Sticky project context
              </span>
            </article>

            <article>
              <ShieldCheck />

              <span>
                <b>
                  Verification
                </b>

                Evidence before claims
              </span>
            </article>

            <article>
              <Globe2 />

              <span>
                <b>
                  Official research
                </b>

                Direct organiser sources
              </span>
            </article>

            <article>
              <Rocket />

              <span>
                <b>
                  Delivery
                </b>

                Accounts you authorise
              </span>
            </article>
          </aside>
        </section>

        {/* ====================================================
            FOOTER
        ==================================================== */}

        <footer className="xcb-footer">
          <Link
            href="/"
            className="xcb-footer-brand"
          >
            <Logo
              href={null}
              variant="homepage"
              height={34}
            />

            <b>
              XROGA
            </b>
          </Link>

          <span>
            © 2026 XROGA AI
          </span>

          <nav>
            <Link href="/privacy">
              Privacy
            </Link>

            <Link href="/terms">
              Terms
            </Link>

            <Link href="/docs">
              Docs
            </Link>

            <Link href="/community">
              Community
            </Link>

            <Link href="/contact">
              Contact
            </Link>
          </nav>
        </footer>
      </div>
    </main>
  );
}
