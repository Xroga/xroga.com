import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight,
  Check,
  CircleCheck,
  Cpu,
  Database,
  FileCode2,
  FolderGit2,
  Gauge,
  KeyRound,
  LayoutDashboard,
  Mail,
  Network,
  Plug,
  ShieldCheck,
  Sparkles,
  Unplug,
  Workflow,
} from 'lucide-react';
import { Logo } from '@/components/layout/Logo';
import { GitHubIcon } from '@/components/icons/GitHubIcon';
import { ScrollReveal } from './ScrollReveal';
import { PageJsonLd } from '@/components/seo/PageJsonLd';
import { HomepageWorkspaceTour } from '@/components/homepage/HomepageWorkspaceTour';
import { SoftwareHeader } from './SoftwareHeader';
import { SoftwarePrompt } from './SoftwarePrompt';
import { SoftwareFeatureTabs } from './SoftwareFeatureTabs';
// The workspace tour's styles live here, not in the component. Without this import
// the rules simply do not exist on this route and the tour renders as stacked text —
// the ancestor class below is necessary but not sufficient on its own.
import '@/styles/homepage-coding.css';
import '@/styles/software-landing.css';
import { SOFTWARE_ART as ART } from '@/lib/softwareArt';

/**
 * /software — the Xroga Software World landing page.
 *
 * A server component; only the header drawer, the prompt panel and the bento tabs are
 * client-side. All copy, every image and the whole footer render on the server.
 *
 * Division of labour, held to strictly: the generated artwork supplies the *world* —
 * environment, atmosphere, light, abstract architecture — and HTML supplies the
 * *product* — the logo, every heading, every control, the workspace preview and the
 * repository panel. No product UI is baked into a raster, and no artwork contains text,
 * a logo, or anything a viewer is meant to read.
 *
 * On proof: the references carry customer logo walls. Xroga has no verified customer
 * list in this repository, so there is none here. No counts, ratings, uptime figures or
 * certifications appear anywhere, and the repository panel is labelled as an interface
 * demonstration rather than presented as a customer's code.
 */


const FOOTER_GROUPS = [
  {
    title: 'Product',
    links: [
      { href: '/features', label: 'Features' },
      { href: '/integrations', label: 'Integrations' },
      { href: '/showcase', label: 'Showcase' },
      { href: '/pricing', label: 'Pricing' },
    ],
  },
  {
    title: 'Build with Xroga',
    links: [
      { href: '/ai-app-builder', label: 'AI App Builder' },
      { href: '/ai-coding-agent', label: 'AI Coding Agent' },
      { href: '/ai-website-builder', label: 'Website Builder' },
      { href: '/build-saas-with-ai', label: 'SaaS with AI' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/about', label: 'About' },
      { href: '/docs', label: 'Docs' },
      { href: '/research', label: 'Research' },
      { href: '/contact', label: 'Contact' },
    ],
  },
] as const;

const SOFTWARE_TYPES = [
  { icon: LayoutDashboard, title: 'SaaS products', body: 'Multi-user applications with accounts, billing surfaces and the workflows around them.' },
  { icon: Gauge, title: 'Dashboards', body: 'Operational views over live data, with the queries and access rules behind them.' },
  { icon: Network, title: 'API-backed tools', body: 'Services and internal tools that talk to systems you already run.' },
  { icon: Workflow, title: 'Internal workflow apps', body: 'The processes a team runs on, turned into software instead of spreadsheets.' },
  { icon: Database, title: 'Data-driven apps', body: 'Products where the schema, storage and integrity matter as much as the interface.' },
  { icon: Cpu, title: 'Extensions to what exists', body: 'New capability added to a codebase you already own, using its own conventions.' },
];

export function SoftwareLanding() {
  return (
    <div className="xsw-page">
      <PageJsonLd
        path="/software"
        name="Build Software with AI — Xroga"
        description="Plan, build, test and prepare deployable software from a product outcome, with the code in your repository and provider ownership in your accounts."
      />

      {/* ---------------------------------------------------------------- hero */}
      <section className="xsw-hero">
        <div className="xsw-media" aria-hidden="true">
          <Image src={ART.hero} alt="" fill priority sizes="100vw" quality={82} />
        </div>
        <div className="xsw-scrim" aria-hidden="true" />

        <SoftwareHeader />

        <div className="xsw-shell xsw-hero__body">
          <p className="xsw-eyebrow"><Sparkles aria-hidden="true" />Xroga for software</p>

          <h1 className="xsw-h1">
            Describe the software. <span className="xsw-accent">Get a real product.</span>
          </h1>

          <p className="xsw-hero__lede">
            Xroga plans, builds, tests and prepares deployable applications from a product
            outcome — and the code stays in a repository you can read.
          </p>

          <SoftwarePrompt />

          <div className="xsw-hero__actions">
            <Link href="/auth/signup" className="xsw-btn xsw-btn--lg">Start building free</Link>
            <Link href="/showcase" className="xsw-btn xsw-btn--lg xsw-btn--ghost">See what people build</Link>
          </div>

          {/* The references show a customer logo wall here. There is no verified
              customer list to show, so this stays a product statement. */}
          <p className="xsw-hero__foot">From outcome to working product</p>
        </div>
      </section>

      {/* ------------------------------------------------------------- problem */}
      <section className="xsw-problem" aria-labelledby="xsw-problem-heading">
        <div className="xsw-media" aria-hidden="true">
          <Image src={ART.problem} alt="" fill loading="lazy" sizes="100vw" quality={76} />
        </div>
        <div className="xsw-scrim" aria-hidden="true" />

        <div className="xsw-shell">
          <ScrollReveal>
            <div className="xsw-center">
              <p className="xsw-pill">The problem</p>
              <h2 className="xsw-h2" id="xsw-problem-heading">
                Most AI builders hand back something you <span className="xsw-muted">cannot open, extend, or own.</span>
              </h2>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={100}>
            <div className="xsw-tri">
              <div>
                <span className="xsw-icon" aria-hidden="true"><Unplug /></span>
                <h3>Disconnected output</h3>
                <p>Interface, data and integrations arrive as separate fragments that were never designed to work as one product.</p>
              </div>
              <div>
                <span className="xsw-icon" aria-hidden="true"><FolderGit2 /></span>
                <h3>No repository to inspect</h3>
                <p>The result lives inside a closed editor, so you cannot read it, review it, or take it anywhere else.</p>
              </div>
              <div>
                <span className="xsw-icon" aria-hidden="true"><ShieldCheck /></span>
                <h3>&ldquo;Done&rdquo; means nothing</h3>
                <p>Without typechecks, tests and builds deciding the outcome, completion is only an assertion.</p>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ------------------------------------------------------------ ai field */}
      <section className="xsw-field" aria-labelledby="xsw-field-heading">
        <div className="xsw-media" aria-hidden="true">
          <Image src={ART.aiField} alt="" fill loading="lazy" sizes="100vw" quality={82} />
        </div>
        <div className="xsw-scrim" aria-hidden="true" />

        <div className="xsw-shell">
          <ScrollReveal>
            <div className="xsw-center">
              <p className="xsw-pill xsw-pill--onblue">The solution</p>
              <h2 className="xsw-h2" id="xsw-field-heading">One system, from prompt to production</h2>
              <p className="xsw-field__lede">
                Implementation tasks share one repository and one project state, so separate
                models cannot produce disconnected versions of the same product.
              </p>
            </div>
          </ScrollReveal>

          {/* The real workspace, not a redrawn dashboard — the same component the
              homepage uses, so the preview cannot drift from the product. */}
          <ScrollReveal delay={120}>
            {/* `.xv-home-coding` is load-bearing, not decoration: the tour's styles live
                in the homepage stylesheet and 41 of its rules are scoped under that
                ancestor, so without it the component renders as unstyled stacked text.
                Reusing the real component means reproducing the environment it expects. */}
            <div className="xsw-stage xv-home-coding">
              <HomepageWorkspaceTour loggedIn={false} />
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* --------------------------------------------------------------- build */}
      <section className="xsw-build" aria-labelledby="xsw-build-heading">
        <div className="xsw-media" aria-hidden="true">
          <Image src={ART.build} alt="" fill loading="lazy" sizes="100vw" quality={80} />
        </div>
        <div className="xsw-scrim" aria-hidden="true" />

        <div className="xsw-shell xsw-split">
          <ScrollReveal>
            <div>
              <p className="xsw-pill xsw-pill--light">How it works</p>
              <h2 className="xsw-h2" id="xsw-build-heading">Plan, build, connect, prove</h2>
              <p className="xsw-lede">
                Describe users, the core workflow, the data and the acceptance criteria.
                Xroga turns that into work it can execute, then proves the result before
                calling it finished.
              </p>
              <ul className="xsw-checks">
                <li><Check aria-hidden="true" /><span>Product requirements become executable subtasks</span></li>
                <li><Check aria-hidden="true" /><span>UI, APIs, persistent data and authorized integrations connect as one product</span></li>
                <li><Check aria-hidden="true" /><span>Existing project architecture and tests are reused</span></li>
                <li><Check aria-hidden="true" /><span>Previews or production deployments are prepared when configured</span></li>
              </ul>
              <div className="xsw-actions">
                <Link href="/auth/signup" className="xsw-btn xsw-btn--lg">Start building</Link>
                <Link href="/docs" className="xsw-textlink">Read the docs<ArrowRight aria-hidden="true" /></Link>
              </div>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={110}>
            <div className="xsw-grid3" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
              {[
                { n: '01', t: 'Define the product', b: 'Describe users, core workflow, required data, integrations, and acceptance criteria.' },
                { n: '02', t: 'Build coherently', b: 'Implementation tasks share one repository and project state so separate models do not create disconnected versions.' },
                { n: '03', t: 'Prove the result', b: 'Applicable typechecks, tests, builds, and runtime checks determine the final status.' },
              ].map((step) => (
                <div key={step.n} className="xsw-tile">
                  <span className="xsw-icon xsw-icon--light" aria-hidden="true">{step.n}</span>
                  <h3>{step.t}</h3>
                  <p>{step.b}</p>
                </div>
              ))}
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* --------------------------------------------------------------- bento */}
      <section className="xsw-bento-section" aria-labelledby="xsw-caps-heading">
        <div className="xsw-shell xsw-center">
          <p className="xsw-pill">Built for real product work</p>
          <h2 className="xsw-h2" id="xsw-caps-heading">
            Everything the product needs, <span className="xsw-accent">in one place</span>
          </h2>
          <SoftwareFeatureTabs />
        </div>
      </section>

      {/* ------------------------------------------------------- software types */}
      <section className="xsw-plain" aria-labelledby="xsw-types-heading">
        <div className="xsw-shell">
          <ScrollReveal>
            <div className="xsw-head">
              <p className="xsw-pill xsw-pill--light">What you can build</p>
              <h2 className="xsw-h2" id="xsw-types-heading">Software Xroga can create or extend</h2>
              <p>Web products and the systems around them — built new, or added to a codebase you already own.</p>
            </div>
          </ScrollReveal>
          <div className="xsw-grid3">
            {SOFTWARE_TYPES.map((t, i) => {
              const Icon = t.icon;
              return (
                <ScrollReveal key={t.title} delay={i * 60}>
                  <div className="xsw-tile">
                    <span className="xsw-icon xsw-icon--light" aria-hidden="true"><Icon /></span>
                    <h3>{t.title}</h3>
                    <p>{t.body}</p>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- repository */}
      <section className="xsw-repo" aria-labelledby="xsw-repo-heading">
        <div className="xsw-media" aria-hidden="true">
          <Image src={ART.repository} alt="" fill loading="lazy" sizes="100vw" quality={78} />
        </div>
        <div className="xsw-scrim" aria-hidden="true" />

        <div className="xsw-shell xsw-split">
          <ScrollReveal>
            <div>
              <p className="xsw-pill">Ownership</p>
              <h2 className="xsw-h2" id="xsw-repo-heading">
                Your software. Your repository. <span className="xsw-accent">Your control.</span>
              </h2>
              <p className="xsw-lede">
                What Xroga produces stays inspectable. Read every file, review every change,
                and take the project elsewhere — the work is not locked inside a visual
                editor, and provider ownership stays in your accounts.
              </p>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={120}>
            {/* Interface demonstration with neutral sample paths — not a customer
                repository, and not fabricated activity presented as real. */}
            <div className="xsw-panel">
              <div className="xsw-panel__bar">
                <FolderGit2 aria-hidden="true" />
                <span>your-product</span>
                <span className="xsw-demo">Interface demonstration</span>
              </div>
              <ul className="xsw-tree">
                <li><FolderGit2 aria-hidden="true" />app/</li>
                <li className="nest"><FileCode2 aria-hidden="true" />page.tsx</li>
                <li className="nest"><FileCode2 aria-hidden="true" />api/route.ts</li>
                <li><FolderGit2 aria-hidden="true" />components/</li>
                <li className="nest"><FileCode2 aria-hidden="true" />dashboard.tsx</li>
                <li><FileCode2 aria-hidden="true" />schema.sql</li>
                <li><FileCode2 aria-hidden="true" />dashboard.test.ts</li>
              </ul>
              <div className="xsw-checkrow">
                <span><CircleCheck aria-hidden="true" />Typecheck</span>
                <span><CircleCheck aria-hidden="true" />Tests</span>
                <span><CircleCheck aria-hidden="true" />Build</span>
                <span><CircleCheck aria-hidden="true" />Runtime checks</span>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ------------------------------------------------------------- control */}
      <section className="xsw-plain xsw-plain--tint" aria-labelledby="xsw-control-heading">
        <div className="xsw-shell">
          <ScrollReveal>
            <div className="xsw-head">
              <p className="xsw-pill xsw-pill--light">Honest boundaries</p>
              <h2 className="xsw-h2" id="xsw-control-heading">What Xroga handles, and what still needs you</h2>
            </div>
          </ScrollReveal>

          <div className="xsw-two">
            <ScrollReveal>
              <div>
                <h3><ShieldCheck aria-hidden="true" />Xroga handles</h3>
                <ul>
                  <li><Check aria-hidden="true" /><span>Translate product requirements into executable subtasks</span></li>
                  <li><Check aria-hidden="true" /><span>Connect UI, APIs, persistent data, and authorized integrations</span></li>
                  <li><Check aria-hidden="true" /><span>Reuse project architecture and tests</span></li>
                  <li><Check aria-hidden="true" /><span>Prepare previews or production deployments when configured</span></li>
                </ul>
              </div>
            </ScrollReveal>
            <ScrollReveal delay={100}>
              <div>
                <h3><KeyRound aria-hidden="true" />Needs your approval</h3>
                <ul>
                  <li><Plug aria-hidden="true" /><span>Payments and billing providers</span></li>
                  <li><Plug aria-hidden="true" /><span>OAuth applications</span></li>
                  <li><Plug aria-hidden="true" /><span>DNS and domain configuration</span></li>
                  <li><Plug aria-hidden="true" /><span>Production stores and other external systems</span></li>
                </ul>
              </div>
            </ScrollReveal>
          </div>

          {/* The capability data's limitation copy, reproduced in full. */}
          <p className="xsw-note">
            An open-ended prompt can start the work, but payments, OAuth applications, DNS,
            production stores, and other external systems may require credentials or human
            approval.
          </p>
        </div>
      </section>

      {/* ----------------------------------------------------------------- cta */}
      <section className="xsw-cta" aria-labelledby="xsw-cta-heading">
        <div className="xsw-media" aria-hidden="true">
          <Image src={ART.cta} alt="" fill loading="lazy" sizes="100vw" quality={80} />
        </div>
        <div className="xsw-scrim" aria-hidden="true" />

        <div className="xsw-shell">
          <ScrollReveal>
            <div>
              <h2 className="xsw-h2" id="xsw-cta-heading">What will you build?</h2>
              <p className="xsw-cta__lede">
                Start from a product outcome. Keep the code, the repository and the provider
                accounts.
              </p>
              <div className="xsw-hero__actions">
                <Link href="/auth/signup" className="xsw-btn xsw-btn--lg">Start building free</Link>
                <Link href="/pricing" className="xsw-btn xsw-btn--lg xsw-btn--ghost">See pricing</Link>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* -------------------------------------------------------------- footer */}
      <footer className="xsw-footer">
        <div className="xsw-media" aria-hidden="true">
          <Image src={ART.footer} alt="" fill loading="lazy" sizes="100vw" quality={78} />
        </div>

        <div className="xsw-footer__card">
          <div className="xsw-footer__top">
            <div>
              <Logo href="/" variant="homepage" height={36} />
              <p className="xsw-footer__blurb">
                Software built from a product outcome — planned, connected, proven, and
                left in a repository you own.
              </p>
              <Link href="/auth/signup" className="xsw-btn">Build your software now</Link>
              <span className="xsw-footer__note">
                <ShieldCheck aria-hidden="true" />
                Your repository, your provider accounts
              </span>
              <div className="xsw-social">
                <a href="https://x.com/Xroga_AI" target="_blank" rel="noreferrer" aria-label="Xroga on X">𝕏</a>
                <a href="https://github.com/Xroga/xroga.com" target="_blank" rel="noreferrer" aria-label="Xroga on GitHub"><GitHubIcon /></a>
                <a href="mailto:hello@xroga.com" aria-label="Email Xroga"><Mail aria-hidden="true" /></a>
              </div>
            </div>

            {FOOTER_GROUPS.map((group) => (
              <div key={group.title} className="xsw-footer__col">
                <h3>{group.title}</h3>
                <ul>
                  {group.links.map((link) => (
                    <li key={link.href}><Link href={link.href}>{link.label}</Link></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="xsw-footer__bottom">
            <p className="xsw-footer__legal">© {new Date().getFullYear()} Xroga. All rights reserved.</p>
            <div className="xsw-footer__links">
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Terms</Link>
              <Link href="/refund">Refund</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
