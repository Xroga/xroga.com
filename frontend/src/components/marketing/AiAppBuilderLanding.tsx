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
import heroStyles from './AiAppBuilderHero.module.css';

import type { CapabilityPageData } from '@/lib/capabilityPages';

import '@/styles/homepage-coding.css';
import '@/styles/ai-app-builder-landing.css';

/**
 * Existing hero image is intentionally retained here.
 *
 * AiAppBuilderHero.module.css hides this image and renders
 * the new hosted castle landscape as the actual hero background:
 *
 * https://i.postimg.cc/P5vZpY2b/image.png
 *
 * Keeping the existing Next/Image in the DOM means we do not need
 * to restructure the rest of the landing component.
 */
const HERO_IMAGE =
  '/backgrounds/bg-desktop-4-blackhole-nebula.webp';

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
      {
        href: '/video',
        label: 'Xroga Video',
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
      className={`xab-page ${heroStyles.page}`}
    >
      <PageJsonLd
        path={`/${data.slug}`}
        name={data.title}
        description={data.description}
      />

      {/* =========================================================
          HERO
          ========================================================= */}

      <section className="xab-hero">
        <div
          className="xab-hero__media"
          aria-hidden="true"
        >
          <Image
            src={HERO_IMAGE}
            alt=""
            fill
            priority
            sizes="100vw"
          />
        </div>

        <div
          className="xab-hero__scrim"
          aria-hidden="true"
        />

        <AiAppBuilderHeader />

        <div className="xab-shell xab-hero__body">
          <h1 className="xab-hero__title">
            Describe an app.{' '}
            <span className="xab-accent">
              Xroga builds it.
            </span>
          </h1>

          <AiAppBuilderPrompt />

          <p className="xab-hero__note">
            {data.eyebrow}
          </p>
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
                Design, build, and ship with AI
                at the core
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
                From outcome to proven result
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
