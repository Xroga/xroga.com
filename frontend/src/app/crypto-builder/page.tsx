import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  Bot,
  Braces,
  GitBranch,
  Landmark,
  LineChart,
  Network,
  Radar,
  Rocket,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { Logo } from '@/components/layout/Logo';
import { HomepageChatBar } from '@/components/terminal/HomepageChatBar';
import { HACKATHON_SOURCES, WINNING_PATTERNS } from '@/lib/hackathonResearch';
import { buildMetadata } from '@/lib/seo';
import '@/styles/homepage-coding.css';
import '@/styles/crypto-builder.css';

export const metadata: Metadata = buildMetadata({
  title: 'Crypto Builder — Build Crypto Agents, Web3 Apps, and Hackathon Projects',
  description:
    'Build AI crypto agents, Web3 applications, DeFi and DAO tools, token utilities, on-chain monitoring, analytics dashboards, and hackathon projects. Xroga researches, implements, validates, and prepares publishing through accounts you authorise.',
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

/** What the page says you can build. Deliberately broader than hackathons. */
const BUILD_KINDS = [
  { icon: Bot, title: 'AI crypto agents', body: 'Market research, on-chain summarisation, and automation agents that work from sources you approve.' },
  { icon: Braces, title: 'Web3 applications', body: 'Wallet-connected front ends, contract read and write flows, and the APIs behind them.' },
  { icon: LineChart, title: 'DeFi tools and dashboards', body: 'Position views, yield comparisons, and analytics over documented public data sources.' },
  { icon: Landmark, title: 'DAO and governance tooling', body: 'Proposal tracking, voting summaries, treasury views, and contributor workflows.' },
  { icon: Wallet, title: 'Token and wallet utilities', body: 'Token utility planners, allowance and approval views, and wallet-facing interfaces.' },
  { icon: Radar, title: 'On-chain monitoring', body: 'Address and contract watchers, alerting surfaces, and event pipelines.' },
  { icon: BarChart3, title: 'Crypto analytics products', body: 'Reporting surfaces over indexed data, with the data source stated in the interface.' },
  { icon: Network, title: 'Hackathon projects', body: 'A bounded, demonstrable MVP prepared against the official rules of a public event.' },
] as const;

const STAGES = [
  { icon: BookOpenCheck, title: 'Research the brief', body: 'Read the official docs, event rules, or protocol references you point Xroga at, and turn them into a bounded plan.' },
  { icon: Braces, title: 'Implement in your repository', body: 'Inspect the existing project, apply focused changes, and leave unrelated working code intact.' },
  { icon: ShieldCheck, title: 'Validate before claiming', body: 'Run the applicable checks. Work is reported complete only after its required validation actually passes.' },
  { icon: GitBranch, title: 'Push and publish', body: 'Commit to a repository you own and publish through providers you authorise — with evidence, or the exact blocker.' },
] as const;

const PROMPT_SUGGESTIONS = [
  'Build an AI agent for crypto market research',
  'Create a Web3 hackathon project',
  'Build a DeFi analytics dashboard',
  'Create a DAO governance assistant',
  'Build a token utility planner',
  'Create a blockchain monitoring agent',
] as const;

const PLACEHOLDERS = [
  'Describe the crypto product or AI agent you want to build…',
  'Build an AI agent that summarises on-chain activity…',
  'Create a DeFi dashboard with position tracking…',
  'Build a DAO proposal and voting assistant…',
  'Create an on-chain monitoring agent with alerts…',
  'Build a Web3 hackathon MVP against the official rules…',
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
      'Build AI crypto agents, Web3 applications, DeFi and DAO tools, on-chain monitoring, analytics products, and hackathon projects with Xroga AI.',
  };

  return (
    <main className="xv-cb-root">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareLd).replace(/</g, '\\u003c') }}
      />

      <header className="xv-cb-header">
        <div className="xv-cb-shell xv-cb-header-inner">
          <Logo href="/" height={38} />
          <nav className="xv-cb-nav" aria-label="Crypto Builder">
            <Link href="/research/web3-hackathon-winning-patterns">Research</Link>
            <Link href="/docs/hackathon-workflows">Guide</Link>
            <Link href="/showcase">Showcase</Link>
            <Link href="/auth/signup" className="xv-cb-btn xv-cb-btn--primary xv-cb-btn--sm">
              Start building
            </Link>
          </nav>
        </div>
      </header>

      {/* ------------------------------------------------------------- hero */}
      <section className="xv-cb-hero">
        <div className="xv-cb-hero-glow" aria-hidden />
        <div className="xv-cb-grid-pattern" aria-hidden />

        <div className="xv-cb-shell xv-cb-hero-inner">
          <p className="xv-cb-kicker">
            <span className="xv-cb-kicker-dot" aria-hidden />
            XROGA CRYPTO BUILDER
          </p>

          <h1 className="xv-cb-h1">
            Build crypto products that <em>actually run.</em>
          </h1>

          <p className="xv-cb-lede">
            Describe the crypto product, agent, application, or hackathon project you want to build, and Xroga will
            continue the task inside the real workspace — inspecting your repository, implementing focused changes, running
            applicable checks, and publishing through accounts you authorise.
          </p>

          <div className="xv-cb-chat">
            <HomepageChatBar
              placeholders={PLACEHOLDERS}
              suggestions={PROMPT_SUGGESTIONS}
              ariaLabel="Describe the crypto product or AI agent you want to build"
              fallbackPrompt="Build a crypto product with Xroga AI"
            />
          </div>

          <p className="xv-cb-hero-note">
            Xroga does not guarantee prizes, funding, listings, trading performance, token value, or security outcomes. It
            reports evidence, a real failure, or the exact external setup still required.
          </p>
        </div>
      </section>

      {/* -------------------------------------------------- what you can build */}
      <section className="xv-cb-section" aria-labelledby="cb-build-heading">
        <div className="xv-cb-shell">
          <p className="xv-cb-eyebrow">Not only hackathons</p>
          <h2 id="cb-build-heading" className="xv-cb-h2">
            What you can build here
          </h2>
          <p className="xv-cb-section-copy">
            Crypto hackathons remain a first-class use case. They are one of several.
          </p>

          <div className="xv-cb-cards">
            {BUILD_KINDS.map(({ icon: Icon, title, body }) => (
              <article key={title} className="xv-cb-card">
                <span className="xv-cb-card-icon">
                  <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                </span>
                <h3 className="xv-cb-card-title">{title}</h3>
                <p className="xv-cb-card-body">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- the loop */}
      <section className="xv-cb-section xv-cb-section--tint" aria-labelledby="cb-loop-heading">
        <div className="xv-cb-shell">
          <p className="xv-cb-eyebrow">A controlled build loop</p>
          <h2 id="cb-loop-heading" className="xv-cb-h2">
            Research → repository → verified result
          </h2>

          <ol className="xv-cb-stages">
            {STAGES.map(({ icon: Icon, title, body }, index) => (
              <li key={title} className="xv-cb-stage">
                <div className="xv-cb-stage-top">
                  <span className="xv-cb-card-icon">
                    <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                  </span>
                  <span className="xv-cb-stage-num">0{index + 1}</span>
                </div>
                <h3 className="xv-cb-card-title">{title}</h3>
                <p className="xv-cb-card-body">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------------- ecosystems */}
      <section className="xv-cb-section" aria-labelledby="cb-eco-heading">
        <div className="xv-cb-shell">
          <p className="xv-cb-eyebrow">Official ecosystem map</p>
          <h2 id="cb-eco-heading" className="xv-cb-h2">
            Public hackathon ecosystems and organisers
          </h2>

          <div className="xv-cb-disclaimer" role="note">
            <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
            <p>
              Xroga is not affiliated with or endorsed by the organizations shown unless explicitly stated. Their names
              and resources are displayed for informational purposes so builders can prepare projects for public crypto
              hackathons.
            </p>
          </div>

          <ul className="xv-cb-eco-list">
            {HACKATHON_SOURCES.map((source) => (
              <li key={source.name}>
                <a href={source.url} target="_blank" rel="noreferrer noopener" className="xv-cb-eco-card">
                  <span className="xv-cb-eco-role">{source.role}</span>
                  <span className="xv-cb-eco-name">{source.name}</span>
                  <span className="xv-cb-eco-note">{source.note}</span>
                  {/* No prize figure is shown: this repository holds no verified current
                      amount, and inventing one would be worse than sending a builder to
                      the organiser's own page. */}
                  <span className="xv-cb-eco-cta">
                    Check official event details
                    <ArrowRight className="h-3 w-3" aria-hidden="true" />
                  </span>
                </a>
              </li>
            ))}
          </ul>

          <p className="xv-cb-fineprint">
            Prize pools, tracks, grants, bounties, eligibility, and claim processes are set by each organiser and change
            between events. Verify the current rules and eligibility directly with the organiser before you build. Xroga
            does not control, administer, or guarantee any reward, and cannot guarantee eligibility or that funds can be
            claimed or withdrawn.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------- patterns */}
      <section className="xv-cb-section xv-cb-section--tint" aria-labelledby="cb-patterns-heading">
        <div className="xv-cb-shell">
          <p className="xv-cb-eyebrow">Repeated in official criteria</p>
          <h2 id="cb-patterns-heading" className="xv-cb-h2">
            What judging pages keep asking for
          </h2>
          <p className="xv-cb-section-copy">
            These practices improve eligibility and clarity. They do not guarantee winning, and event-specific rules
            always take precedence.
          </p>

          <div className="xv-cb-pattern-list">
            {WINNING_PATTERNS.map((pattern) => (
              <article key={pattern.name} className="xv-cb-card">
                <h3 className="xv-cb-card-title">{pattern.name}</h3>
                <p className="xv-cb-card-body">{pattern.evidence}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- cta */}
      <section className="xv-cb-section" aria-labelledby="cb-cta-heading">
        <div className="xv-cb-shell">
          <div className="xv-cb-cta">
            <div>
              <h2 id="cb-cta-heading" className="xv-cb-h2">
                Bring the brief and one honest outcome.
              </h2>
              <p className="xv-cb-section-copy">
                A protocol doc, an event page, or a plain description. Xroga researches, plans, implements, validates, and
                prepares publishing through accounts you authorise.
              </p>
            </div>
            <div className="xv-cb-cta-actions">
              <Link href="/auth/signup" className="xv-cb-btn xv-cb-btn--primary">
                Open Xroga
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link href="/showcase" className="xv-cb-btn xv-cb-btn--ghost">
                <Rocket className="h-4 w-4" aria-hidden="true" />
                See what Xroga builds
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
