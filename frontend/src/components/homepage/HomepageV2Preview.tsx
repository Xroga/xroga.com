'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight, ArrowUpRight, Bot, Boxes, Browser, Check, CheckCircle2, Code2,
  Database, FileCode2, Gamepad2, Github, Globe2, KeyRound, Layers3, Monitor,
  Network, Package, PanelTop, Rocket, Search, ShieldCheck, Smartphone, Sparkles,
  TerminalSquare, TestTube2, UserRound, UsersRound, WandSparkles, Workflow, Wrench
} from 'lucide-react';
import { PublicMarketingHeader } from '@/components/layout/PublicMarketingHeader';
import { HomepageChatBar } from '@/components/terminal/HomepageChatBar';
import { HomepageWorkspaceTour } from '@/components/homepage/HomepageWorkspaceTour';
import { HomepageShowcase } from '@/components/showcase/HomepageShowcase';
import { HomepagePricingPreview } from '@/components/homepage/HomepagePricingPreview';
import { HomepageFaqSection } from '@/components/homepage/HomepageFaqSection';
import { HomepageCursorGlitter } from '@/components/homepage/HomepageCursorGlitter';

const BUILD_TYPES = [
  { title: 'Web apps', copy: 'Full-stack products with interfaces, logic, accounts, data and integrations.', href: '/ai-app-builder', icon: PanelsIcon, className: 'is-large' },
  { title: 'Websites', copy: 'Landing pages, company sites, portfolios and conversion-focused web experiences.', href: '/ai-website-builder', icon: Globe2, className: 'is-large' },
  { title: 'SaaS', copy: 'Subscription products, dashboards, billing flows and account experiences.', href: '/build', icon: Boxes },
  { title: 'Browser extensions', copy: 'Useful browser tools and workflow extensions.', href: '/build', icon: Browser },
  { title: 'Mobile apps', copy: 'Mobile-first product experiences and supported app scaffolds.', href: '/build', icon: Smartphone },
  { title: 'Internal tools', copy: 'Admin panels, operations software and team workflows.', href: '/build', icon: Monitor },
  { title: 'APIs & backends', copy: 'Endpoints, services, business logic and integrations.', href: '/build', icon: Network },
  { title: 'Automations', copy: 'Connect workflows and reduce repetitive software tasks.', href: '/build', icon: Workflow },
  { title: 'Games', copy: 'Playable experiences and game systems for supported stacks.', href: '/game-builder', icon: Gamepad2 },
  { title: 'Web3 & crypto', copy: 'Crypto and Web3 product interfaces with explicit risk boundaries.', href: '/crypto-builder', icon: Layers3 },
  { title: 'Developer tools', copy: 'CLIs, libraries, utilities and technical tooling.', href: '/build', icon: TerminalSquare },
  { title: 'Data products', copy: 'Dashboards, reporting, pipelines and data-driven interfaces.', href: '/build', icon: Database },
] as const;

const FLOW = [
  { n: '01', title: 'Describe', copy: 'Tell Xroga the outcome in normal language.', icon: Sparkles },
  { n: '02', title: 'Understand', copy: 'Read the relevant brief, codebase and product context.', icon: Search },
  { n: '03', title: 'Plan', copy: 'Turn the request into focused implementation work.', icon: Workflow },
  { n: '04', title: 'Build', copy: 'Create and change real project files.', icon: Code2 },
  { n: '05', title: 'Verify', copy: 'Run applicable tests, builds and checks.', icon: ShieldCheck },
  { n: '06', title: 'Ship', copy: 'Move through supported release workflows you authorize.', icon: Rocket },
] as const;

const PERSONAS = [
  { title: 'I do not code', copy: 'Start in plain language. Xroga handles the technical work while keeping the path understandable.', icon: UserRound, href: '/ai-app-builder' },
  { title: 'I am launching a company', copy: 'Move from product idea to working software without stitching together a dozen disconnected tools.', icon: WandSparkles, href: '/build' },
  { title: 'I am a developer', copy: 'Bring a real repository, inspect changes and keep control of the architecture and source code.', icon: FileCode2, href: '/ai-coding-agent' },
  { title: 'We are a product team', copy: 'Turn requests into implementation, evidence and handoff with one shared workflow.', icon: UsersRound, href: '/features' },
] as const;

const STACK = [
  ['Interface', PanelTop], ['Application logic', Code2], ['Authentication', KeyRound],
  ['Database', Database], ['APIs', Network], ['Integrations', Package],
  ['Testing', TestTube2], ['Deployment', Rocket],
] as const;

function PanelsIcon(props: React.ComponentProps<typeof PanelTop>) {
  return <PanelTop {...props} />;
}

function SectionHeader({ eyebrow, title, copy, id }: { eyebrow: string; title: React.ReactNode; copy?: string; id: string }) {
  return <header className="xv-v2-section-head">
    <p>{eyebrow}</p>
    <h2 id={id}>{title}</h2>
    {copy ? <span>{copy}</span> : null}
  </header>;
}

export function HomepageV2Preview() {
  return (
    <div className="xv-v2">
      <HomepageCursorGlitter />
      <PublicMarketingHeader />

      <main>
        <section className="xv-v2-hero" aria-labelledby="xv-v2-hero-title">
          <div className="xv-v2-hero__bg" aria-hidden="true" />
          <div className="xv-v2-hero__inner">
            <div className="xv-v2-hero__copy">
              <p className="xv-v2-kicker"><i /> AI APP BUILDER + CODING AGENT</p>
              <h1 id="xv-v2-hero-title">Build apps, websites and software with AI. <em>From an idea or existing code.</em></h1>
              <p className="xv-v2-hero__lede">
                Xroga helps beginners, founders and developers turn ideas into real software.
                Build new products or improve existing projects—from websites and SaaS to extensions,
                APIs, automations and more—then test, refine and help ship the code you own.
              </p>
              <div className="xv-v2-hero__actions">
                <Link href="/auth/signup" className="xv-v2-button is-primary">Start building free <ArrowRight /></Link>
                <a href="#what-can-xroga-build" className="xv-v2-button is-secondary">See what Xroga can build</a>
              </div>
              <div className="xv-v2-trustline" aria-label="Xroga quick facts">
                <span><CheckCircle2 /> No coding required</span>
                <span><CheckCircle2 /> Start free</span>
                <span><CheckCircle2 /> Code you own</span>
              </div>
            </div>

            <div className="xv-v2-builder">
              <div className="xv-v2-builder__top"><span><Sparkles /> What do you want to build?</span><b>Describe it. Build it.</b></div>
              <HomepageChatBar />
              <nav className="xv-v2-builder__modes" aria-label="Example things to build">
                {['Website','App','SaaS','Extension','Automation','API','Existing project'].map((item) => <span key={item}>{item}</span>)}
              </nav>
              <div className="xv-v2-builder__prompt">
                <small>TRY A PROMPT</small>
                <p>“Build a customer portal with subscriptions, analytics and an admin dashboard.”</p>
              </div>
            </div>
          </div>
          <div className="xv-v2-category-rail" aria-label="Products Xroga can help build">
            <div>{['Websites','Apps','SaaS','Dashboards','Internal tools','Mobile apps','Browser extensions','APIs','Automations','Desktop apps','Games','Web3','CLIs','Libraries'].map(x => <span key={x}>{x}</span>)}</div>
          </div>
        </section>

        <section className="xv-v2-definition" aria-labelledby="what-is-xroga">
          <div className="xv-v2-definition__copy">
            <SectionHeader eyebrow="WHAT IS XROGA?" id="what-is-xroga" title={<>One AI workspace for turning ideas into <em>real software.</em></>} />
            <p>Xroga is an AI app builder and coding agent designed for people who have never written code and developers working with real repositories. Start with a sentence, a product idea or an existing codebase.</p>
            <p>Xroga helps understand the goal, plan the work, write and modify code, connect supported services, run applicable checks, fix problems and prepare the product to ship.</p>
            <div className="xv-v2-definition__links">
              <Link href="/ai-app-builder">AI app builder <ArrowUpRight /></Link>
              <Link href="/ai-coding-agent">AI coding agent <ArrowUpRight /></Link>
              <Link href="/features">All capabilities <ArrowUpRight /></Link>
            </div>
          </div>
          <div className="xv-v2-lifecycle" aria-label="Xroga software lifecycle">
            {FLOW.map(({ n, title, icon: Icon }) => <div key={title}><small>{n}</small><Icon /><b>{title}</b></div>)}
          </div>
        </section>

        <section className="xv-v2-start" aria-labelledby="start-where-you-are">
          <SectionHeader eyebrow="TWO WAYS TO START" id="start-where-you-are" title={<>Start where <em>you are.</em></>} copy="A blank page is optional. Xroga can begin with an idea or with software you already own." />
          <div className="xv-v2-start__grid">
            <article className="xv-v2-start-card is-idea">
              <div className="xv-v2-start-card__art" aria-hidden="true"><Sparkles /><span>“Build a subscription analytics product for small teams.”</span><ArrowRight /><div>Working product</div></div>
              <div className="xv-v2-start-card__copy"><small>01 / GREENFIELD</small><h3>I have an idea.</h3><p>No repository or technical specification required. Describe the product and develop it through conversation.</p><Link href="/auth/signup">Start from an idea <ArrowRight /></Link></div>
            </article>
            <article className="xv-v2-start-card is-repo">
              <div className="xv-v2-start-card__art" aria-hidden="true"><Github /><span>your-team/product</span><ArrowRight /><div><FileCode2 /> focused changes</div><div><TestTube2 /> checks</div></div>
              <div className="xv-v2-start-card__copy"><small>02 / EXISTING SOFTWARE</small><h3>I already have a project.</h3><p>Connect a repository so Xroga can work with the architecture you already have and return reviewable changes.</p><Link href="/ai-coding-agent">Work on existing code <ArrowRight /></Link></div>
            </article>
          </div>
        </section>

        <section className="xv-v2-build" id="what-can-xroga-build" aria-labelledby="build-anything-title">
          <SectionHeader eyebrow="WHAT YOU CAN BUILD" id="build-anything-title" title={<>From your first website to <em>serious software.</em></>} copy="The homepage should show the breadth. Dedicated pages own the deeper search intent." />
          <div className="xv-v2-build__grid">
            {BUILD_TYPES.map(({ title, copy, href, icon: Icon, className }) => (
              <Link href={href} className={`xv-v2-build-card ${className ?? ''}`} key={title}>
                <div><Icon /><ArrowUpRight /></div><h3>{title}</h3><p>{copy}</p><span>Explore</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="xv-v2-workspace" aria-labelledby="workspace-title">
          <SectionHeader eyebrow="THE XROGA WORKSPACE" id="workspace-title" title={<>Watch Xroga <em>work.</em></>} copy="Conversation, project context, code, preview and control in one place." />
          <div className="xv-v2-workspace__frame"><HomepageWorkspaceTour loggedIn={false} /></div>
        </section>

        <section className="xv-v2-flow" aria-labelledby="flow-title">
          <SectionHeader eyebrow="FROM REQUEST TO RELEASE" id="flow-title" title={<>A visible path from prompt to <em>working product.</em></>} />
          <ol>
            {FLOW.map(({ n, title, copy, icon: Icon }) => <li key={title}><div><small>{n}</small><Icon /></div><h3>{title}</h3><p>{copy}</p></li>)}
          </ol>
        </section>

        <section className="xv-v2-fullstack" aria-labelledby="fullstack-title">
          <div className="xv-v2-fullstack__copy">
            <SectionHeader eyebrow="FULL-STACK BUILDING" id="fullstack-title" title={<>Not just the screen. <em>The software behind it.</em></>} />
            <p>Build more than a visual mockup. Xroga can work across supported frontend, backend, data, integration and release tasks required by real products.</p>
            <Link href="/features">Explore capabilities <ArrowRight /></Link>
          </div>
          <div className="xv-v2-stack-map" aria-label="Layers of software Xroga can work across">
            <div className="xv-v2-stack-map__core"><Image src="/brand/xroga-mark.png" width={72} height={72} alt="Xroga" /><b>Xroga</b><span>product context</span></div>
            {STACK.map(([label, Icon], index) => <div key={label} className="xv-v2-stack-node" style={{ '--i': index } as React.CSSProperties}><Icon /><span>{label}</span></div>)}
          </div>
        </section>

        <section className="xv-v2-proof" aria-labelledby="proof-title">
          <div className="xv-v2-proof__terminal">
            <header><i /><i /><i /><span>xroga / validation</span></header>
            <div><p><Check /> Type check <b>PASSED</b></p><p><Check /> Tests <b>24 PASSED</b></p><p><Check /> Production build <b>PASSED</b></p><p><Check /> Preview route <b>READY</b></p><p className="is-warn"><KeyRound /> External credential <b>USER ACTION</b></p></div>
          </div>
          <div className="xv-v2-proof__copy">
            <SectionHeader eyebrow="VISIBLE VERIFICATION" id="proof-title" title={<>AI should prove the work—not just say <em>“done.”</em></>} />
            <p>Xroga is designed to run checks that fit the project and surface evidence, failures and external requirements before work is presented as complete.</p>
            <div className="xv-v2-proof__chips"><span>Type checks</span><span>Tests</span><span>Builds</span><span>Preview evidence</span><span>Blockers</span></div>
          </div>
        </section>

        <section className="xv-v2-personas" aria-labelledby="personas-title">
          <SectionHeader eyebrow="BUILT FOR DIFFERENT STARTING POINTS" id="personas-title" title={<>Simple enough to start. <em>Powerful enough to keep going.</em></>} />
          <div className="xv-v2-personas__grid">
            {PERSONAS.map(({ title, copy, icon: Icon, href }) => <Link href={href} key={title}><Icon /><h3>{title}</h3><p>{copy}</p><span>Explore <ArrowRight /></span></Link>)}
          </div>
        </section>

        <section className="xv-v2-ownership" aria-labelledby="ownership-title">
          <SectionHeader eyebrow="OWNERSHIP" id="ownership-title" title={<>Build software that remains <em>yours.</em></>} copy="The result should survive beyond one AI session." />
          <div className="xv-v2-ownership__words">
            <article><Code2 /><h3>CODE</h3><p>Inspect and continue development.</p></article>
            <article><Github /><h3>REPOSITORY</h3><p>Keep real project history.</p></article>
            <article><KeyRound /><h3>ACCOUNTS</h3><p>Authorize external services yourself.</p></article>
          </div>
        </section>

        <section className="xv-v2-integrations" aria-labelledby="integrations-title">
          <SectionHeader eyebrow="YOUR STACK" id="integrations-title" title={<>Use the tools your product <em>already needs.</em></>} />
          <div className="xv-v2-integration-map">
            <div className="xv-v2-integration-map__center"><Image src="/brand/xroga-mark.png" width={64} height={64} alt="" /><b>Xroga</b></div>
            {['GitHub','Vercel','Supabase','Cloudflare','TypeScript','Python','React','Next.js'].map((x, index) => <span key={x} style={{ '--i': index } as React.CSSProperties}>{x}</span>)}
          </div>
          <Link href="/integrations" className="xv-v2-text-link">Explore integrations <ArrowRight /></Link>
        </section>

        <section className="xv-v2-showcase" aria-labelledby="showcase-v2-title">
          <SectionHeader eyebrow="BUILT WITH XROGA" id="showcase-v2-title" title={<>Don't take the prompt at its word. <em>See the output.</em></>} copy="Real visual output should do more persuasion than another paragraph of marketing copy." />
          <HomepageShowcase />
        </section>

        <section className="xv-v2-why" aria-labelledby="why-title">
          <div className="xv-v2-why__copy">
            <SectionHeader eyebrow="WHY XROGA" id="why-title" title={<>Designed for the work after the <em>first prompt</em> too.</>} />
            <Link href="/compare">Compare AI builders <ArrowRight /></Link>
          </div>
          <div className="xv-v2-why__checks">
            {['Start from an idea','Work on existing repositories','Plain-language building','Inspectable source code','Full-stack work','Applicable verification','Supported publishing','Code ownership'].map(x => <span key={x}><CheckCircle2 /> {x}</span>)}
          </div>
        </section>

        <section className="xv-v2-learn" aria-labelledby="learn-title">
          <SectionHeader eyebrow="LEARN & BUILD" id="learn-title" title={<>Learn how to turn ideas into <em>software.</em></>} />
          <div className="xv-v2-learn__grid">
            <Link href="/blog/best-ai-app-builders" className="is-featured"><small>BUYER GUIDE</small><h3>How to choose an AI app builder</h3><p>Evaluate scope, ownership, data, tests, deployment and operating fit.</p><span>Read guide <ArrowRight /></span></Link>
            <Link href="/blog/what-is-vibe-coding"><small>GUIDE</small><h3>What is vibe coding?</h3><p>Where it works, where it breaks and how to keep control.</p><span>Read <ArrowRight /></span></Link>
            <Link href="/learn/production-readiness-checklist"><small>CHECKLIST</small><h3>Production-ready AI software</h3><p>A framework for deciding whether software is actually ready to serve users.</p><span>Read <ArrowRight /></span></Link>
            <Link href="/build"><small>BUILD LIBRARY</small><h3>What can you build with Xroga?</h3><p>Explore product patterns from SaaS and dashboards to websites and tools.</p><span>Explore <ArrowRight /></span></Link>
          </div>
        </section>

        <section className="xv-v2-pricing" aria-labelledby="pricing-v2-title">
          <SectionHeader eyebrow="PRICING" id="pricing-v2-title" title={<>Start building <em>free.</em></>} copy="Keep the choice simple. Upgrade when the work needs more capacity." />
          <HomepagePricingPreview loggedIn={false} />
        </section>

        <section className="xv-v2-faq" aria-labelledby="faq-v2-title">
          <SectionHeader eyebrow="QUESTIONS ABOUT XROGA" id="faq-v2-title" title={<>Know what Xroga is <em>before you start.</em></>} />
          <HomepageFaqSection />
        </section>

        <section className="xv-v2-final" aria-labelledby="final-v2-title">
          <div className="xv-v2-final__orb" aria-hidden="true"><Image src="/brand/xroga-mark.png" alt="" width={150} height={150} /></div>
          <p>FROM IDEA TO SOFTWARE</p>
          <h2 id="final-v2-title">Build what you actually want to <em>exist.</em></h2>
          <span>Start with a thought, a prompt or a project already in motion. Xroga helps turn it into real software.</span>
          <div><Link href="/auth/signup" className="xv-v2-button is-primary">Start building free <ArrowRight /></Link><a href="#what-can-xroga-build" className="xv-v2-button is-secondary">Explore what you can build</a></div>
        </section>
      </main>

      <footer className="xv-v2-footer">
        <div className="xv-v2-footer__brand"><Image src="/brand/xroga-mark.png" width={42} height={42} alt="Xroga" /><div><b>Xroga</b><span>AI app builder + coding agent</span></div></div>
        <div className="xv-v2-footer__links">
          <div><b>Product</b><Link href="/ai-app-builder">AI App Builder</Link><Link href="/ai-website-builder">AI Website Builder</Link><Link href="/ai-coding-agent">AI Coding Agent</Link><Link href="/features">Features</Link><Link href="/integrations">Integrations</Link></div>
          <div><b>Build</b><Link href="/build">Apps & software</Link><Link href="/crypto-builder">Web3 & crypto</Link><Link href="/game-builder">Games</Link><Link href="/showcase">Showcase</Link></div>
          <div><b>Resources</b><Link href="/blog">Blog</Link><Link href="/learn">Learn</Link><Link href="/compare">Compare</Link><Link href="/docs">Docs</Link></div>
          <div><b>Company</b><Link href="/about">About</Link><Link href="/contact">Contact</Link><Link href="/security">Security</Link><Link href="/pricing">Pricing</Link></div>
        </div>
        <div className="xv-v2-footer__bottom"><span>© Xroga</span><div><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/refund">Refund</Link></div></div>
      </footer>
    </div>
  );
}
