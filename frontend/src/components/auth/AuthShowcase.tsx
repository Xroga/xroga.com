'use client';

import Image from 'next/image';
import {
  Bot,
  CheckCircle2,
  Globe2,
  Plane,
  PlugZap,
  Rocket,
  Search,
  TestTube2,
  TrendingUp,
} from 'lucide-react';
import {
  siAirtable,
  siAsana,
  siCloudflare,
  siDiscord,
  siDropbox,
  siFigma,
  siGithub,
  siGitlab,
  siGmail,
  siGooglecalendar,
  siGoogledrive,
  siHubspot,
  siJira,
  siNetlify,
  siNotion,
  siShopify,
  siStripe,
  siSupabase,
  siTrello,
  siVercel,
  type SimpleIcon,
} from 'simple-icons';
import { useEffect, useState } from 'react';

import styles from './AuthPowerPanel.module.css';

const SLIDE_COUNT = 4;
const INTRO_DURATION_MS = 5200;
const FEATURE_DURATION_MS = 6400;

const APP_MARKS: readonly SimpleIcon[] = [
  siGmail,
  siGooglecalendar,
  siGoogledrive,
  siGithub,
  siGitlab,
  siNotion,
  siHubspot,
  siStripe,
  siShopify,
  siVercel,
  siSupabase,
  siAirtable,
  siDropbox,
  siDiscord,
  siJira,
  siAsana,
  siTrello,
  siFigma,
  siCloudflare,
  siNetlify,
] as const;

function BrandMark({ mark }: { mark: SimpleIcon }) {
  return (
    <span className={styles.appMark} title={mark.title}>
      <svg viewBox="0 0 24 24" role="img" aria-label={mark.title} style={{ color: `#${mark.hex}` }}>
        <path fill="currentColor" d={mark.path} />
      </svg>
    </span>
  );
}

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
        <Image src="/brand/xroga-orb-mark-v2.webp" alt="Xroga" width={34} height={34}
          priority unoptimized className={styles.logo} />
        <span>Xroga</span>
      </header>

      <div className={styles.viewport} aria-live="polite">
        <article className={`${styles.slide} ${styles.introSlide} ${activeSlide === 0 ? styles.active : ''}`}
          aria-hidden={activeSlide !== 0}>
          <div className={styles.introCopy}>
            <p className={styles.eyebrow}>One idea. A complete business.</p>
            <h2>Imagine it.<br /><em>Xroga makes it real.</em></h2>
          </div>
          <div className={styles.introFooter}>
            <p>Start with a conversation. Move into research, a working product, testing, launch, and growth.</p>
            <div className={styles.metricsStrip} aria-label="Xroga capability counts">
              <span><strong>1,500+</strong><small>connected apps</small></span>
              <span><strong>7</strong><small>build stages</small></span>
              <span><strong>24/7</strong><small>AI workforce</small></span>
            </div>
          </div>
        </article>

        <article className={`${styles.slide} ${styles.buildSlide} ${activeSlide === 1 ? styles.active : ''}`}
          aria-hidden={activeSlide !== 1}>
          <div className={styles.sceneCopy}>
            <p className={styles.eyebrow}><Rocket aria-hidden="true" /> Responsive delivery · lasting progress</p>
            <h2>Build it once.<br /><em>Succeed everywhere.</em></h2>
            <p>Every screen stays responsive while Xroga tests, repairs, grows the business, and keeps long-running projects moving.</p>
          </div>
          <div className={styles.visualStage}>
            <figure className={styles.heroArt}>
              <Image src="/brand/auth-stories/responsive-growth-v2.webp" alt="A successful responsive business across desktop, laptop, tablet, and phone with verified repairs, growth, and long-running project progress"
                fill sizes="(max-width: 1279px) 90vw, 38vw" className={styles.artImage} />
            </figure>
          </div>
          <div className={styles.sceneFooter} aria-label="Delivery outcomes">
            <span><CheckCircle2 aria-hidden="true" /> Success verified</span>
            <span><TestTube2 aria-hidden="true" /> Repaired and tested</span>
            <span><TrendingUp aria-hidden="true" /> Long projects keep moving</span>
          </div>
        </article>

        <article className={`${styles.slide} ${styles.connectSlide} ${activeSlide === 2 ? styles.active : ''}`}
          aria-hidden={activeSlide !== 2}>
          <div className={styles.sceneCopy}>
            <p className={styles.eyebrow}><PlugZap aria-hidden="true" /> Connected intelligence</p>
            <h2>Your apps.<br /><em>One working system.</em></h2>
            <p>Connect 1,500+ apps and custom MCPs. Research, browse, create, plan travel, and move approved work forward.</p>
          </div>
          <div className={styles.visualStage}>
            <figure className={styles.heroArt}>
              <Image src="/brand/auth-stories/connected-work-clean.webp" alt="A clean central workspace connected to many application tiles"
                fill sizes="(max-width: 1279px) 90vw, 38vw" className={styles.artImage} />
              <div className={styles.appGrid} aria-label="Twenty popular supported apps">
                {APP_MARKS.map((mark) => <BrandMark key={mark.slug} mark={mark} />)}
                <span className={styles.xrogaHub} title="Xroga">
                  <Image src="/brand/xroga-orb-mark-v2.webp" alt="Xroga" width={30} height={30} />
                </span>
              </div>
              <div className={styles.integrationCount}><strong>20 shown</strong><span>1,500+ available</span></div>
            </figure>
            <figure className={`${styles.secondaryArt} ${styles.travelArt}`}>
              <Image src="/brand/auth-stories/research-travel-clean.webp" alt="A clean research and travel planning workspace"
                fill sizes="(max-width: 700px) 42vw, 17vw" className={styles.artImage} />
              <figcaption><Globe2 aria-hidden="true" /> Research <Plane aria-hidden="true" /> Travel</figcaption>
            </figure>
          </div>
          <div className={styles.sceneFooter} aria-label="Connected work outcomes">
            <span><PlugZap aria-hidden="true" /> 1,500+ apps</span>
            <span><Search aria-hidden="true" /> Research with sources</span>
            <span><Plane aria-hidden="true" /> Plans ready for approval</span>
          </div>
        </article>

        <article className={`${styles.slide} ${styles.growthSlide} ${activeSlide === 3 ? styles.active : ''}`}
          aria-hidden={activeSlide !== 3}>
          <div className={styles.sceneCopy}>
            <p className={styles.eyebrow}><Bot aria-hidden="true" /> Specialized intelligence</p>
            <h2>Your AI team.<br /><em>Measurable growth.</em></h2>
            <p>Xroga employees research, create, operate, support customers, and improve how your business is discovered.</p>
          </div>
          <div className={`${styles.visualStage} ${styles.employeeStage}`}>
            <figure className={styles.heroArt}>
              <Image src="/brand/auth-stories/xroga-employees-original-v2.webp" alt="Six colorful Xroga AI employees with research, content, operations, development, and customer engagement roles"
                fill sizes="(max-width: 1279px) 90vw, 38vw" className={styles.artImage} />
            </figure>
          </div>
          <div className={styles.sceneFooter} aria-label="Growth outcomes">
            <span><Bot aria-hidden="true" /> Specialized AI employees</span>
            <span><TrendingUp aria-hidden="true" /> Business growth</span>
            <span><Globe2 aria-hidden="true" /> SEO · AEO · GEO</span>
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
