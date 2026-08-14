import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  Bitcoin,
  Bot,
  Braces,
  ChartNoAxesCombined,
  CheckCircle2,
  ExternalLink,
  GitBranch,
  Landmark,
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
import { BUILD_KINDS, PLACEHOLDERS, PROMPT_SUGGESTIONS, STAGES } from '@/lib/cryptoBuilderContent';
import { HACKATHON_SOURCES, WINNING_PATTERNS } from '@/lib/hackathonResearch';
import { buildMetadata } from '@/lib/seo';
import '@/styles/homepage-coding.css';
import '@/styles/crypto-builder.css';

export const metadata: Metadata = buildMetadata({
  title: 'Crypto Builder for Web3 Apps and AI Agents',
  description: 'Build AI crypto agents, Web3 apps, DeFi and DAO tools, on-chain monitoring, analytics dashboards, and hackathon projects with XROGA AI.',
  path: '/crypto-builder',
  keywords: ['crypto builder', 'AI crypto agent builder', 'Web3 app builder', 'DeFi dashboard builder', 'DAO tooling', 'on-chain monitoring agent', 'crypto hackathon project'],
});

const BUILD_ICONS = [Bot, Braces, ChartNoAxesCombined, Landmark, WalletCards, Radar, ChartNoAxesCombined, Trophy];
const STAGE_ICONS = [Search, Braces, ShieldCheck, Rocket];

export default function CryptoBuilderPage() {
  const softwareLd = {
    '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'Xroga Crypto Builder',
    applicationCategory: 'DeveloperApplication', operatingSystem: 'Web', url: 'https://xroga.com/crypto-builder',
    description: 'Build AI crypto agents, Web3 applications, DeFi and DAO tools, on-chain monitoring, analytics products, and hackathon projects with XROGA AI.',
  };

  return (
    <main className="xv-cb-root">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareLd).replace(/</g, '\\u003c') }} />

      <header className="xv-cb-header">
        <div className="xv-cb-shell xv-cb-header-inner">
          <Logo href="/" variant="homepage" height={44} />
          <nav className="xv-cb-nav" aria-label="Crypto Builder navigation">
            <a href="#capabilities">Capabilities</a><a href="#workflow">Workflow</a><a href="#research">Research</a>
            <Link href="/auth/signup" className="xv-cb-button xv-cb-button--primary">Start building <ArrowRight /></Link>
          </nav>
        </div>
      </header>

      <section className="xv-cb-hero">
        <div className="xv-cb-hero-rail" aria-hidden="true"><span>CRYPTO / WEB3</span><span>BUILD / VERIFY / SHIP</span></div>
        <div className="xv-cb-shell xv-cb-hero-grid">
          <div className="xv-cb-hero-copy">
            <p className="xv-cb-kicker"><Sparkles /> XROGA CRYPTO BUILDER</p>
            <h1>Build the next<br /><em>on-chain idea.</em></h1>
            <p>Turn a crypto brief into a repository-aware product: research, implementation, validation, GitHub delivery, and authorised publishing in one controlled loop.</p>
            <div className="xv-cb-actions">
              <Link href="/auth/signup" className="xv-cb-button xv-cb-button--primary">Build with Xroga <ArrowRight /></Link>
              <Link href="/research/web3-hackathon-winning-patterns" className="xv-cb-button">Read the research</Link>
            </div>
            <dl className="xv-cb-stats"><div><dt>01</dt><dd>Your repository</dd></div><div><dt>02</dt><dd>Real validation</dd></div><div><dt>03</dt><dd>Provider evidence</dd></div></dl>
          </div>

          <div className="xv-cb-forge" aria-label="Crypto product build preview">
            <div className="xv-cb-forge-top"><span><i /> BUILD SESSION</span><b>LIVE WORKSPACE</b></div>
            <div className="xv-cb-orbit" aria-hidden="true">
              <span className="xv-cb-orbit-ring" /><span className="xv-cb-orbit-ring xv-cb-orbit-ring--two" />
              <span className="xv-cb-orbit-core"><Bitcoin /></span>
              <span className="xv-cb-token xv-cb-token--one">Ξ</span><span className="xv-cb-token xv-cb-token--two">◎</span><span className="xv-cb-token xv-cb-token--three">◇</span>
            </div>
            <div className="xv-cb-build-card">
              <span className="xv-cb-micro">CURRENT BUILD / 0048</span>
              <strong>On-chain intelligence dashboard</strong>
              <div className="xv-cb-progress"><i /></div>
              <ul><li><CheckCircle2 /> Repository understood</li><li><CheckCircle2 /> Contract reads connected</li><li><span className="xv-cb-pulse" /> Running validation</li></ul>
            </div>
          </div>
        </div>
      </section>

      <section className="xv-cb-prompt-section" aria-label="Start a crypto build">
        <div className="xv-cb-shell">
          <div className="xv-cb-prompt-label"><span>YOUR BRIEF</span><b>Describe the outcome. Xroga handles the build loop.</b></div>
          <HomepageChatBar placeholders={PLACEHOLDERS} suggestions={PROMPT_SUGGESTIONS} ariaLabel="Describe the crypto product or AI agent you want to build" fallbackPrompt="Build a crypto product with Xroga AI" />
          <p className="xv-cb-legal">Xroga does not guarantee prizes, funding, listings, trading performance, token value, or security outcomes. It reports evidence, a real failure, or the exact external setup still required.</p>
        </div>
      </section>

      <section className="xv-cb-section" id="capabilities" aria-labelledby="cb-capabilities">
        <div className="xv-cb-shell">
          <div className="xv-cb-section-heading"><p>CAPABILITIES / 01</p><h2 id="cb-capabilities">One builder.<br /><em>Many crypto surfaces.</em></h2><span>From focused utilities to complete Web3 products, every build stays tied to code you own.</span></div>
          <div className="xv-cb-card-grid">
            {BUILD_KINDS.map((item, index) => { const Icon = BUILD_ICONS[index]; return (
              <article className="xv-cb-card" key={item.title}>
                <div><span>0{index + 1}</span><Icon /></div><small>{item.tag}</small><h3>{item.title}</h3><p>{item.body}</p>
              </article>
            ); })}
          </div>
        </div>
      </section>

      <section className="xv-cb-section xv-cb-section--blue" id="workflow" aria-labelledby="cb-workflow">
        <div className="xv-cb-shell">
          <div className="xv-cb-section-heading xv-cb-section-heading--light"><p>CONTROLLED LOOP / 02</p><h2 id="cb-workflow">From protocol brief<br /><em>to verified code.</em></h2></div>
          <ol className="xv-cb-workflow">
            {STAGES.map((stage, index) => { const Icon = STAGE_ICONS[index]; return <li key={stage.title}><span><Icon /></span><small>0{index + 1}</small><h3>{stage.title}</h3><p>{stage.body}</p></li>; })}
          </ol>
          <div className="xv-cb-proof-strip"><GitBranch /><span><b>Your GitHub</b> — one sticky repository</span><i /><ShieldCheck /><span><b>Validation</b> — checks before claims</span><i /><Rocket /><span><b>Publish</b> — only through accounts you authorise</span></div>
        </div>
      </section>

      <section className="xv-cb-section" id="research" aria-labelledby="cb-research">
        <div className="xv-cb-shell">
          <div className="xv-cb-section-heading"><p>OFFICIAL SOURCES / 03</p><h2 id="cb-research">Research the ecosystem.<br /><em>Build against the rules.</em></h2><span>Xroga is not affiliated with or endorsed by the organizations shown unless explicitly stated.</span></div>
          <div className="xv-cb-source-grid">
            {HACKATHON_SOURCES.map((source, index) => <a key={source.name} href={source.url} target="_blank" rel="noreferrer noopener"><small>{String(index + 1).padStart(2, '0')}</small><h3>{source.name}</h3><p>{source.note}</p><span>Official source <ExternalLink /></span></a>)}
          </div>
          <p className="xv-cb-legal">Prize pools, tracks, grants, bounties, eligibility, and claim processes are set by each organiser and change between events. Verify current rules directly with the organiser before you build.</p>
        </div>
      </section>

      <section className="xv-cb-section xv-cb-patterns" aria-labelledby="cb-patterns">
        <div className="xv-cb-shell xv-cb-pattern-layout">
          <div className="xv-cb-section-heading"><p>JUDGING SIGNALS / 04</p><h2 id="cb-patterns">What strong submissions<br /><em>make visible.</em></h2></div>
          <div>{WINNING_PATTERNS.map((pattern, index) => <article key={pattern.name}><span>0{index + 1}</span><div><h3>{pattern.name}</h3><p>{pattern.evidence}</p></div></article>)}</div>
        </div>
      </section>

      <section className="xv-cb-cta"><div className="xv-cb-shell"><div><p>YOUR CODE. YOUR PRODUCT.</p><h2>Bring the idea.<br /><em>Leave with evidence.</em></h2></div><Link href="/auth/signup" className="xv-cb-button xv-cb-button--light">Open Xroga <ArrowRight /></Link></div></section>
    </main>
  );
}
