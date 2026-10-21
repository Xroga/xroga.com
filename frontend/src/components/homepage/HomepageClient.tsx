'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { S00Hero } from '@/components/homepage-next/phase1/S00Hero';
import '@/components/homepage-next/tokens.css';
import '@/styles/homepage-coding.css';
import '@/styles/homepage-closing-animation.css';
import { createClient } from '@/lib/supabase/client';
import { FeedbackModal } from '@/components/feedback/FeedbackModal';
import { S01CapabilityDeck } from '@/components/homepage-next/s01/S01CapabilityDeck';
import { S02Work } from '@/components/homepage-next/s02/S02Work';
import { S03Growth } from '@/components/homepage-next/s03/S03Growth';
import { S04Publish } from '@/components/homepage-next/s04/S04Publish';
import { S05Capabilities } from '@/components/homepage-next/s05/S05Capabilities';
import { SharedDotBackdrop } from '@/components/homepage-next/backdrop/SharedDotBackdrop';
import { OptionalVisualErrorBoundary } from '@/components/homepage/OptionalVisualErrorBoundary';
import { Ambient } from '@/components/homepage-next/ambient/Ambient';
import { useSeen } from '@/components/homepage-next/ambient/useSeen';
import { AiCodingAgentSquaresTerminal } from '@/components/marketing/AiCodingAgentSquaresTerminal';

export function HomepageClient() {
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const closingRef = useRef<HTMLElement>(null);
  const closingSeen = useSeen(closingRef, 0.35);

  useLayoutEffect(() => {
    if (window.location.hash) return;

    const previousRestoration = window.history.scrollRestoration;
    let userMoved = false;
    let guardActive = true;
    const resetToHero = () => {
      if (!userMoved) window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    };
    const markPointerIntent = () => { userMoved = true; };
    const markKeyboardIntent = (event: KeyboardEvent) => {
      if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'End', 'Home', ' '].includes(event.key)) userMoved = true;
    };
    const blockLateRestore = () => {
      if (guardActive && !userMoved && window.scrollY !== 0) resetToHero();
    };
    const removeGuardListeners = () => {
      window.removeEventListener('wheel', markPointerIntent, true);
      window.removeEventListener('touchstart', markPointerIntent, true);
      window.removeEventListener('pointerdown', markPointerIntent, true);
      window.removeEventListener('keydown', markKeyboardIntent, true);
      window.removeEventListener('scroll', blockLateRestore);
    };
    window.history.scrollRestoration = 'manual';
    window.addEventListener('wheel', markPointerIntent, { passive: true, capture: true });
    window.addEventListener('touchstart', markPointerIntent, { passive: true, capture: true });
    window.addEventListener('pointerdown', markPointerIntent, { passive: true, capture: true });
    window.addEventListener('keydown', markKeyboardIntent, true);
    window.addEventListener('scroll', blockLateRestore, { passive: true });
    resetToHero();
    let revealFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      revealFrame = window.requestAnimationFrame(() => {
        resetToHero();
        document.documentElement.classList.remove('xv-home-scroll-lock');
      });
    });
    const settleTimer = window.setTimeout(resetToHero, 450);
    const releaseTimer = window.setTimeout(() => {
      guardActive = false;
      removeGuardListeners();
    }, 1_200);
    window.addEventListener('pageshow', resetToHero);

    return () => {
      guardActive = false;
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(revealFrame);
      window.clearTimeout(settleTimer);
      window.clearTimeout(releaseTimer);
      removeGuardListeners();
      document.documentElement.classList.remove('xv-home-scroll-lock');
      window.removeEventListener('pageshow', resetToHero);
      window.history.scrollRestoration = previousRestoration;
    };
  }, []);

  useEffect(() => {
    let active = true;
    try {
      createClient().auth.getSession().then(({ data: { session } }) => {
        if (!active) return;
        setLoggedIn(!!session);
      }).catch(() => { if (active) setLoggedIn(false); });
    } catch {
      setLoggedIn(false);
    }
    return () => { active = false; };
  }, []);

  const primaryHref = loggedIn ? '/workspace' : '/auth/signup';

  return (
  <div className="xv-homepage xv-home-coding min-h-screen flex flex-col">
    {/* S00: the final locked hero (docs/homepage-implementation/S00_FINAL_LOCK.md) */}
    <div className="hpx-root">
      <S00Hero />
    </div>

      {/* S01: capability deck (docs/homepage-implementation/XROGA_S01_CAPABILITY_DECK_CLAUDE_BRIEF.md) */}
      {/* S01–S05 share one background: a single dot grid behind all five sections (homepage-next/backdrop) */}
      <div className="xv-unified-sections">
        <OptionalVisualErrorBoundary><SharedDotBackdrop /></OptionalVisualErrorBoundary>
        <S01CapabilityDeck />
        {/* S02: Browser Automation and AI Employees (docs/homepage-implementation/XROGA_S02_FINAL_CLAUDE_IMPLEMENTATION_BRIEF.md) */}
        <S02Work loggedIn={loggedIn} />
        <S03Growth loggedIn={loggedIn} />
        <S04Publish loggedIn={loggedIn} />
        <S05Capabilities />
      </div>
      {/* Closing: the graphite horizon (homepage-closing-animation.css) frames the closing card and runs into the footer */}
      <div className="xv-horizon" data-seen={closingSeen || undefined}>
      <Ambient kind="horizon" />
      <section
  ref={closingRef}
  className="xv-closing-frame"
  aria-label="Community, support, and getting started"
>
  <AiCodingAgentSquaresTerminal className="xv-closing-terminal" />

  <section
    className="xv-hc-section xv-hc-community"
    aria-labelledby="community-support-heading"
  >
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
      </div>

      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </div>
  );
}
