'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/layout/Logo';
import { HomepageChatBar } from '@/components/terminal/HomepageChatBar';
import { HomepageShipStack } from '@/components/homepage/HomepageShipStack';
import { HomepageEnterpriseProof } from '@/components/homepage/HomepageEnterpriseProof';
import { HomepageFaqSection } from '@/components/homepage/HomepageFaqSection';
import { HomepageAnnouncementBanner } from '@/components/homepage/HomepageAnnouncementBanner';
import { HomepageShowcase } from '@/components/showcase/HomepageShowcase';
import '@/styles/homepage-coding.css';
import { createClient } from '@/lib/supabase/client';
import { HomepageCompanionStage } from '@/components/companion/CompanionSurfaces';
import { HomepageThemeSwitcher } from '@/components/companion/HomepageThemeSwitcher';
import { FeedbackModal } from '@/components/feedback/FeedbackModal';
import { useCompanionStore } from '@/store/useCompanionStore';
import { LayoutDashboard } from 'lucide-react';

const FOOTER_LINKS = [
  { href: '/features', label: 'Features' },
  { href: '/community', label: 'Community' },
  { href: '/docs', label: 'Docs' },
  { href: '/crypto-builder', label: 'Crypto Builder' },
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
    body: 'Understand the outcome · implement focused changes · verify · push the sticky GitHub repo · publish with evidence.',
  },
  {
    title: 'Automatic capability routing',
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
  'Chrome extensions',
  'Desktop software',
  'Android apps',
  'iOS apps',
  'Mobile apps',
  'Debug errors',
  'Landing pages',
  'Dashboards',
  'Your stack',
] as const;

export default function HomePage() {
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [buildWordIdx, setBuildWordIdx] = useState(0);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const hydrateCompanion = useCompanionStore((state) => state.hydratePreferences);

  useEffect(() => {
    let active = true;
    try {
      createClient()
        .auth.getSession()
        .then(({ data: { session } }) => {
          if (!active) return;
          setLoggedIn(!!session);
          setAuthReady(true);
          if (session?.user.id) {
            void createClient().from('profiles').select('display_name').eq('id', session.user.id).maybeSingle().then(({ data }) => {
              hydrateCompanion({}, typeof data?.display_name === 'string' ? data.display_name : null);
            });
          }
        })
        .catch(() => {
          if (!active) return;
          setLoggedIn(false);
          setAuthReady(true);
        });
    } catch {
      // Public content must remain available when authentication is unavailable.
      setLoggedIn(false);
      setAuthReady(true);
    }
    return () => { active = false; };
  }, [hydrateCompanion]);

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
        <HomepageAnnouncementBanner href={primaryHref} label={loggedIn ? 'Open Workspace' : 'Start building'} />
        <header className="xv-hc-header">
          <div className="xv-hc-header-inner">
            <Logo href="/" variant="homepage" height={64} className="shrink-0" />
            {authReady && (
              <div className="flex items-center gap-2">
                <HomepageThemeSwitcher />
                {!loggedIn && (
                  <Link href="/auth/login" className="xv-hc-btn-ghost !min-h-[2.4rem] !px-4 !text-[0.7rem]">
                    Sign In
                  </Link>
                )}
                <button
                  type="button"
                  aria-label={loggedIn ? 'Open Dashboard' : 'Get Started'}
                  onClick={() => router.push(loggedIn ? '/workspace' : '/auth/signup')}
                  className="xv-hc-btn-primary xv-hc-dashboard-action !min-h-[2.4rem] !px-4 !text-[0.7rem]"
                >
                  {loggedIn ? (
                    <>
                      <LayoutDashboard className="xv-hc-dashboard-icon" aria-hidden="true" />
                      <span className="xv-hc-dashboard-label">Dashboard</span>
                    </>
                  ) : 'Get Started'}
                </button>
              </div>
            )}
          </div>
        </header>

        <div className="xv-hc-hero-main">
          <p className="xv-hc-badge">
            <span className="xv-hc-badge-dot" aria-hidden />
            XROGA AI CODING AGENT
          </p>

          <h1 className="xv-hc-brand">XROGA</h1>

          <div className="xv-hc-headline-block">
            <p className="xv-hc-headline">
              AI That <span className="xv-hc-headline-em">Builds & Ships</span>
            </p>
            <p className="xv-hc-headline-rotator" aria-live="polite">
              <span key={HERO_BUILD_WORDS[buildWordIdx]} className="xv-hc-headline-word">
                {HERO_BUILD_WORDS[buildWordIdx]}
              </span>
            </p>
          </div>

          <div className="xv-hc-chat xv-home-chatbar-wrap">
            <HomepageCompanionStage />
            <HomepageChatBar />
          </div>

          <section className="xv-hc-outcome-panel" aria-label="From outcome to verified delivery">
            <div className="xv-hc-outcome-copy">
              <span className="xv-hc-outcome-kicker">OUTCOME → EVIDENCE</span>
              <p className="xv-hc-sub">
                Describe the outcome. Xroga inspects your project, implements focused changes, runs applicable checks,
                and can push or publish through accounts you authorise—with evidence or the exact blocker.
              </p>

              <div className="xv-hc-ctas">
                <button
                  type="button"
                  onClick={() => router.push(primaryHref)}
                  className="xv-hc-btn-primary xv-hc-outcome-primary"
                >
                  {primaryLabel}
                </button>
                <a href="#ship-loop" className="xv-hc-btn-ghost xv-hc-outcome-secondary">
                  See how it ships
                </a>
              </div>
            </div>

            <div className="xv-hc-outcome-map" aria-hidden="true">
              <span className="xv-hc-outcome-orbit xv-hc-outcome-orbit--outer" />
              <span className="xv-hc-outcome-orbit xv-hc-outcome-orbit--inner" />
              <span className="xv-hc-outcome-node xv-hc-outcome-node--one" />
              <span className="xv-hc-outcome-node xv-hc-outcome-node--two" />
              <span className="xv-hc-outcome-node xv-hc-outcome-node--three" />
              <span className="xv-hc-outcome-sequence">01 · BUILD · TEST · SHIP · VERIFY</span>
            </div>
          </section>
        </div>
      </section>

      <HomepageShowcase />

      <section className="xv-hc-section" aria-labelledby="coding-heading">
        <div className="xv-hc-section-inner">
          <p className="xv-hc-pixel-kicker" id="coding-heading">
            CODING
          </p>
          <h2 className="xv-hc-section-title">
            Build better products. <em>Swarm for your repo.</em> One continuous loop.
          </h2>
          <p className="xv-hc-section-copy">
            Watch Xroga Workspace ship across every category — web, Chrome, desktop, Android, iOS,
            debug, crypto, and updates — prompt → code → GitHub → live.
          </p>
          <div className="xv-hc-mark" aria-hidden />
        </div>
      </section>

      <section className="xv-hc-features" id="ship-loop" aria-labelledby="ship-loop-heading">
        <div className="xv-hc-features-inner">
          <span className="xv-hc-features-label">THE REAL SHIP LOOP</span>
          <div className="xv-hc-features-grid">
            <div>
              <h2 className="xv-hc-features-headline" id="ship-loop-heading">Durable work. <em>Verified outcomes.</em></h2>
              <p className="xv-hc-features-lead">Workspace activity comes from real backend run events. A build is complete only after its required validation, and publishing is reported only with provider evidence.</p>
            </div>
            <ul className="xv-hc-feature-list">
              <li><strong>Understand and implement</strong><span>Inspect the current repository, change the controlled project state, and preserve unrelated code.</span></li>
              <li><strong>Validate and repair</strong><span>Run applicable checks, classify real failures, and target the responsible files.</span></li>
              <li><strong>Push and publish with evidence</strong><span>Show the remote commit and deployment result, or the exact external setup still required.</span></li>
            </ul>
          </div>
        </div>
      </section>

      <section className="xv-hc-features" aria-labelledby="features-heading">
        <div className="xv-hc-features-inner">
          <span className="xv-hc-features-label">WHAT WE SHIP</span>
          <div className="xv-hc-features-grid">
            <div>
              <h2 className="xv-hc-features-headline" id="features-heading">
                Coding agent that ships. <em>Same repo, forever.</em>
              </h2>
              <p className="xv-hc-features-lead">
                Xroga AI connects the product loop: prompt → brief → code → QA → your
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

      <HomepageFaqSection />

      {/* Community and Share Feedback moved out of the hero so it stays focused on the
          product and its primary action. Both keep the same behaviour: Community links
          to the existing page, and Share Feedback opens the existing modal. */}
      <section className="xv-hc-section" aria-labelledby="community-support-heading">
        <div className="xv-hc-section-inner">
          <p className="xv-hc-pixel-kicker">COMMUNITY &amp; SUPPORT</p>
          <h2 className="xv-hc-section-title" id="community-support-heading">
            Build alongside <em>other builders.</em>
          </h2>
          <p className="xv-hc-section-copy">
            Share what you shipped, report a bug, or request a feature. Feedback goes straight to the people building
            Xroga.
          </p>
          <div className="xv-hc-ctas">
            <Link href="/community" className="xv-hc-btn-primary">
              Open Community
            </Link>
            <button type="button" onClick={() => setFeedbackOpen(true)} className="xv-hc-btn-ghost">
              Share Feedback
            </button>
            <Link href="/docs" className="xv-hc-btn-ghost">
              Read the docs
            </Link>
          </div>
        </div>
      </section>

      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />

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
