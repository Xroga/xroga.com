'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { HomepageChatBar } from '@/components/terminal/HomepageChatBar';
import { HomepageShipStack } from '@/components/homepage/HomepageShipStack';
import { HomepageEnterpriseProof } from '@/components/homepage/HomepageEnterpriseProof';
import { HomepageFaqSection } from '@/components/homepage/HomepageFaqSection';
import { HomepageShowcase } from '@/components/showcase/HomepageShowcase';
import '@/styles/homepage-coding.css';
import { createClient } from '@/lib/supabase/client';
import { HomepageCompanionStage } from '@/components/companion/CompanionSurfaces';
import { FeedbackModal } from '@/components/feedback/FeedbackModal';
import { useCompanionStore } from '@/store/useCompanionStore';
import { HomepageWorkspaceTour } from '@/components/homepage/HomepageWorkspaceTour';
import { XrogaIntelligenceSection } from '@/components/homepage/XrogaIntelligenceSection';
import { HomepageOwnershipProof } from '@/components/homepage/HomepageOwnershipProof';
import { HomepageStackStudio } from '@/components/homepage/HomepageStackStudio';
import { HomepageAllInOne } from '@/components/homepage/HomepageAllInOne';
import { HomepagePricingPreview } from '@/components/homepage/HomepagePricingPreview';

const HERO_CATEGORIES = ['Websites', 'SaaS', 'Dashboards', 'Internal tools', 'Mobile apps', 'Browser extensions', 'APIs', 'Desktop apps', 'Automations', 'CLIs', 'Libraries', 'Data pipelines'] as const;

export function HomepageClient() {
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const hydrateCompanion = useCompanionStore((state) => state.hydratePreferences);

  useEffect(() => {
    let active = true;
    try {
      createClient().auth.getSession().then(({ data: { session } }) => {
        if (!active) return;
        setLoggedIn(!!session);
        if (session?.user.id) {
          void createClient().from('profiles').select('display_name').eq('id', session.user.id).maybeSingle().then(({ data }) => {
            hydrateCompanion({}, typeof data?.display_name === 'string' ? data.display_name : null);
          });
        }
      }).catch(() => { if (active) setLoggedIn(false); });
    } catch {
      setLoggedIn(false);
    }
    return () => { active = false; };
  }, [hydrateCompanion]);

  const primaryHref = loggedIn ? '/workspace' : '/auth/signup';

  return (
    <div className="xv-homepage xv-home-coding min-h-screen flex flex-col">
      <div className="xv-hc-bg-image" style={{ backgroundImage: 'url("/backgrounds/xroga-clean-horizon.png")' }} aria-hidden />

      <section className="xv-hc-hero">
        <div className="xv-hc-hero-main">
          <div className="xv-hc-headline-block">
            <p className="xv-hc-eyebrow"><i /> AI APP BUILDER + CODING AGENT</p>
            <h1 className="xv-hc-headline">AI app builder that builds, tests and ships <em>code you own.</em></h1>
            <p className="xv-hc-hero-copy">Start from an idea or an existing repository. Xroga implements the product, runs applicable checks, and helps you ship through accounts you control.</p>
            <div className="xv-hc-hero-actions">
              <Link href={primaryHref} className="xv-hc-btn-primary xv-hc-btn-build">Build free <ArrowRight aria-hidden="true" /></Link>
              <Link href="#ship-loop" className="xv-hc-btn-ghost">How it works</Link>
            </div>
          </div>

          <div className="xv-hc-chat xv-home-chatbar-wrap">
            <HomepageCompanionStage />
            <HomepageChatBar />
          </div>
          <div className="xv-hc-category-strip" aria-label="Products Xroga can build">
            <div className="xv-hc-category-track">
              {[false, true].map((duplicate) => (
                <ul className="xv-hc-category-group" aria-hidden={duplicate || undefined} key={duplicate ? 'duplicate' : 'primary'}>
                  {HERO_CATEGORIES.map((category) => <li key={category}>{category}</li>)}
                </ul>
              ))}
            </div>
          </div>
        </div>
      </section>

      <HomepageWorkspaceTour loggedIn={loggedIn} />
      <div id="product"><HomepageAllInOne /></div>
      <div className="xv-system-combined" aria-label="Xroga intelligence and build system"><XrogaIntelligenceSection /><HomepageStackStudio /></div>
      <div id="showcase"><HomepageShowcase /></div>
      <div id="how-xroga-works"><HomepageShipStack /></div>
      <HomepageEnterpriseProof />
      <HomepagePricingPreview loggedIn={loggedIn} />

      <div className="xv-endgame-frame" aria-label="Who Xroga is for and common questions">
        <HomepageOwnershipProof />
        <HomepageFaqSection />
      </div>

      <section className="xv-closing-frame" aria-label="Community, support, and getting started">
        <section className="xv-hc-section xv-hc-community" aria-labelledby="community-support-heading">
          <div className="xv-hc-community-scrim" aria-hidden="true" />
          <div className="xv-hc-section-inner">
            <p className="xv-hc-pixel-kicker">COMMUNITY &amp; SUPPORT</p>
            <h2 className="xv-hc-section-title" id="community-support-heading">Build with <em>other builders.</em></h2>
            <p className="xv-hc-community-motto">Ship, share, improve.</p>
            <p className="xv-hc-section-copy">Share work, report bugs, and request features.</p>
            <div className="xv-hc-community-tabs" role="group" aria-label="Community and support">
              <Link href="/community" className="is-active">Community</Link>
              <button type="button" onClick={() => setFeedbackOpen(true)}>Feedback</button>
              <Link href="/docs">Docs</Link>
            </div>
          </div>
        </section>
        <section className="xv-hc-mid-cta" aria-label="Start building">
          <div className="xv-hc-mid-cta-inner">
            <div className="xv-hc-mid-cta-copy"><h2>Build what&apos;s<br /><em>yours.</em></h2></div>
            <div className="xv-hc-mid-cta-actions"><button type="button" onClick={() => router.push(primaryHref)}>Get started — it&apos;s free <ArrowRight aria-hidden="true" /></button></div>
          </div>
        </section>
      </section>

      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </div>
  );
}
