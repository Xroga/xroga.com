'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/layout/Logo';
import { HomepageChatBar } from '@/components/terminal/HomepageChatBar';
import '@/styles/homepage-coding.css';
import { createClient } from '@/lib/supabase/client';

const FOOTER_LINKS = [
  { href: '/features', label: 'Features' },
  { href: '/auth/signup', label: 'Sign Up' },
  { href: '/about', label: 'About Xroga' },
  { href: '/docs/api', label: 'API' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/refund', label: 'Refund' },
];

const AI_FEATURES = [
  {
    title: 'Converter → Builder',
    body: 'Any prompt becomes a clear builder brief, then ships as a real product — no template catalog.',
  },
  {
    title: 'Multi-model AI Swarm',
    body: 'Kimi for hard builds, GLM for long codebases, DeepSeek for volume, Grok for live intel.',
  },
  {
    title: 'Ship to GitHub & Vercel',
    body: 'Preview in the workspace, then push and deploy when you are ready — no fake URLs.',
  },
  {
    title: 'Deep research lane',
    body: 'Tavily and SearXNG gather sources; the swarm synthesizes reports you can actually use.',
  },
];

export default function HomePage() {
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState(false);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    createClient()
      .auth.getSession()
      .then(({ data: { session } }) => {
        setLoggedIn(!!session);
        setAuthReady(true);
      });
  }, []);

  const primaryHref = loggedIn ? '/workspace' : '/auth/signup';
  const primaryLabel = loggedIn ? 'Open Workspace' : 'Start Building';

  return (
    <div className="xv-homepage xv-home-coding min-h-screen flex flex-col">
      <section className="xv-hc-hero">
        <div className="xv-hc-hero-pattern" aria-hidden />

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
            NEW: MULTI-MODEL AI SWARM
          </p>

          <h1 className="xv-hc-brand">XROGA</h1>

          <p className="xv-hc-headline">
            AI That <span className="xv-hc-headline-em">Builds Your Stack</span> From One Prompt
          </p>

          <p className="xv-hc-sub">
            Describe the product. Our converter writes the brief. The swarm codes, previews, and
            prepares GitHub-ready files.
          </p>

          <div className="xv-hc-ctas">
            <button
              type="button"
              onClick={() => router.push(primaryHref)}
              className="xv-hc-btn-primary"
            >
              {primaryLabel}
            </button>
            <Link href="/pricing" className="xv-hc-btn-ghost">
              View Pricing
            </Link>
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
            Build better products. <em>Agents for your repo.</em> Models for every lane.
          </h2>
          <p className="xv-hc-section-copy">
            Full-stack sites, games, crypto tools, and long-horizon refactors — routed to the right
            model so you can ship for a full month without burning one engine.
          </p>
          <div className="xv-hc-mark" aria-hidden />
        </div>
      </section>

      <section className="xv-hc-features" aria-labelledby="features-heading">
        <div className="xv-hc-features-inner">
          <span className="xv-hc-features-label">WHAT WE SHIP</span>
          <div className="xv-hc-features-grid">
            <div>
              <h2 className="xv-hc-features-headline" id="features-heading">
                Swarm at full throttle. <em>Precision builds.</em>
              </h2>
              <p className="xv-hc-features-lead">
                One intelligent flow for any request — apps, games, research, and repo work —
                powered by official Kimi, GLM, Grok keys plus DeepSeek on OpenRouter.
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

      <footer className="xv-hc-footer">
        <nav aria-label="Footer">
          {FOOTER_LINKS.map(({ href, label }) => (
            <Link key={href} href={href}>
              {label}
            </Link>
          ))}
        </nav>
        <p>XROGA AI · BLACK HOLE V∞ · SHIP SOMETHING LEGENDARY</p>
      </footer>
    </div>
  );
}
