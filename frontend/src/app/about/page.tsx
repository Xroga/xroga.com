import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Check, CircleDot, GitBranch, Hammer, ShieldCheck, Telescope } from 'lucide-react';
import { buildMetadata } from '@/lib/seo';
import { COMPANY_CONTACT } from '@/lib/companyContact';
import { GitHubIcon } from '@/components/icons/GitHubIcon';
import { AboutArt } from '@/components/about/AboutArt';
import { AboutProductVisual } from '@/components/about/AboutProductVisual';
import { AboutFaq } from '@/components/about/AboutFaq';
import {
  ABOUT_ART,
  ABOUT_CAPABILITIES,
  ABOUT_EXECUTION,
  ABOUT_FAQS,
  ABOUT_FINAL_CTA,
  ABOUT_FOUNDER,
  ABOUT_HERO,
  ABOUT_SOCIALS,
  ABOUT_STEPS,
} from '@/lib/aboutContent';
import '@/styles/about.css';
import { PageJsonLd } from '@/components/seo/PageJsonLd';
import { Logo } from '@/components/layout/Logo';
import { HomepageShipStack } from '@/components/homepage/HomepageShipStack';
import { HomepageEnterpriseProof } from '@/components/homepage/HomepageEnterpriseProof';
import '@/styles/homepage-coding.css';
import { MarketingFooter } from '@/components/layout/MarketingFooter';

export const metadata: Metadata = buildMetadata({
  title: 'About Xroga AI & CEO Muhammad Ibrahim',
  description: COMPANY_CONTACT.productDescription,
  path: '/about',
  keywords: ['about Xroga', 'Muhammad Ibrahim CEO', 'Pakistan AI founder', 'Xroga mission'],
});

const CAPABILITY_ICONS = { build: Hammer, verify: ShieldCheck, publish: GitBranch, research: Telescope } as const;

const NAV = [
  { href: '/features', label: 'Product', current: false },
  { href: '#how-it-works', label: 'How it works', current: false },
  { href: '/about', label: 'About', current: true },
  { href: '#faq', label: 'FAQ', current: false },
  { href: '/contact', label: 'Contact', current: false },
] as const;

export default function AboutPage() {
  return (
    <div className="ab-root">
      <PageJsonLd
        path="/about"
        name="About XROGA AI"
        description={COMPANY_CONTACT.productDescription}
        type="AboutPage"
      />

      {/* --------------------------------------------------------- navigation */}
      <header className="ab-nav">
        <div className="ab-shell ab-nav-inner">
          <Link href="/" className="ab-logo">
            <Logo href={null} variant="homepage" height={36} />
          </Link>

          <nav className="ab-nav-links" aria-label="Primary">
            {NAV.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                aria-current={item.current ? 'page' : undefined}
                className={item.current ? 'is-current' : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <Link href="/auth/signup" className="ab-btn ab-btn--primary ab-btn--sm">
            Get Started
          </Link>
        </div>
      </header>

      <main>
        {/* ------------------------------------------------------------- hero */}
        <section className="ab-section ab-hero">
          <div className="ab-shell ab-hero-grid">
            <div>
              <div className="ab-origin-badge"><span>AI</span> Independent AI coding agent</div>
              <p className="ab-eyebrow">{ABOUT_HERO.eyebrow}</p>
              <h1 className="ab-h1">{ABOUT_HERO.headline}</h1>
              <p className="ab-lede">{ABOUT_HERO.body}</p>

              <div className="ab-cta-row">
                <Link href={ABOUT_HERO.primaryCta.href} className="ab-btn ab-btn--primary">
                  {ABOUT_HERO.primaryCta.label}
                  <ArrowRight className="ab-icon-sm" aria-hidden="true" />
                </Link>
                <Link href={ABOUT_HERO.secondaryCta.href} className="ab-btn ab-btn--ghost">
                  {ABOUT_HERO.secondaryCta.label}
                </Link>
              </div>

              <ul className="ab-trust" aria-label="What Xroga connects to">
                {ABOUT_HERO.trustLine.map((item) => (
                  <li key={item}>
                    <CircleDot className="ab-icon-xs" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <AboutProductVisual variant="hero" />
          </div>
        </section>

        {/* The full product loop belongs near the top of About. Keeping it in the
            same themed system as the homepage makes the brand and release obvious. */}
        <div className="xv-home-coding ab-product-systems" id="real-ship-loop">
          <HomepageShipStack />
          <HomepageEnterpriseProof />
        </div>

        {/* ---------------------------------------------------- how it works */}
        <section className="ab-section" id="how-it-works" aria-labelledby="ab-how-heading">
          <div className="ab-shell ab-split">
            <AboutProductVisual variant="workflow" />

            <div>
              <p className="ab-eyebrow">HOW XROGA WORKS</p>
              <h2 id="ab-how-heading" className="ab-h2">
                Three steps, no guesswork.
              </h2>

              <ol className="ab-steps">
                {ABOUT_STEPS.map((step) => (
                  <li key={step.number} className="ab-step ab-reveal">
                    <span className="ab-step-num" aria-hidden>
                      {step.number}
                    </span>
                    <div>
                      <h3 className="ab-step-title">{step.title}</h3>
                      <p className="ab-body">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------ capabilities */}
        <section className="ab-section" aria-labelledby="ab-cap-heading">
          <div className="ab-shell">
            <p className="ab-eyebrow">WHAT WE SHIP</p>
            <h2 id="ab-cap-heading" className="ab-h2">
              Coding agent that ships. <em>Same repo, forever.</em>
            </h2>
            <p className="ab-lede">Xroga AI connects prompt → brief → code → QA → your GitHub → your Vercel. Edit, update, and delete without starting over.</p>

            <div className="ab-cards">
              {ABOUT_CAPABILITIES.map((capability) => {
                const Icon = CAPABILITY_ICONS[capability.id as keyof typeof CAPABILITY_ICONS];
                return (
                  <article key={capability.id} className="ab-card ab-reveal">
                    <span className="ab-card-icon" aria-hidden>
                      <Icon className="ab-icon-sm" />
                    </span>
                    <h3 className="ab-card-title">{capability.title}</h3>
                    <p className="ab-body">{capability.body}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* -------------------------------------------------- built for execution */}
        <section className="ab-section" aria-labelledby="ab-exec-heading">
          <div className="ab-shell ab-split">
            <AboutProductVisual variant="verify" />

            <div>
              <p className="ab-eyebrow">BUILT FOR EXECUTION</p>
              <h2 id="ab-exec-heading" className="ab-h2">
                {ABOUT_EXECUTION.heading}
              </h2>
              <p className="ab-lede">{ABOUT_EXECUTION.body}</p>

              <ul className="ab-checklist">
                {ABOUT_EXECUTION.checklist.map((item) => (
                  <li key={item}>
                    <Check className="ab-icon-sm ab-check" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- founder */}
        <section className="ab-section" id="founder" aria-labelledby="ab-founder-heading">
          <div className="ab-shell">
            <div className="ab-founder">
              <AboutArt
                src={ABOUT_ART.founder}
                alt={`${ABOUT_FOUNDER.name}, founder of Xroga AI`}
                className="ab-founder-art"
              />

              <div>
                <p className="ab-eyebrow">FOUNDER</p>
                <h2 id="ab-founder-heading" className="ab-h2">
                  {ABOUT_FOUNDER.name}
                </h2>
                <p className="ab-founder-role">{ABOUT_FOUNDER.role}</p>
                {ABOUT_FOUNDER.paragraphs.map((paragraph) => (
                  <p key={paragraph} className="ab-body">
                    {paragraph}
                  </p>
                ))}

                <div className="ab-founder-links">
                  <a href={ABOUT_SOCIALS.x} target="_blank" rel="noreferrer noopener" className="ab-chip-link">
                    {/* X ships no lucide glyph; the wordmark carries the label. */}
                    <span aria-hidden className="ab-x-mark">
                      X
                    </span>
                    Xroga on X
                  </a>
                  <a href={ABOUT_SOCIALS.github} target="_blank" rel="noreferrer noopener" className="ab-chip-link">
                    <GitHubIcon className="ab-icon-sm" />
                    GitHub
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- contact */}
        <section className="ab-section" aria-labelledby="ab-contact-heading">
          <div className="ab-shell">
            <div className="ab-contact">
              <div>
                <h2 id="ab-contact-heading" className="ab-h3">
                  Talk to us
                </h2>
                <p className="ab-body">Real people read these.</p>
              </div>

              <dl className="ab-contact-rows">
                <div>
                  <dt>Email</dt>
                  <dd>
                    <a href={`mailto:${COMPANY_CONTACT.email}`}>{COMPANY_CONTACT.email}</a>
                  </dd>
                </div>
                <div>
                  <dt>Phone</dt>
                  <dd>
                    <a href={`tel:${COMPANY_CONTACT.phoneTel}`}>{COMPANY_CONTACT.phoneDisplay}</a>
                  </dd>
                </div>
              </dl>

              <nav className="ab-contact-links" aria-label="Company and legal">
                <Link href="/contact">Contact</Link>
                <Link href="/terms">Terms</Link>
                <Link href="/privacy">Privacy</Link>
                <Link href="/refund">Refund Policy</Link>
              </nav>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------------- faq */}
        <section className="ab-section" id="faq" aria-labelledby="ab-faq-heading">
          <div className="ab-shell ab-shell--narrow">
            <p className="ab-eyebrow">FAQ</p>
            <h2 id="ab-faq-heading" className="ab-h2">
              Questions worth answering.
            </h2>
            <AboutFaq items={ABOUT_FAQS} />
          </div>
        </section>

        {/* -------------------------------------------------------- final cta */}
        <section className="ab-section" aria-labelledby="ab-cta-heading">
          <div className="ab-shell">
            <div className="ab-panel ab-panel--dark ab-final">
              <h2 id="ab-cta-heading" className="ab-h2 ab-h2--light">
                {ABOUT_FINAL_CTA.headline}
              </h2>
              <p className="ab-body ab-body--light">{ABOUT_FINAL_CTA.body}</p>
              <div className="ab-cta-row">
                <Link href={ABOUT_FINAL_CTA.primary.href} className="ab-btn ab-btn--primary">
                  {ABOUT_FINAL_CTA.primary.label}
                  <ArrowRight className="ab-icon-sm" aria-hidden="true" />
                </Link>
                <Link href={ABOUT_FINAL_CTA.secondary.href} className="ab-btn ab-btn--onDark">
                  {ABOUT_FINAL_CTA.secondary.label}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
