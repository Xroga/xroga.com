'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/layout/Logo';
import { HomepageChatBar } from '@/components/terminal/HomepageChatBar';
import { HomepageShipStack } from '@/components/homepage/HomepageShipStack';
import { HomepageBuildStrip } from '@/components/homepage/HomepageBuildStrip';
import { HomepageEnterpriseProof } from '@/components/homepage/HomepageEnterpriseProof';
import { HomepageFaqSection } from '@/components/homepage/HomepageFaqSection';
import { HomepageAnnouncementBanner } from '@/components/homepage/HomepageAnnouncementBanner';
import { HomepageShowcase } from '@/components/showcase/HomepageShowcase';
import '@/styles/homepage-coding.css';
import { createClient } from '@/lib/supabase/client';
import { HomepageCompanionStage } from '@/components/companion/CompanionSurfaces';
import { HomepageThemeSwitcher } from '@/components/companion/HomepageThemeSwitcher';
import { AnimatedIcon } from '@/components/icons/animated/AnimatedIcon';
import { LayoutGridIcon } from '@/components/icons/animated/LayoutGridIcon';
import { FeedbackModal } from '@/components/feedback/FeedbackModal';
import { useCompanionStore } from '@/store/useCompanionStore';
import {
  ArrowRight,
  Bug,
  Gauge,
  Globe2,
  LayoutTemplate,
  LogIn,
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
import { HomepageOwnershipProof } from '@/components/homepage/HomepageOwnershipProof';

export default function HomePage() {
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState(false);
  const [authReady, setAuthReady] = useState(false);
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

  const primaryHref = loggedIn ? '/workspace' : '/auth/signup';

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
            {/*
              Theme and the account control share one segmented surface, divided by a
              hairline, rather than sitting as two detached buttons.

              Get Started stays outside it. Signed out, that is the page's conversion
              action, and flattening it into a neutral segment of equal weight would
              cost the homepage its primary call to action to gain a tidier header.
              Signed in there is no such action, so the group is the whole control.
            */}
            {authReady && (
              <div className="flex items-center gap-2">
                <div className="xv-hc-headgroup">
                  <HomepageThemeSwitcher />
                  {loggedIn ? (
                    <button
                      type="button"
                      aria-label="Open Dashboard"
                      onClick={() => router.push('/workspace')}
                      className="xv-hc-headgroup__seg"
                    >
                      {/* The same grid the sidebar and the bottom bar use for Dashboard, so the
                          destination looks like itself from the homepage too — and animates,
                          which is what the rest of the product's icons do. */}
                      <AnimatedIcon icon={LayoutGridIcon} size={16} className="xv-hc-seg-icon" />
                      <span className="xv-hc-seg-label">Dashboard</span>
                    </button>
                  ) : (
                    <Link href="/auth/login" className="xv-hc-headgroup__seg">
                      <LogIn className="xv-hc-seg-icon" aria-hidden="true" />
                      <span className="xv-hc-seg-label">Sign In</span>
                    </Link>
                  )}
                </div>
                {!loggedIn && (
                  <button
                    type="button"
                    aria-label="Get Started"
                    onClick={() => router.push('/auth/signup')}
                    className="xv-hc-btn-primary !min-h-[2.4rem] !px-4 !text-[0.7rem]"
                  >
                    Get Started
                  </button>
                )}
              </div>
            )}
          </div>
        </header>

        <div className="xv-hc-hero-main">

          <div className="xv-hc-headline-block">
            {/*
              Four typographic voices on one line of reading: "The Agentic Way to Build
              & Ship". It stays a single <p> so a screen reader gets the sentence in
              order rather than four disconnected fragments — the styling is entirely in
              the spans.
            */}
            <h1 className="xv-hc-headline">
              <span className="xv-hc-headline__the">The</span>{' '}
              <span className="xv-hc-headline__agentic">Agentic</span>{' '}
              <span className="xv-hc-headline__way">Way to</span>{' '}
              <span className="xv-hc-headline__ship">Build &amp; Ship</span>
            </h1>
          </div>

          <div className="xv-hc-chat xv-home-chatbar-wrap">
            <HomepageCompanionStage />
            <HomepageChatBar />
          </div>

          <p className="xv-hc-hero-statement">
            <strong>Tell Xroga what you want to make.</strong>{' '}
            <span>
              It turns the brief into working code, shows you the checks, and ships through your connected accounts
              when you authorize it.
            </span>{' '}
            <em>Your repository. Your credentials. Your product.</em>
          </p>

        </div>

        <HomepageBuildStrip />
      </section>

      <XrogaIntelligenceSection />

      <HomepageOwnershipProof />

      <HomepageWorkspaceTour loggedIn={loggedIn} />

      <HomepageShowcase />

      <HomepageShipStack />

      <HomepageEnterpriseProof />

      <HomepageFaqSection />

      {/* Community and Feedback moved out of the hero so it stays focused on the
          product and its primary action. Both keep the same behaviour: Community links
          to the existing page, and Feedback opens the existing modal. */}
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
          <div className="xv-hc-community-tabs" role="group" aria-label="Community and support">
            {/* The section heading and copy already say what these do, so the verbs
                the labels used to carry ("Open", "Share", "Read the") were repeating
                context the reader has just been given. */}
            <Link href="/community" className="is-active">
              Community
            </Link>
            <button type="button" onClick={() => setFeedbackOpen(true)}>
              Feedback
            </button>
            <Link href="/docs">
              Docs
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
