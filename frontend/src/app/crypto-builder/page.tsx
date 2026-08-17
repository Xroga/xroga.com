import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  Bitcoin,
  Blocks,
  Bot,
  Braces,
  ChartNoAxesCombined,
  CheckCircle2,
  ExternalLink,
  GitBranch,
  Landmark,
  Network,
  Radar,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  Trophy,
  WalletCards,
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
    'Build AI crypto agents, Web3 apps, DeFi and DAO tools, on-chain monitoring, analytics dashboards, and hackathon projects with XROGA AI.',
  path: '/crypto-builder',
  keywords: [
    'crypto builder',
    'AI crypto agent builder',
    'Web3 app builder',
    'DeFi dashboard builder',
    'DAO tooling',
    'on-chain monitoring agent',
    'crypto hackathon project',
  ],
});

const BUILD_ICONS = [
  Bot,
  Braces,
  ChartNoAxesCombined,
  Landmark,
  WalletCards,
  Radar,
  ChartNoAxesCombined,
  Trophy,
];

const STAGE_ICONS = [
  Search,
  Braces,
  ShieldCheck,
  Rocket,
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
      'Build AI crypto agents, Web3 applications, DeFi and DAO tools, on-chain monitoring, analytics products, and hackathon projects with XROGA AI.',
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

      <div
        className="xcb-background-rings"
        aria-hidden="true"
      >
        <span />
        <span />
        <span />
      </div>

      <div className="xcb-frame">
        {/* =====================================================
            HEADER
        ===================================================== */}

        <header className="xcb-header">
          <div className="xcb-brand">
            <Logo
              href="/"
              variant="homepage"
              height={32}
            />

            <span className="xcb-product-name">
              Crypto Builder
            </span>
          </div>

          <nav
            className="xcb-nav"
            aria-label="Crypto Builder navigation"
          >
            <a href="#builder">
              Builder
            </a>

            <a href="#capabilities">
              Capabilities
            </a>

            <a href="#workflow">
              Workflow
            </a>

            <a href="#research">
              Research
            </a>
          </nav>

          <div className="xcb-header-actions">
            <a
              href="#research"
              className="xcb-icon-button"
              aria-label="Explore research"
            >
              <Search />
            </a>

            <span
              className="xcb-status-dot"
              title="Crypto Builder"
            />

            <Link
              href="/auth/signup"
              className="xcb-button xcb-button--primary xcb-header-button"
            >
              Start building
            </Link>
          </div>
        </header>

        {/* =====================================================
            HERO
        ===================================================== */}

        <section
          className="xcb-hero"
          id="builder"
        >
          <div className="xcb-hero-copy">
            <p className="xcb-eyebrow">
              <Sparkles />
              BUILD CRYPTO
            </p>

            <h1>
              One place to build
              <br />

              <strong>
                crypto products
              </strong>

              <br />

              from brief to
              <br />

              <strong>
                verified code.
              </strong>
            </h1>

            <p className="xcb-hero-description">
              Research the ecosystem, build the product,
              validate what can be validated, and deliver
              through accounts you authorise.
            </p>

            <div className="xcb-hero-actions">
              <Link
                href="/auth/signup"
                className="xcb-button xcb-button--light"
              >
                Start building
                <ArrowRight />
              </Link>

              <a
                href="#prompt"
                className="xcb-round-action"
                aria-label="Open builder prompt"
              >
                <ArrowRight />
              </a>
            </div>

            <div className="xcb-supported">
              <span>Built for</span>

              <div>
                <i>
                  <Bitcoin />
                </i>

                <i>
                  <Blocks />
                </i>

                <i>
                  <Network />
                </i>

                <i>
                  <Bot />
                </i>
              </div>
            </div>
          </div>

          {/* ===================================================
              CENTER 3D VISUAL
          =================================================== */}

          <div
            className="xcb-visual"
            aria-hidden="true"
          >
            <div className="xcb-visual-beam" />

            <div className="xcb-floating-gem">
              <div className="xcb-gem-face">
                <Bitcoin />
              </div>
            </div>

            <span className="xcb-particle xcb-particle--one" />
            <span className="xcb-particle xcb-particle--two" />
            <span className="xcb-particle xcb-particle--three" />
            <span className="xcb-particle xcb-particle--four" />

            <div className="xcb-cube-shadow" />

            <div className="xcb-cube">
              <div className="xcb-cube-face xcb-cube-front">
                <Blocks />
              </div>

              <div className="xcb-cube-face xcb-cube-right" />

              <div className="xcb-cube-face xcb-cube-top" />
            </div>

            <div className="xcb-pedestal">
              <span />
              <i />
            </div>

            <div className="xcb-visual-label">
              <span>
                BLACK HOLE V∞
              </span>

              <b>
                Crypto build intelligence
              </b>
            </div>
          </div>

          {/* ===================================================
              RIGHT FACTS
          =================================================== */}

          <aside className="xcb-hero-facts">
            <article>
              <strong>
                01
              </strong>

              <p>
                <b>
                  Sticky repository
                </b>

                One codebase stays in focus through the
                build.
              </p>
            </article>

            <article>
              <strong>
                04
              </strong>

              <p>
                <b>
                  Controlled stages
                </b>

                Research, build, verify, and deliver.
              </p>
            </article>

            <article>
              <strong>
                GitHub
              </strong>

              <p>
                <b>
                  Code you own
                </b>

                Delivery remains tied to your repository.
              </p>
            </article>

            <article>
              <strong>
                Evidence
              </strong>

              <p>
                <b>
                  Validate before claims
                </b>

                Xroga reports evidence, failures, or setup
                still required.
              </p>
            </article>
          </aside>
        </section>

        {/* =====================================================
            PROMPT
        ===================================================== */}

        <section
          className="xcb-prompt-section"
          id="prompt"
        >
          <div className="xcb-section-label">
            <span>
              YOUR BRIEF
            </span>

            <p>
              Describe the product. Xroga carries the build
              loop forward.
            </p>
          </div>

          <div className="xcb-prompt-wrap">
            <HomepageChatBar
              placeholders={PLACEHOLDERS}
              suggestions={PROMPT_SUGGESTIONS}
              ariaLabel="Describe the crypto product or AI agent you want to build"
              fallbackPrompt="Build a crypto product with Xroga AI"
              className="xcb-prompt-bar"
            />
          </div>

          <p className="xcb-disclaimer">
            Xroga does not guarantee prizes, funding,
            listings, trading performance, token value, or
            security outcomes. It reports evidence, a real
            failure, or the exact external setup still
            required.
          </p>
        </section>

        {/* =====================================================
            CAPABILITIES
        ===================================================== */}

        <section
          className="xcb-section"
          id="capabilities"
        >
          <header className="xcb-section-header">
            <div>
              <p>
                CAPABILITIES / 01
              </p>

              <h2>
                Build across the
                <br />

                <strong>
                  crypto stack.
                </strong>
              </h2>
            </div>

            <span>
              From focused automation to complete Web3
              products, every build remains attached to a
              real project and repository.
            </span>
          </header>

          <div className="xcb-capability-grid">
            {BUILD_KINDS.map((item, index) => {
              const Icon =
                BUILD_ICONS[index] ?? Bot;

              return (
                <article
                  className="xcb-capability"
                  key={item.title}
                >
                  <header>
                    <span>
                      {String(index + 1).padStart(2, '0')}
                    </span>

                    <Icon />
                  </header>

                  <div className="xcb-capability-orbit">
                    <i />
                    <span />
                  </div>

                  <footer>
                    <small>
                      {item.tag}
                    </small>

                    <h3>
                      {item.title}
                    </h3>

                    <p>
                      {item.body}
                    </p>
                  </footer>
                </article>
              );
            })}
          </div>
        </section>

        {/* =====================================================
            WORKFLOW
        ===================================================== */}

        <section
          className="xcb-section xcb-workflow-section"
          id="workflow"
        >
          <header className="xcb-section-header">
            <div>
              <p>
                CONTROLLED LOOP / 02
              </p>

              <h2>
                From protocol brief
                <br />

                <strong>
                  to verified code.
                </strong>
              </h2>
            </div>

            <span>
              The builder separates research, implementation,
              validation, and delivery so progress remains
              inspectable.
            </span>
          </header>

          <div className="xcb-workflow-layout">
            <ol className="xcb-workflow-list">
              {STAGES.map((stage, index) => {
                const Icon =
                  STAGE_ICONS[index] ?? Search;

                return (
                  <li key={stage.title}>
                    <div className="xcb-workflow-number">
                      {String(index + 1).padStart(2, '0')}
                    </div>

                    <span className="xcb-workflow-icon">
                      <Icon />
                    </span>

                    <div>
                      <h3>
                        {stage.title}
                      </h3>

                      <p>
                        {stage.body}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>

            <div className="xcb-build-console">
              <header>
                <span>
                  <i />
                  BUILD SESSION
                </span>

                <b>
                  XROGA CRYPTO
                </b>
              </header>

              <div className="xcb-console-body">
                <div className="xcb-console-orbit">
                  <span className="xcb-console-ring xcb-console-ring--one" />
                  <span className="xcb-console-ring xcb-console-ring--two" />

                  <div>
                    <Bitcoin />
                  </div>

                  <i className="xcb-console-node xcb-console-node--one">
                    <Braces />
                  </i>

                  <i className="xcb-console-node xcb-console-node--two">
                    <GitBranch />
                  </i>

                  <i className="xcb-console-node xcb-console-node--three">
                    <ShieldCheck />
                  </i>
                </div>

                <section className="xcb-session-card">
                  <small>
                    CURRENT BUILD / PREVIEW
                  </small>

                  <h3>
                    On-chain intelligence dashboard
                  </h3>

                  <div className="xcb-session-progress">
                    <i />
                  </div>

                  <ul>
                    <li>
                      <CheckCircle2 />
                      Repository understood
                    </li>

                    <li>
                      <CheckCircle2 />
                      Contract reads connected
                    </li>

                    <li>
                      <span className="xcb-live-dot" />
                      Validation in progress
                    </li>
                  </ul>
                </section>
              </div>
            </div>
          </div>

          <div className="xcb-proof-row">
            <span>
              <GitBranch />

              <b>
                Your GitHub
              </b>

              sticky repository
            </span>

            <i />

            <span>
              <ShieldCheck />

              <b>
                Validation
              </b>

              checks before claims
            </span>

            <i />

            <span>
              <Rocket />

              <b>
                Publish
              </b>

              authorised accounts only
            </span>
          </div>
        </section>

        {/* =====================================================
            RESEARCH
        ===================================================== */}

        <section
          className="xcb-section"
          id="research"
        >
          <header className="xcb-section-header">
            <div>
              <p>
                OFFICIAL SOURCES / 03
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

          <div className="xcb-source-grid">
            {HACKATHON_SOURCES.map(
              (source, index) => (
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  key={source.name}
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

                  <div className="xcb-source-symbol">
                    <span />
                    <i />
                  </div>

                  <footer>
                    <h3>
                      {source.name}
                    </h3>

                    <p>
                      {source.note}
                    </p>

                    <span>
                      Official source
                      <ArrowRight />
                    </span>
                  </footer>
                </a>
              ),
            )}
          </div>

          <p className="xcb-disclaimer">
            Prize pools, tracks, grants, bounties,
            eligibility, and claim processes are set by
            each organiser and change between events.
            Verify current rules directly with the
            organiser before you build.
          </p>
        </section>

        {/* =====================================================
            WINNING PATTERNS
        ===================================================== */}

        <section className="xcb-section xcb-pattern-section">
          <header className="xcb-section-header">
            <div>
              <p>
                JUDGING SIGNALS / 04
              </p>

              <h2>
                Make the important
                <br />

                <strong>
                  evidence visible.
                </strong>
              </h2>
            </div>

            <span>
              Strong technical submissions make working
              behaviour and proof easy to inspect.
            </span>
          </header>

          <div className="xcb-pattern-grid">
            {WINNING_PATTERNS.map(
              (pattern, index) => (
                <article key={pattern.name}>
                  <span>
                    {String(index + 1).padStart(
                      2,
                      '0',
                    )}
                  </span>

                  <div>
                    <h3>
                      {pattern.name}
                    </h3>

                    <p>
                      {pattern.evidence}
                    </p>
                  </div>

                  <ArrowRight />
                </article>
              ),
            )}
          </div>
        </section>

        {/* =====================================================
            CTA
        ===================================================== */}

        <section className="xcb-final">
          <div>
            <p>
              YOUR CODE. YOUR PRODUCT.
            </p>

            <h2>
              Bring the idea.
              <br />

              <strong>
                Leave with evidence.
              </strong>
            </h2>
          </div>

          <Link
            href="/auth/signup"
            className="xcb-button xcb-button--light"
          >
            Open Xroga
            <ArrowRight />
          </Link>
        </section>
      </div>
    </main>
  );
}
