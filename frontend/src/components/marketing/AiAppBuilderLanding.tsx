import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight,
  Check,
  CircleCheck,
  FileCode2,
  FolderGit2,
  KeyRound,
  Mail,
  ShieldCheck,
  Wand2,
} from 'lucide-react';
import { Logo } from '@/components/layout/Logo';
import { GitHubIcon } from '@/components/icons/GitHubIcon';
import { ScrollReveal } from './ScrollReveal';
import { PageJsonLd } from '@/components/seo/PageJsonLd';
import { HomepageWorkspaceTour } from '@/components/homepage/HomepageWorkspaceTour';
import { AiAppBuilderHeader } from './AiAppBuilderHeader';
import { AiAppBuilderPrompt } from './AiAppBuilderPrompt';
import { AiAppBuilderFeatureTabs } from './AiAppBuilderFeatureTabs';
import type { CapabilityPageData } from '@/lib/capabilityPages';
// The workspace tour is styled by the homepage sheet, and 41 of its rules are scoped
// under `.xv-home-coding`. Reusing the real component means reproducing the environment
// it was built for — importing the sheet and giving it that ancestor class — rather than
// drawing a lookalike dashboard that could drift away from the product.
import '@/styles/homepage-coding.css';
import '@/styles/ai-app-builder-landing.css';

/**
 * The AI App Builder landing page.
 *
 * Deliberately a page of its own rather than a change to `CapabilityPage`, which five
 * other routes still render — restyling the shared component would have redesigned
 * pages nobody asked about.
 *
 * The page is a server component. Only three leaves are client-side: the mobile menu,
 * the prompt card, and the tabs. Everything else — all copy, both images, the whole
 * footer — renders on the server.
 *
 * On proof: the visual reference carries a wall of customer logos. Xroga has no
 * verified customer list in this repository, so that band is a neutral product line
 * instead. There are no invented counts, ratings, uptime figures or certifications
 * anywhere on this page, and the capability data's limitation copy is reproduced in
 * full rather than softened.
 */

/**
 * The hero background.
 *
 * Swap this one constant to change the hero image — drop the file in
 * `frontend/public/backgrounds/` and point this at it. Nothing else needs to move:
 * the scrim, the type shadow and the crop are all independent of which image is used.
 *
 * Currently the Black Hole nebula, which is on-brand and flows into the blue section
 * below. The approved direction is a violet/pink dusk landscape; that artwork has to be
 * one Xroga owns or has licensed, so it is not taken from the reference site.
 */
const HERO_IMAGE = '/backgrounds/bg-desktop-4-blackhole-nebula.webp';

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
    title: 'Resources',
    links: [
      { href: '/docs', label: 'Docs' },
      { href: '/research', label: 'Research' },
      { href: '/community', label: 'Community' },
      { href: '/video', label: 'Xroga Video' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/about', label: 'About' },
      { href: '/contact', label: 'Contact' },
      { href: '/crypto', label: 'Crypto Builder' },
      { href: '/game-builder', label: 'Game Builder' },
    ],
  },
] as const;

export function AiAppBuilderLanding({ data }: { data: CapabilityPageData }) {
  return (
    <div className="xab-page">
      <PageJsonLd path={`/${data.slug}`} name={data.title} description={data.description} />

      {/* ---------------------------------------------------------------- hero */}
      <section className="xab-hero">
        <div className="xab-hero__media" aria-hidden="true">
          <Image
            src={HERO_IMAGE}
            alt=""
            fill
            priority
            sizes="100vw"
          />
        </div>
        <div className="xab-hero__scrim" aria-hidden="true" />

        <AiAppBuilderHeader />

        {/* Stripped to the reference's three elements: one line of type, the prompt, and
            a quiet line beneath. The eyebrow capsule, the supporting paragraph and the
            pair of buttons are gone — the reference earns its calm by having the image
            carry the page and the prompt be the only thing asking to be used. */}
        <div className="xab-shell xab-hero__body">
          <h1 className="xab-hero__title">
            Describe an app. <span className="xab-accent">Xroga builds it.</span>
          </h1>

          <AiAppBuilderPrompt />

          {/* The reference puts a customer logo wall here. Xroga has no verified
              customer list to show, so this stays a product statement. */}
          <p className="xab-hero__note">{data.eyebrow}</p>
        </div>
      </section>

      {/* ------------------------------------------------- blue climbing to white */}
      <section className="xab-blue" aria-labelledby="xab-platform-heading">
        <div className="xab-blue__dots" aria-hidden="true" />
        <div className="xab-shell xab-blue__grid">
          <ScrollReveal>
            <div>
              <p className="xab-pill">
                <Wand2 aria-hidden="true" />
                AI-powered product building
              </p>
              <h2 className="xab-h2" id="xab-platform-heading">
                Design, build, and ship with AI at the core
              </h2>
              <p className="xab-blue__lede">{data.intro}</p>

              <ul className="xab-checks">
                {data.outcomes.map((outcome) => (
                  <li key={outcome}>
                    <Check aria-hidden="true" />
                    <span>{outcome}</span>
                  </li>
                ))}
              </ul>

              <div className="xab-blue__actions">
                <Link href="/auth/signup" className="xab-cta xab-cta--lg">Start building free</Link>
                <Link href="/features" className="xab-textlink">
                  See how it works
                  <ArrowRight aria-hidden="true" />
                </Link>
              </div>
            </div>
          </ScrollReveal>

          {/* The real workspace tour, not a redrawn dashboard: this is the same
              component the homepage uses, so the preview cannot drift away from the
              product it is advertising. */}
          <ScrollReveal delay={120}>
            <div className="xab-preview xv-home-coding">
              <HomepageWorkspaceTour loggedIn={false} />
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* --------------------------------------------------------- dark bento */}
      <section className="xab-dark" aria-labelledby="xab-capabilities-heading">
        <div className="xab-shell xab-dark__head">
          <p className="xab-pill xab-pill--dark">Powerful by design</p>
          <h2 className="xab-h2" id="xab-capabilities-heading">
            Everything you need to build <span className="xab-accent">exceptional apps</span>
          </h2>
          <AiAppBuilderFeatureTabs />
        </div>
      </section>

      {/* ------------------------------------------------------------ process */}
      <section className="xab-process" aria-labelledby="xab-process-heading">
        <div className="xab-shell">
          <ScrollReveal>
            <div className="xab-section-head">
              <p className="xab-pill xab-pill--light">How it works</p>
              <h2 className="xab-h2" id="xab-process-heading">From outcome to proven result</h2>
              <p>
                Three stages, in order. The last one is what decides whether the work is
                actually done.
              </p>
            </div>
          </ScrollReveal>

          <ol className="xab-steps" role="list">
            {data.process.map((step, index) => (
              <ScrollReveal key={step.title} delay={index * 90}>
                <li className="xab-step">
                  <span className="xab-step__node" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </li>
              </ScrollReveal>
            ))}
          </ol>
        </div>
      </section>

      {/* --------------------------------------------------------- ownership */}
      <section className="xab-repo" aria-labelledby="xab-repo-heading">
        <div className="xab-shell xab-repo__grid">
          <ScrollReveal>
            <div>
              <p className="xab-pill xab-pill--light">Ownership</p>
              <h2 className="xab-h2" id="xab-repo-heading">
                Your code. Your repository. <span className="xab-accent">Your control.</span>
              </h2>
              <p className="xab-section-head" style={{ marginBottom: 0 }}>
                What Xroga produces stays inspectable. You can read every file, review every
                change, and take the project elsewhere — the work is not locked inside a
                visual editor, and provider ownership stays in your accounts.
              </p>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={120}>
            {/* Interface demonstration with neutral sample paths — not a customer
                repository, and not fabricated activity presented as real. */}
            <div className="xab-panel">
              <div className="xab-panel__bar">
                <FolderGit2 aria-hidden="true" />
                <span>your-app</span>
                <span className="xab-panel__demo">Interface demonstration</span>
              </div>
              <ul className="xab-tree">
                <li><FolderGit2 aria-hidden="true" />app/</li>
                <li className="xab-tree__nest"><FileCode2 aria-hidden="true" />page.tsx</li>
                <li className="xab-tree__nest"><FileCode2 aria-hidden="true" />api/route.ts</li>
                <li><FolderGit2 aria-hidden="true" />components/</li>
                <li className="xab-tree__nest"><FileCode2 aria-hidden="true" />dashboard.tsx</li>
                <li><FileCode2 aria-hidden="true" />schema.sql</li>
                <li><FileCode2 aria-hidden="true" />dashboard.test.ts</li>
              </ul>
              <div className="xab-checkrow">
                <span><CircleCheck aria-hidden="true" />Typecheck</span>
                <span><CircleCheck aria-hidden="true" />Tests</span>
                <span><CircleCheck aria-hidden="true" />Build</span>
                <span><CircleCheck aria-hidden="true" />Runtime checks</span>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ------------------------------------------------------------- limits */}
      <section className="xab-limits" aria-labelledby="xab-limits-heading">
        <div className="xab-shell">
          <ScrollReveal>
            <div className="xab-section-head">
              <p className="xab-pill xab-pill--light">Honest boundaries</p>
              <h2 className="xab-h2" id="xab-limits-heading">
                What Xroga handles, and what still needs you
              </h2>
            </div>
          </ScrollReveal>

          <div className="xab-limits__grid">
            <ScrollReveal>
              <div className="xab-limits__card">
                <h3><ShieldCheck aria-hidden="true" />Xroga handles</h3>
                <ul>
                  {data.outcomes.map((outcome) => (
                    <li key={outcome}>
                      <Check aria-hidden="true" />
                      <span>{outcome}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={100}>
              <div className="xab-limits__card xab-limits__card--accent">
                <h3><KeyRound aria-hidden="true" />Needs your approval</h3>
                <ul>
                  <li><Check aria-hidden="true" /><span>Payments and billing providers</span></li>
                  <li><Check aria-hidden="true" /><span>OAuth applications</span></li>
                  <li><Check aria-hidden="true" /><span>DNS and domain configuration</span></li>
                  <li><Check aria-hidden="true" /><span>Production stores and external systems</span></li>
                </ul>
              </div>
            </ScrollReveal>
          </div>

          {/* The capability data's limitation copy, reproduced in full. */}
          <p className="xab-limits__note">{data.limits}</p>
        </div>
      </section>

      {/* ------------------------------------------------------- scenic footer */}
      <footer className="xab-footer">
        <div className="xab-footer__media" aria-hidden="true">
          <Image
            src="/backgrounds/xroga-light-clouds-bg.png"
            alt=""
            fill
            loading="lazy"
            sizes="100vw"
          />
        </div>

        <div className="xab-footer__card">
          <div className="xab-footer__top">
            <div>
              <Logo href="/" variant="homepage" height={38} />
              <p className="xab-footer__blurb">
                The AI app builder that turns a product outcome into a working application
                you own and can read.
              </p>
              <Link href="/auth/signup" className="xab-cta">Build your app now</Link>
              <span className="xab-footer__note">
                <ShieldCheck aria-hidden="true" />
                Your repository, your provider accounts
              </span>
              <div className="xab-social">
                <a href="https://x.com/Xroga_AI" target="_blank" rel="noreferrer" aria-label="Xroga on X">𝕏</a>
                <a href="https://github.com/Xroga/xroga.com" target="_blank" rel="noreferrer" aria-label="Xroga on GitHub">
                  <GitHubIcon />
                </a>
                <a href="mailto:hello@xroga.com" aria-label="Email Xroga">
                  <Mail aria-hidden="true" />
                </a>
              </div>
            </div>

            {FOOTER_GROUPS.map((group) => (
              <div key={group.title} className="xab-footer__col">
                <h3>{group.title}</h3>
                <ul>
                  {group.links.map((link) => (
                    <li key={link.href}><Link href={link.href}>{link.label}</Link></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="xab-footer__bottom">
            <p className="xab-footer__legal">© {new Date().getFullYear()} Xroga. All rights reserved.</p>
            <div className="xab-footer__links">
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
