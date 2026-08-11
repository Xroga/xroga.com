import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/components/layout/Logo';
import { HomepageChatBar } from '@/components/terminal/HomepageChatBar';
import { OreBlock, PixelGlyph } from '@/components/crypto-builder/PixelArt';
import { VoxelBackdrop, VoxelRidges } from '@/components/crypto-builder/VoxelBackdrop';
import {
  BUILD_KINDS,
  HERO_COINS,
  HERO_SPLASH,
  PLACEHOLDERS,
  PROMPT_SUGGESTIONS,
  STAGES,
} from '@/lib/cryptoBuilderContent';
import { HACKATHON_SOURCES, WINNING_PATTERNS } from '@/lib/hackathonResearch';
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

      <VoxelBackdrop />

      {/* ----------------------------------------------------- header: a hotbar */}
      <header className="xv-cb-header">
        <div className="xv-cb-shell xv-cb-header-inner">
          <Logo href="/" height={34} />
          <nav className="xv-cb-nav" aria-label="Crypto Builder">
            <Link href="/research/web3-hackathon-winning-patterns" className="xv-cb-slot">
              <PixelGlyph name="book" size={14} />
              <span>Research</span>
            </Link>
            <Link href="/docs/hackathon-workflows" className="xv-cb-slot">
              <PixelGlyph name="pick" size={14} />
              <span>Guide</span>
            </Link>
            <Link href="/showcase" className="xv-cb-slot">
              <PixelGlyph name="gem" size={14} />
              <span>Showcase</span>
            </Link>
            <Link href="/auth/signup" className="xv-cb-btn xv-cb-btn--primary xv-cb-btn--sm">
              Start building
            </Link>
          </nav>
        </div>
      </header>

      {/* ------------------------------------------------------------- hero */}
      <section className="xv-cb-hero">
        <div className="xv-cb-shell xv-cb-hero-inner">
          <p className="xv-cb-kicker">
            <PixelGlyph name="pick" size={12} />
            XROGA CRYPTO BUILDER
          </p>

          <div className="xv-cb-title-wrap">
            <h1 className="xv-cb-h1">
              Build crypto that <em>actually runs.</em>
            </h1>
            {/* The yellow line off the corner of the Minecraft title screen. It only
                ever claims something about how the page works. */}
            <span className="xv-cb-splash" aria-hidden="true">
              {HERO_SPLASH}
            </span>
          </div>

          <p className="xv-cb-lede">
            Describe the crypto product, agent, application, or hackathon project you want to build, and Xroga will
            continue the task inside the real workspace — inspecting your repository, implementing focused changes, running
            applicable checks, and publishing through accounts you authorise.
          </p>

          <div className="xv-cb-coins" aria-hidden="true">
            {HERO_COINS.map((coin, index) => (
              <span key={coin.glyph} className="xv-cb-coin" data-ore={coin.ore} style={{ animationDelay: `${index * -0.9}s` }}>
                <PixelGlyph name={coin.glyph} size={22} />
              </span>
            ))}
          </div>

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

        <VoxelRidges />
      </section>

      {/* ----------------------------------------- what you can build: ore blocks */}
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
            {BUILD_KINDS.map(({ title, body, ore, glyph, tag }, index) => (
              <article key={title} className="xv-cb-card" data-ore={ore}>
                <div className="xv-cb-card-top">
                  <span className="xv-cb-block">
                    <OreBlock variant={index} size={52} />
                    <span className="xv-cb-block-glyph">
                      <PixelGlyph name={glyph} size={20} />
                    </span>
                  </span>
                  <span className="xv-cb-tag">{tag}</span>
                </div>
                <h3 className="xv-cb-card-title">{title}</h3>
                <p className="xv-cb-card-body">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------------------------- the loop: a crafting bench */}
      <section className="xv-cb-section xv-cb-section--tint" aria-labelledby="cb-loop-heading">
        <div className="xv-cb-shell">
          <p className="xv-cb-eyebrow">A controlled build loop</p>
          <h2 id="cb-loop-heading" className="xv-cb-h2">
            Research → repository → verified result
          </h2>

          <ol className="xv-cb-stages">
            {STAGES.map(({ title, body, glyph, ore }, index) => (
              <li key={title} className="xv-cb-stage" data-ore={ore}>
                <div className="xv-cb-stage-top">
                  <span className="xv-cb-slotframe">
                    <PixelGlyph name={glyph} size={22} />
                  </span>
                  <span className="xv-cb-stage-num">0{index + 1}</span>
                </div>
                <h3 className="xv-cb-card-title">{title}</h3>
                <p className="xv-cb-card-body">{body}</p>
                {index < STAGES.length - 1 && (
                  <span className="xv-cb-craft-arrow" aria-hidden="true">
                    <PixelGlyph name="arrow" size={16} />
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------- ecosystems: an inventory row */}
      <section className="xv-cb-section" aria-labelledby="cb-eco-heading">
        <div className="xv-cb-shell">
          <p className="xv-cb-eyebrow">Official ecosystem map</p>
          <h2 id="cb-eco-heading" className="xv-cb-h2">
            Public hackathon ecosystems and organisers
          </h2>

          <div className="xv-cb-disclaimer" role="note">
            <PixelGlyph name="shield" size={16} />
            <p>
              Xroga is not affiliated with or endorsed by the organizations shown unless explicitly stated. Their names
              and resources are displayed for informational purposes so builders can prepare projects for public crypto
              hackathons.
            </p>
          </div>

          <ul className="xv-cb-eco-list">
            {HACKATHON_SOURCES.map((source, index) => (
              <li key={source.name}>
                <a href={source.url} target="_blank" rel="noreferrer noopener" className="xv-cb-eco-card">
                  {/* A generic pixel token, not the organiser's mark — the page must
                      not read as if these logos were licensed for it. */}
                  <span className="xv-cb-eco-slot" aria-hidden="true">
                    <PixelGlyph name={ECO_GLYPHS[index % ECO_GLYPHS.length]} size={20} />
                  </span>
                  <span className="xv-cb-eco-role">{source.role}</span>
                  <span className="xv-cb-eco-name">{source.name}</span>
                  <span className="xv-cb-eco-note">{source.note}</span>
                  {/* No prize figure is shown: this repository holds no verified current
                      amount, and inventing one would be worse than sending a builder to
                      the organiser's own page. */}
                  <span className="xv-cb-eco-cta">
                    Check official event details
                    <PixelGlyph name="arrow" size={12} />
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

      {/* ------------------------------------------- patterns: advancement plaques */}
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
            {WINNING_PATTERNS.map((pattern, index) => (
              <article key={pattern.name} className="xv-cb-advancement" data-ore={ADVANCEMENT_ORES[index % ADVANCEMENT_ORES.length]}>
                <span className="xv-cb-slotframe xv-cb-slotframe--sm">
                  <PixelGlyph name={ADVANCEMENT_GLYPHS[index % ADVANCEMENT_GLYPHS.length]} size={18} />
                </span>
                <div>
                  <h3 className="xv-cb-card-title">{pattern.name}</h3>
                  <p className="xv-cb-card-body">{pattern.evidence}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------- cta: a lit portal */}
      <section className="xv-cb-section" aria-labelledby="cb-cta-heading">
        <div className="xv-cb-shell">
          <div className="xv-cb-cta">
            <div className="xv-cb-portal" aria-hidden="true">
              <span className="xv-cb-portal-core">
                <PixelGlyph name="pick" size={30} />
              </span>
            </div>
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
                <PixelGlyph name="arrow" size={14} />
              </Link>
              <Link href="/showcase" className="xv-cb-btn xv-cb-btn--ghost">
                <PixelGlyph name="rocket" size={14} />
                See what Xroga builds
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

/** Cycled so a long inventory row is not the same tile repeated twelve times. */
const ECO_GLYPHS = ['gem', 'link', 'coin', 'bolt', 'net', 'btc'] as const;
const ADVANCEMENT_GLYPHS = ['book', 'rocket', 'net', 'eye', 'braces', 'chart', 'branch'] as const;
const ADVANCEMENT_ORES = ['gold', 'diamond', 'emerald', 'amethyst', 'redstone', 'lapis', 'copper'] as const;
