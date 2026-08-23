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
import {
  ArrowRight,
  Bug,
  Gauge,
  Globe2,
  LayoutDashboard,
  LayoutTemplate,
  MonitorCog,
  PanelsTopLeft,
  Puzzle,
  Smartphone,
} from 'lucide-react';
import { PageJsonLd } from '@/components/seo/PageJsonLd';
import { PRODUCT_ONE_LINER } from '@/lib/seo';
import { MarketingFooter } from '@/components/layout/MarketingFooter';
import { HomepageIntegrationOrbit, HomepageWorkspaceTour } from '@/components/homepage/HomepageWorkspaceTour';
import { XrogaIntelligenceSection } from '@/components/homepage/XrogaIntelligenceSection';

const HERO_BUILD_WORDS = [
  { label: 'Websites', icon: Globe2, shape: 'slash' },
  { label: 'SaaS apps', icon: PanelsTopLeft, shape: 'capsule' },
  { label: 'Chrome extensions', icon: Puzzle, shape: 'diamond' },
  { label: 'Desktop software', icon: MonitorCog, shape: 'square' },
  { label: 'Android apps', icon: Smartphone, shape: 'orb' },
  { label: 'iOS apps', icon: Smartphone, shape: 'ring' },
  { label: 'Mobile apps', icon: Smartphone, shape: 'pill' },
  { label: 'Debug errors', icon: Bug, shape: 'hex' },
  { label: 'Landing pages', icon: LayoutTemplate, shape: 'beam' },
  { label: 'Dashboards', icon: Gauge, shape: 'soft-square' },
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
  }, 2800);

  return () => window.clearInterval(t);
}, []);

  const primaryHref = loggedIn ? '/workspace' : '/auth/signup';
  const activeBuildWord = HERO_BUILD_WORDS[buildWordIdx];
  const ActiveBuildIcon = activeBuildWord.icon;

  return (
    <div className="xv-homepage xv-home-coding min-h-screen flex flex-col">
      <PageJsonLd path="/" name="XROGA AI" description={PRODUCT_ONE_LINER} />
      <div
        className="xv-hc-bg-image"
        style={{ backgroundImage: 'url("/backgrounds/xroga-clean-horizon.png")' }}
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
            {/*
              Four typographic voices on one line of reading: "The Agentic Way to Build
              & Ship". It stays a single <p> so a screen reader gets the sentence in
              order rather than four disconnected fragments — the styling is entirely in
              the spans.
            */}
            <p className="xv-hc-headline">
              <span className="xv-hc-headline__the">The</span>{' '}
              <span className="xv-hc-headline__agentic">Agentic</span>{' '}
              <span className="xv-hc-headline__way">Way to</span>{' '}
              <span className="xv-hc-headline__ship">Build &amp; Ship</span>
            </p>
            <div
  className="xv-hc-target-stage"
  aria-live="polite"
>
  <div
    key={activeBuildWord.label}
    className="xv-hc-target"
  >
    <span
      className={`xv-hc-target-shape xv-hc-target-shape--${activeBuildWord.shape}`}
      aria-hidden="true"
    >
      <span className="xv-hc-target-shape__glow" />

      <ActiveBuildIcon className="xv-hc-target-shape__icon" />
    </span>

    <span className="xv-hc-target-label">
      {activeBuildWord.label}
    </span>

    <span
      className="xv-hc-target-trail"
      aria-hidden="true"
    />
  </div>
</div>
          </div>

          <div className="xv-hc-chat xv-home-chatbar-wrap">
            <HomepageCompanionStage />
            <HomepageChatBar />
          </div>

        </div>
      </section>

      <XrogaIntelligenceSection />

      <HomepageWorkspaceTour loggedIn={loggedIn} />

      <HomepageShowcase />

      <HomepageShipStack />

      <HomepageEnterpriseProof />

      <HomepageFaqSection />

      {/* Community and Share Feedback moved out of the hero so it stays focused on the
          product and its primary action. Both keep the same behaviour: Community links
          to the existing page, and Share Feedback opens the existing modal. */}
      <section className="xv-hc-section xv-hc-community" aria-labelledby="community-support-heading">
        <div className="xv-hc-community-scrim" aria-hidden="true" />
        <div className="xv-hc-section-inner">
          <p className="xv-hc-pixel-kicker">COMMUNITY &amp; SUPPORT</p>
          <h2 className="xv-hc-section-title" id="community-support-heading">
            Build alongside <em>other builders.</em>
          </h2>
          <p className="xv-hc-community-motto">Freedom to build. Fellows who understand the journey.</p>
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
          <div className="xv-hc-mid-cta-copy">
            <h2>Build what belongs<br /><em>to you.</em></h2>
          </div>
          <HomepageIntegrationOrbit loggedIn={loggedIn} />
          <div className="xv-hc-mid-cta-actions">
            <button type="button" onClick={() => router.push(primaryHref)}>Get started — it&apos;s free <ArrowRight aria-hidden="true" /></button>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
