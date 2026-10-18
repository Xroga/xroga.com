'use client';

import Image from 'next/image';
import {
  Bot,
  Globe2,
  Plane,
  PlugZap,
  Rocket,
  Search,
  Sparkles,
  TestTube2,
  TrendingUp,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import styles from './AuthPowerPanel.module.css';

const SLIDE_COUNT = 4;
const INTRO_DURATION_MS = 5200;
const FEATURE_DURATION_MS = 6400;

const COMPANY_MARKS = [
  { name: 'GitHub', src: '/brand/logos/github.svg' },
  { name: 'Vercel', src: '/brand/logos/vercel.svg' },
  { name: 'Supabase', src: '/brand/logos/supabase.svg' },
  { name: 'OpenAI', src: '/brand/logos/openai.svg' },
  { name: 'GitLab', src: '/brand/logos/gitlab.svg' },
  { name: 'Anthropic', src: '/brand/logos/anthropic.svg' },
] as const;

export function AuthShowcase() {
  const [activeSlide, setActiveSlide] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setReducedMotion(query.matches);
    updatePreference();
    query.addEventListener('change', updatePreference);
    return () => query.removeEventListener('change', updatePreference);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    const duration = activeSlide === 0 ? INTRO_DURATION_MS : FEATURE_DURATION_MS;
    const timer = window.setTimeout(
      () => setActiveSlide((current) => (current + 1) % SLIDE_COUNT),
      duration,
    );
    return () => window.clearTimeout(timer);
  }, [activeSlide, reducedMotion]);

  return (
    <section className={styles.panel} aria-label="Xroga capability story" aria-roledescription="carousel">
      <header className={styles.header}>
        <Image src="/brand/xroga-orb-wordmark-dark-v3.webp" alt="Xroga" width={168} height={54}
          priority unoptimized className={styles.logo} />
      </header>

      <div className={styles.viewport} aria-live="polite">
        <article className={`${styles.slide} ${styles.introSlide} ${activeSlide === 0 ? styles.active : ''}`}
          aria-hidden={activeSlide !== 0}>
          <Image src="/brand/auth-stories/idea-to-business.webp" alt="A luminous idea opening into a complete working business"
            fill priority sizes="(max-width: 1279px) 100vw, 44vw" className={styles.fullBleedArt} />
          <div className={styles.artVeil} aria-hidden="true" />
          <div className={styles.introCopy}>
            <p className={styles.eyebrow}><Sparkles aria-hidden="true" /> One idea. A complete business.</p>
            <h2>Imagine it.<br /><em>Xroga makes it real.</em></h2>
            <p>Start with a conversation. Move into research, a working product, testing, launch, and growth.</p>
          </div>
        </article>

        <article className={`${styles.slide} ${styles.buildSlide} ${activeSlide === 1 ? styles.active : ''}`}
          aria-hidden={activeSlide !== 1}>
          <div className={styles.sceneCopy}>
            <p className={styles.eyebrow}><Rocket aria-hidden="true" /> From idea to every screen</p>
            <h2>Build once.<br /><em>Launch everywhere.</em></h2>
            <p>Web, mobile, tablet, desktop, and APIs—built, tested like a real user, repaired, and prepared for release.</p>
          </div>
          <div className={styles.visualStage}>
            <figure className={styles.heroArt}>
              <Image src="/brand/auth-stories/publish-everywhere.webp" alt="One product delivered across web, phone, tablet, and desktop"
                fill sizes="(max-width: 1279px) 90vw, 38vw" className={styles.artImage} />
              <figcaption><Rocket aria-hidden="true" /> Every screen. One product.</figcaption>
            </figure>
            <figure className={styles.secondaryArt}>
              <Image src="/brand/auth-stories/ai-testing.webp" alt="AI inspecting, finding, and repairing a product experience"
                fill sizes="(max-width: 700px) 42vw, 17vw" className={styles.artImage} />
              <figcaption><TestTube2 aria-hidden="true" /> AI-tested</figcaption>
            </figure>
          </div>
        </article>

        <article className={`${styles.slide} ${styles.connectSlide} ${activeSlide === 2 ? styles.active : ''}`}
          aria-hidden={activeSlide !== 2}>
          <div className={styles.sceneCopy}>
            <p className={styles.eyebrow}><PlugZap aria-hidden="true" /> Connected intelligence</p>
            <h2>Everything you use.<br /><em>Working together.</em></h2>
            <p>Connect 1,500+ apps and custom MCPs. Research, browse, create, plan travel, and move approved work forward.</p>
          </div>
          <div className={styles.visualStage}>
            <figure className={styles.heroArt}>
              <Image src="/brand/auth-stories/connected-work.webp" alt="A connected constellation of work applications around one intelligence core"
                fill sizes="(max-width: 1279px) 90vw, 38vw" className={styles.artImage} />
              <div className={styles.logoRibbon} aria-label="Supported integration examples">
                {COMPANY_MARKS.map((company) => (
                  <span key={company.name} title={company.name}>
                    <Image src={company.src} alt={company.name} width={22} height={22} unoptimized />
                  </span>
                ))}
              </div>
            </figure>
            <figure className={`${styles.secondaryArt} ${styles.travelArt}`}>
              <Image src="/brand/auth-stories/research-travel.webp" alt="AI researching the web and planning a connected travel journey"
                fill sizes="(max-width: 700px) 42vw, 17vw" className={styles.artImage} />
              <figcaption><Globe2 aria-hidden="true" /> Research <Plane aria-hidden="true" /> Travel</figcaption>
            </figure>
          </div>
        </article>

        <article className={`${styles.slide} ${styles.growthSlide} ${activeSlide === 3 ? styles.active : ''}`}
          aria-hidden={activeSlide !== 3}>
          <div className={styles.sceneCopy}>
            <p className={styles.eyebrow}><Bot aria-hidden="true" /> Specialized intelligence</p>
            <h2>Your AI team.<br /><em>Your next stage of growth.</em></h2>
            <p>Specialized Xroga employees research, create, operate, support customers, and improve how your business is discovered.</p>
          </div>
          <div className={`${styles.visualStage} ${styles.employeeStage}`}>
            <figure className={styles.heroArt}>
              <Image src="/brand/auth-stories/xroga-employees.webp" alt="A colorful team of specialized Xroga AI employees"
                fill sizes="(max-width: 1279px) 90vw, 38vw" className={styles.artImage} />
              <figcaption><Bot aria-hidden="true" /> Research · Content · Operations · Development · Customer</figcaption>
            </figure>
            <figure className={`${styles.secondaryArt} ${styles.visibilityArt}`}>
              <Image src="/brand/auth-stories/seo-aeo-geo.webp" alt="Brand visibility expanding through search, answer engines, and geographic intelligence"
                fill sizes="(max-width: 700px) 42vw, 17vw" className={styles.artImage} />
              <figcaption className={styles.visibilityLabels}>
                <span><Search aria-hidden="true" /> SEO</span><span>AEO</span><span><TrendingUp aria-hidden="true" /> GEO</span>
              </figcaption>
            </figure>
          </div>
        </article>
      </div>

      <nav className={styles.dots} aria-label="Choose a capability slide">
        {Array.from({ length: SLIDE_COUNT }, (_, index) => (
          <button type="button" key={index} className={activeSlide === index ? styles.activeDot : ''}
            onClick={() => setActiveSlide(index)} aria-label={`Show capability slide ${index + 1}`}
            aria-current={activeSlide === index ? 'true' : undefined}><span /></button>
        ))}
      </nav>
    </section>
  );
}
