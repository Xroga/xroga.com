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
import { ThemeBackdrop } from '@/components/layout/ThemeBackdrop';
import { GitHubIcon } from '@/components/icons/GitHubIcon';
import { ScrollReveal } from './ScrollReveal';
import { PageJsonLd } from '@/components/seo/PageJsonLd';
import { HomepageWorkspaceTour } from '@/components/homepage/HomepageWorkspaceTour';
import { AiAppBuilderPrompt } from './AiAppBuilderPrompt';
import { AiAppBuilderWatercolor } from './AiAppBuilderWatercolor';
import { AiAppBuilderFeatureTabs } from './AiAppBuilderFeatureTabs';
import heroStyles from './AiAppBuilderHero.module.css';

import type { CapabilityPageData } from '@/lib/capabilityPages';

import '@/styles/homepage-coding.css';
import '@/styles/ai-app-builder-landing.css';

const APP_BUILDER_FAQS = [
  {
    question: 'Can I create an app for free with Xroga?',
    answer: 'Yes. Xroga has a $0 Free plan with no credit card required. It includes monthly AI capacity for starting and building smaller projects; larger or sustained builds may need more capacity.',
  },
  {
    question: 'Can I create an app in minutes?',
    answer: 'You can describe an app idea and begin a build in minutes. Completing, testing, and deploying a working app depends on its scope, integrations, and available capacity.',
  },
  {
    question: 'Is Xroga a no-code AI builder?',
    answer: 'You can start with a plain-language prompt without writing code yourself. Unlike a closed no-code editor, Xroga works with readable source files you can inspect and maintain.',
  },
  {
    question: 'Is Xroga an AI mobile app builder?',
    answer: 'Xroga can help with mobile-friendly web applications and supported app projects. Native iOS or Android builds and app-store publishing depend on the chosen stack and external setup; they are not guaranteed by this page.',
  },
  {
    question: 'What kinds of apps can I build with AI?',
    answer: 'Supported projects include web apps, dashboards, SaaS products, portals, and API-backed tools. Real integrations, testing, and publishing require appropriate configuration and authorization.',
  },
] as const;

const FOOTER_GROUPS = [
  {
    title: 'Product',
    links: [
      {
        href: '/features',
        label: 'Features',
      },
      {
        href: '/integrations',
        label: 'Integrations',
      },
      {
        href: '/showcase',
        label: 'Showcase',
      },
      {
        href: '/pricing',
        label: 'Pricing',
      },
    ],
  },

  {
    title: 'Resources',
    links: [
      {
        href: '/docs',
        label: 'Docs',
      },
      {
        href: '/research',
        label: 'Research',
      },
      {
        href: '/community',
        label: 'Community',
      },
    ],
  },

  {
    title: 'Company',
    links: [
      {
        href: '/about',
        label: 'About',
      },
      {
        href: '/contact',
        label: 'Contact',
      },
      {
        href: '/crypto',
        label: 'Crypto Builder',
      },
      {
        href: '/game-builder',
        label: 'Game Builder',
      },
    ],
  },
] as const;

export function AiAppBuilderLanding({
  data,
}: {
  data: CapabilityPageData;
}) {
  return (
    <div
      className={`xab-page xv-theme-surface ${heroStyles.page}`}
    >
      <ThemeBackdrop />

      <PageJsonLd
        path={`/${data.slug}`}
        name={data.title}
        description={data.description}
      />

      {/* =========================================================
          HERO
          ========================================================= */}

      <section className="xab-hero">
  <AiAppBuilderWatercolor
    className={heroStyles.watercolor}
  />

  <div className="xab-shell xab-hero__body">
          <h1 className="xab-hero__title">
            Free AI App Builder.{' '}
            <span className="xab-accent">
              Turn ideas into apps.
            </span>
          </h1>

          <p className="xab-hero__lede">
            Create an app for free with AI. Start with a prompt, work with
            inspectable code, and verify the result before you ship.
          </p>

          <AiAppBuilderPrompt />
        </div>
      </section>

      {/* =========================================================
          BLUE PRODUCT SECTION
          ========================================================= */}

      <section
        className="xab-blue"
        aria-labelledby="xab-platform-heading"
      >
        <div
          className="xab-blue__dots"
          aria-hidden="true"
        />

        <div className="xab-shell xab-blue__grid">
          <ScrollReveal>
            <div>
              <p className="xab-pill">
                <Wand2 aria-hidden="true" />

                AI-powered product building
              </p>

              <h2
                className="xab-h2"
                id="xab-platform-heading"
              >
                Create Apps Without Coding.
                Keep the code.
              </h2>

              <p className="xab-blue__lede">
                {data.intro}
              </p>

              <ul className="xab-checks">
                {data.outcomes.map(
                  (outcome) => (
                    <li key={outcome}>
                      <Check
                        aria-hidden="true"
                      />

                      <span>
                        {outcome}
                      </span>
                    </li>
                  )
                )}
              </ul>

              <div className="xab-blue__actions">
                <Link
                  href="/auth/signup"
                  className="xab-cta xab-cta--lg"
                >
                  Start building free
                </Link>

                <Link
                  href="/features"
                  className="xab-textlink"
                >
                  See how it works

                  <ArrowRight
                    aria-hidden="true"
                  />
                </Link>
              </div>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={120}>
            <div className="xab-preview xv-home-coding">
              <HomepageWorkspaceTour
                loggedIn={false}
              />
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* =========================================================
          DARK FEATURES / BENTO
          ========================================================= */}

      <section
        className="xab-dark"
        aria-labelledby="xab-capabilities-heading"
      >
        <div className="xab-shell xab-dark__head">
          <p className="xab-pill xab-pill--dark">
            Powerful by design
          </p>

          <h2
            className="xab-h2"
            id="xab-capabilities-heading"
          >
            Everything you need to build{' '}
            <span className="xab-accent">
              exceptional apps
            </span>
          </h2>

          <AiAppBuilderFeatureTabs />
        </div>
      </section>

      {/* Search-intent guide: real product detail, not hidden keyword text. */}
      <section className="xab-discover" aria-labelledby="xab-discover-heading">
        <div className="xab-shell">
          <div className="xab-section-head">
            <p className="xab-pill xab-pill--light">Free AI App Builder &amp; Generator</p>
            <h2 className="xab-h2" id="xab-discover-heading">
              An AI app creator that takes ideas to working software
            </h2>
            <p>
              Xroga is a free AI app builder to start with, not a promise of
              unlimited generation. Describe what you need, then build AI apps,
              business tools, or web products with readable code and checks.
              See the <Link href="/pricing">Free plan and limits</Link>.
            </p>
          </div>
          <div className="xab-discover__grid">
            <article className="xab-discover__card">
              <h3>No Code AI Builder, with code you can own</h3>
              <p>
                No programming experience is needed to describe the first
                version. Xroga creates inspectable project files instead of
                hiding your app inside a closed editor.
              </p>
              <Link href="/docs/getting-started">How to get started <ArrowRight aria-hidden="true" /></Link>
            </article>
            <article className="xab-discover__card">
              <h3>Start creating an app in minutes</h3>
              <p>
                Turn an idea into a build brief in minutes. Implementation,
                testing, and deployment may take longer depending on
                requirements and connected services.
              </p>
              <Link href="/build">Explore app types <ArrowRight aria-hidden="true" /></Link>
            </article>
            <article className="xab-discover__card">
              <h3>Build apps with AI, APIs, and data</h3>
              <p>
                Go beyond a static mockup: request interfaces, APIs,
                persistent data, and authorized integrations for supported
                projects, including SaaS and dashboards.
              </p>
              <Link href="/showcase">Explore examples <ArrowRight aria-hidden="true" /></Link>
            </article>
          </div>
        </div>
      </section>

      {/* =========================================================
          PROCESS
          ========================================================= */}

      <section
        className="xab-process"
        aria-labelledby="xab-process-heading"
      >
        <div className="xab-shell">
          <ScrollReveal>
            <div className="xab-section-head">
              <p className="xab-pill xab-pill--light">
                How it works
              </p>

              <h2
                className="xab-h2"
                id="xab-process-heading"
              >
                Ideas to apps: from prompt to proven result
              </h2>

              <p>
                Three stages, in order. The last
                one is what decides whether the
                work is actually done.
              </p>
            </div>
          </ScrollReveal>

          <ol
            className="xab-steps"
            role="list"
          >
            {data.process.map(
              (step, index) => (
                <ScrollReveal
                  key={step.title}
                  delay={index * 90}
                >
                  <li className="xab-step">
                    <span
                      className="xab-step__node"
                      aria-hidden="true"
                    >
                      {String(
                        index + 1
                      ).padStart(
                        2,
                        '0'
                      )}
                    </span>

                    <h3>
                      {step.title}
                    </h3>

                    <p>
                      {step.body}
                    </p>
                  </li>
                </ScrollReveal>
              )
            )}
          </ol>
        </div>
      </section>

      {/* =========================================================
          REPOSITORY / OWNERSHIP
          ========================================================= */}

      <section
        className="xab-repo"
        aria-labelledby="xab-repo-heading"
      >
        <div className="xab-shell xab-repo__grid">
          <ScrollReveal>
            <div>
              <p className="xab-pill xab-pill--light">
                Ownership
              </p>

              <h2
                className="xab-h2"
                id="xab-repo-heading"
              >
                Your code. Your repository.{' '}
                <span className="xab-accent">
                  Your control.
                </span>
              </h2>

              <p
                className="xab-section-head"
                style={{
                  marginBottom: 0,
                }}
              >
                What Xroga produces stays
                inspectable. You can read every
                file, review every change, and take
                the project elsewhere — the work is
                not locked inside a visual editor,
                and provider ownership stays in your
                accounts.
              </p>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={120}>
            <div className="xab-panel">
              <div className="xab-panel__bar">
                <FolderGit2
                  aria-hidden="true"
                />

                <span>
                  your-app
                </span>

                <span className="xab-panel__demo">
                  Interface demonstration
                </span>
              </div>

              <ul className="xab-tree">
                <li>
                  <FolderGit2
                    aria-hidden="true"
                  />

                  app/
                </li>

                <li className="xab-tree__nest">
                  <FileCode2
                    aria-hidden="true"
                  />

                  page.tsx
                </li>

                <li className="xab-tree__nest">
                  <FileCode2
                    aria-hidden="true"
                  />

                  api/route.ts
                </li>

                <li>
                  <FolderGit2
                    aria-hidden="true"
                  />

                  components/
                </li>

                <li className="xab-tree__nest">
                  <FileCode2
                    aria-hidden="true"
                  />

                  dashboard.tsx
                </li>

                <li>
                  <FileCode2
                    aria-hidden="true"
                  />

                  schema.sql
                </li>

                <li>
                  <FileCode2
                    aria-hidden="true"
                  />

                  dashboard.test.ts
                </li>
              </ul>

              <div className="xab-checkrow">
                <span>
                  <CircleCheck
                    aria-hidden="true"
                  />

                  Typecheck
                </span>

                <span>
                  <CircleCheck
                    aria-hidden="true"
                  />

                  Tests
                </span>

                <span>
                  <CircleCheck
                    aria-hidden="true"
                  />

                  Build
                </span>

                <span>
                  <CircleCheck
                    aria-hidden="true"
                  />

                  Runtime checks
                </span>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* =========================================================
          LIMITATIONS / CONTROL
          ========================================================= */}

      <section
        className="xab-limits"
        aria-labelledby="xab-limits-heading"
      >
        <div className="xab-shell">
          <ScrollReveal>
            <div className="xab-section-head">
              <p className="xab-pill xab-pill--light">
                Honest boundaries
              </p>

              <h2
                className="xab-h2"
                id="xab-limits-heading"
              >
                What Xroga handles, and what still
                needs you
              </h2>
            </div>
          </ScrollReveal>

          <div className="xab-limits__grid">
            <ScrollReveal>
              <div className="xab-limits__card">
                <h3>
                  <ShieldCheck
                    aria-hidden="true"
                  />

                  Xroga handles
                </h3>

                <ul>
                  {data.outcomes.map(
                    (outcome) => (
                      <li key={outcome}>
                        <Check
                          aria-hidden="true"
                        />

                        <span>
                          {outcome}
                        </span>
                      </li>
                    )
                  )}
                </ul>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={100}>
              <div className="xab-limits__card xab-limits__card--accent">
                <h3>
                  <KeyRound
                    aria-hidden="true"
                  />

                  Needs your approval
                </h3>

                <ul>
                  <li>
                    <Check
                      aria-hidden="true"
                    />

                    <span>
                      Payments and billing
                      providers
                    </span>
                  </li>

                  <li>
                    <Check
                      aria-hidden="true"
                    />

                    <span>
                      OAuth applications
                    </span>
                  </li>

                  <li>
                    <Check
                      aria-hidden="true"
                    />

                    <span>
                      DNS and domain
                      configuration
                    </span>
                  </li>

                  <li>
                    <Check
                      aria-hidden="true"
                    />

                    <span>
                      Production stores and
                      external systems
                    </span>
                  </li>
                </ul>
              </div>
            </ScrollReveal>
          </div>

          <p className="xab-limits__note">
            {data.limits}
          </p>
        </div>
      </section>

      <section className="xab-faq" aria-labelledby="xab-faq-heading">
        <div className="xab-shell">
          <div className="xab-section-head">
            <p className="xab-pill xab-pill--light">AI app builder questions</p>
            <h2 className="xab-h2" id="xab-faq-heading">
              What to know before you build an app for free
            </h2>
            <p>
              Clear answers about free access, no-code creation, mobile
              projects, and what it takes to ship working software.
            </p>
          </div>
          <div className="xab-faq__grid">
            {APP_BUILDER_FAQS.map(({ question, answer }) => (
              <article className="xab-faq__item" key={question}>
                <h3>{question}</h3>
                <p>{answer}</p>
              </article>
            ))}
          </div>
          <p className="xab-faq__links">
            Ready to try? <Link href="/auth/signup">Start building free</Link>.
            For technical steps, read the <Link href="/docs">documentation</Link>
            or compare <Link href="/pricing">Free and Pro plans</Link>.
          </p>
        </div>
      </section>

      {/* =========================================================
          FOOTER
          ========================================================= */}

      <footer className="xab-footer">
        <div
          className="xab-footer__media"
          aria-hidden="true"
        >
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
              <Logo
                href="/"
                variant="homepage"
                height={38}
              />

              <p className="xab-footer__blurb">
                The AI app builder that turns a
                product outcome into a working
                application you own and can read.
              </p>

              <Link
                href="/auth/signup"
                className="xab-cta"
              >
                Build your app now
              </Link>

              <span className="xab-footer__note">
                <ShieldCheck
                  aria-hidden="true"
                />

                Your repository, your provider
                accounts
              </span>

              <div className="xab-social">
                <a
                  href="https://x.com/Xroga_AI"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Xroga on X"
                >
                  𝕏
                </a>

                <a
                  href="https://github.com/Xroga/xroga.com"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Xroga on GitHub"
                >
                  <GitHubIcon />
                </a>

                <a
                  href="mailto:hello@xroga.com"
                  aria-label="Email Xroga"
                >
                  <Mail
                    aria-hidden="true"
                  />
                </a>
              </div>
            </div>

            {FOOTER_GROUPS.map(
              (group) => (
                <div
                  key={group.title}
                  className="xab-footer__col"
                >
                  <h3>
                    {group.title}
                  </h3>

                  <ul>
                    {group.links.map(
                      (link) => (
                        <li
                          key={
                            link.href
                          }
                        >
                          <Link
                            href={
                              link.href
                            }
                          >
                            {
                              link.label
                            }
                          </Link>
                        </li>
                      )
                    )}
                  </ul>
                </div>
              )
            )}
          </div>

          <div className="xab-footer__bottom">
            <p className="xab-footer__legal">
              ©{' '}
              {new Date().getFullYear()}{' '}
              Xroga. All rights reserved.
            </p>

            <div className="xab-footer__links">
              <Link href="/privacy">
                Privacy
              </Link>

              <Link href="/terms">
                Terms
              </Link>

              <Link href="/refund">
                Refund
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
