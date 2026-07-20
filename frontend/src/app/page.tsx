'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/layout/Logo';
import { HomepageChatBar } from '@/components/terminal/HomepageChatBar';
import { HomepagePipelineDemo } from '@/components/homepage/HomepagePipelineDemo';
import { HomepageEmpowerSection } from '@/components/homepage/HomepageEmpowerSection';
import { HomepageBlackHolePower } from '@/components/homepage/HomepageBlackHolePower';
import { HomepageShipStack } from '@/components/homepage/HomepageShipStack';
import { HomepageEnterpriseProof } from '@/components/homepage/HomepageEnterpriseProof';
import { HomepageCompareSection } from '@/components/homepage/HomepageCompareSection';
import { HomepageFaqSection } from '@/components/homepage/HomepageFaqSection';
import '@/styles/homepage-coding.css';
import { createClient } from '@/lib/supabase/client';

const FOOTER_LINKS = [
  { href: '/features', label: 'Features' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/refund', label: 'Refund' },
  { href: '/auth/signup', label: 'Sign Up' },
];

const AI_FEATURES = [
  {
    title: 'Converter → Builder → Ship',
    body: 'Pulse briefs · Apex/Horizon/Forge build · sticky GitHub + Vercel live — one continuous loop.',
  },
  {
    title: '#1 Coding Agent',
    body: 'Black Hole V∞: frontier coding depth, long-context repos, live web+X research — no vendor model picker.',
  },
  {
    title: 'GitHub push · Vercel live',
    body: 'Preview in Workspace, auto-push the sticky repo, go live on your domain — ownership stays yours.',
  },
  {
    title: 'Research that ships',
    body: 'Gather live sources when needed, then turn findings into code in the same flow — never a fake research step.',
  },
];

const HERO_BUILD_WORDS = [
  'Websites',
  'SaaS apps',
  'Hackathon MVPs',
  'Landing pages',
  'Dashboards',
  'Internal tools',
  'Your stack',
] as const;

export default function HomePage() {
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [buildWordIdx, setBuildWordIdx] = useState(0);

  useEffect(() => {
    createClient()
      .auth.getSession()
      .then(({ data: { session } }) => {
        setLoggedIn(!!session);
        setAuthReady(true);
      });
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => {
      setBuildWordIdx((i) => (i + 1) % HERO_BUILD_WORDS.length);
    }, 2400);
    return () => window.clearInterval(t);
  }, []);

  const primaryHref = loggedIn ? '/workspace' : '/auth/signup';
  const primaryLabel = loggedIn ? 'Open Workspace' : 'Start Building';

  return (
    <div className="xv-homepage xv-home-coding min-h-screen flex flex-col">
      <div
        className="xv-hc-bg-image"
        style={{ backgroundImage: 'url("/backgrounds/xroga-deep-work-bg.webp")' }}
        aria-hidden
      />

      <section className="xv-hc-hero">
        <header className="xv-hc-header">
          <div className="xv-hc-header-inner">
            <Logo href="/" variant="homepage" height={64} className="shrink-0" />
            {authReady && (
              <div className="flex items-center gap-2">
                {!loggedIn && (
                  <Link href="/auth/login" className="xv-hc-btn-ghost !min-h-[2.4rem] !px-4 !text-[0.7rem]">
                    Sign In
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => router.push(loggedIn ? '/workspace' : '/auth/signup')}
                  className="xv-hc-btn-primary !min-h-[2.4rem] !px-4 !text-[0.7rem]"
                >
                  {loggedIn ? 'Dashboard' : 'Get Started'}
                </button>
              </div>
            )}
          </div>
        </header>

        <div className="xv-hc-hero-main">
          <p className="xv-hc-badge">
            <span className="xv-hc-badge-dot" aria-hidden />
            NEW: XROGA AI SWARM
          </p>

          <h1 className="xv-hc-brand">XROGA</h1>

          <p className="xv-hc-headline">
            AI That <span className="xv-hc-headline-em">Builds & Ships</span>{' '}
            <span className="xv-hc-headline-rotator" aria-live="polite">
              <span key={HERO_BUILD_WORDS[buildWordIdx]} className="xv-hc-headline-word">
                {HERO_BUILD_WORDS[buildWordIdx]}
              </span>
            </span>
          </p>

          <p className="xv-hc-sub">
            Describe the product. Converter writes the brief. The swarm codes, debugs, pushes to
            your GitHub, and deploys live on Vercel — then you iterate with follow-up prompts.
          </p>

          <div className="xv-hc-ctas">
            <button
              type="button"
              onClick={() => router.push(primaryHref)}
              className="xv-hc-btn-primary"
            >
              {primaryLabel}
            </button>
            <a href="#ship-loop" className="xv-hc-btn-ghost">
              See how it ships
            </a>
          </div>

          <div className="xv-hc-chat xv-home-chatbar-wrap">
            <HomepageChatBar />
          </div>
        </div>
      </section>

      <section className="xv-hc-section" aria-labelledby="coding-heading">
        <div className="xv-hc-section-inner">
          <p className="xv-hc-pixel-kicker" id="coding-heading">
            CODING
          </p>
          <h2 className="xv-hc-section-title">
            Build better products. <em>Agents for your repo.</em> One modern flow.
          </h2>
          <p className="xv-hc-section-copy">
            Prompt in Workspace → analyze → build → debug → push GitHub → live on Vercel with your
            domain. Continuous loop, not a one-shot demo.
          </p>
          <div className="xv-hc-mark" aria-hidden />
        </div>
      </section>

      <section className="xv-hc-live" id="ship-loop" aria-label="Live build simulation">
        <div className="xv-hc-live-inner">
          <HomepagePipelineDemo />
        </div>
      </section>

      <HomepageEmpowerSection />

      {/* Additional sections — existing homepage content above unchanged */}
      <HomepageBlackHolePower />

      <section className="xv-hc-features" aria-labelledby="features-heading">
        <div className="xv-hc-features-inner">
          <span className="xv-hc-features-label">WHAT WE SHIP</span>
          <div className="xv-hc-features-grid">
            <div>
              <h2 className="xv-hc-features-headline" id="features-heading">
                Coding agent that ships. <em>Same repo, forever.</em>
              </h2>
              <p className="xv-hc-features-lead">
                Xroga AI is the #1 coding agent for everyone: prompt → brief → code → QA → your
                GitHub → your Vercel. Edit, update, and delete without starting over — no coding
                knowledge required to start.
              </p>
            </div>
            <ul className="xv-hc-feature-list">
              {AI_FEATURES.map((f) => (
                <li key={f.title}>
                  <strong>{f.title}</strong>
                  <span>{f.body}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <HomepageShipStack />

      <HomepageEnterpriseProof />

      <HomepageCompareSection />

      <HomepageFaqSection />

      <section className="xv-hc-mid-cta" aria-label="Start building">
        <div className="xv-hc-mid-cta-inner">
          <h2 className="xv-hc-section-title">Ready when you are.</h2>
          <p className="xv-hc-section-copy">
            Start from a prompt. Own the repo. Ship on your domain.
          </p>
          <div className="xv-hc-ctas">
            <button
              type="button"
              onClick={() => router.push(primaryHref)}
              className="xv-hc-btn-primary"
            >
              {primaryLabel}
            </button>
            <Link href="/contact" className="xv-hc-btn-ghost">
              Contact
            </Link>
          </div>
        </div>
      </section>

      <footer className="xv-hc-footer">
        <nav aria-label="Footer">
          {FOOTER_LINKS.map(({ href, label }) => (
            <Link key={href} href={href}>
              {label}
            </Link>
          ))}
        </nav>
        <p className="xv-hc-footer-meta">
          XROGA AI · <a href="mailto:hello@xroga.com">hello@xroga.com</a> ·{' '}
          <Link href="/contact">Contact</Link> · <Link href="/terms">Terms</Link> ·{' '}
          <Link href="/privacy">Privacy</Link> · <Link href="/refund">Refund</Link>
        </p>
      </footer>
    </div>
  );
}
