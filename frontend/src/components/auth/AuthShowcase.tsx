'use client';

import Image from 'next/image';
import {
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Globe2,
  Plane,
  PlugZap,
  Rocket,
  Search,
  Sparkles,
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

function TrendChart({ variant = 'blue' }: { variant?: 'blue' | 'orange' }) {
  return (
    <svg className={`${styles.trendChart} ${variant === 'orange' ? styles.orangeChart : ''}`}
      viewBox="0 0 260 82" aria-hidden="true" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`trend-fill-${variant}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity=".24" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className={styles.chartGrid} d="M0 18H260M0 41H260M0 64H260" />
      <path className={styles.chartArea} fill={`url(#trend-fill-${variant})`}
        d="M0 70L24 64L47 67L71 53L94 57L118 42L142 47L165 31L189 35L212 21L236 25L260 10V82H0Z" />
      <path className={styles.chartLine}
        d="M0 70L24 64L47 67L71 53L94 57L118 42L142 47L165 31L189 35L212 21L236 25L260 10" />
    </svg>
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
          <Image src="/brand/auth-stories/idea-to-business-clean.webp" alt="A clean product workspace turning an idea into a digital product"
            fill priority sizes="(max-width: 1279px) 100vw, 44vw" className={styles.fullBleedArt} />
          <div className={styles.artVeil} aria-hidden="true" />
          <div className={styles.introCopy}>
            <p className={styles.eyebrow}><Sparkles aria-hidden="true" /> One idea. A complete business.</p>
            <h2>Imagine it.<br /><em>Xroga makes it real.</em></h2>
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
            <p className={styles.eyebrow}><Rocket aria-hidden="true" /> From idea to every screen</p>
            <h2>Build once.<br /><em>Launch everywhere.</em></h2>
            <p>Web, mobile, tablet, desktop, and APIs—built, tested like a real user, repaired, and prepared for release.</p>
          </div>
          <div className={styles.visualStage}>
            <figure className={styles.heroArt}>
              <Image src="/brand/auth-stories/publish-everywhere-clean.webp" alt="One clean product delivered across laptop, tablet, and phone"
                fill sizes="(max-width: 1279px) 90vw, 38vw" className={styles.artImage} />
            </figure>
            <section className={`${styles.dataPanel} ${styles.launchPanel}`} aria-label="Example launch readiness">
              <div className={styles.dataPanelHeader}>
                <span><Image src="/brand/xroga-orb-mark-v2.webp" alt="" width={18} height={18} /> Launch readiness</span>
                <strong>94%</strong>
              </div>
              <TrendChart />
              <div className={styles.kpiRow}>
                <span><strong>128</strong><small>checks passed</small></span>
                <span><strong>0</strong><small>blockers</small></span>
                <span><strong>4</strong><small>targets</small></span>
              </div>
            </section>
            <figure className={styles.secondaryArt}>
              <Image src="/brand/auth-stories/ai-testing-clean.webp" alt="A clean quality-assurance scene resolving an issue"
                fill sizes="(max-width: 700px) 42vw, 17vw" className={styles.artImage} />
              <figcaption><TestTube2 aria-hidden="true" /> Tested and repaired</figcaption>
            </figure>
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
              <Image src="/brand/auth-stories/xroga-employees-clean.webp" alt="A clean studio portrait of six specialized Xroga employees"
                fill sizes="(max-width: 1279px) 90vw, 38vw" className={styles.artImage} />
            </figure>
            <section className={`${styles.dataPanel} ${styles.growthPanel}`} aria-label="Example visibility growth">
              <div className={styles.dataPanelHeader}>
                <span><TrendingUp aria-hidden="true" /> Visibility</span>
                <strong><ArrowUpRight aria-hidden="true" /> 42%</strong>
              </div>
              <TrendChart variant="orange" />
              <div className={styles.visibilityStats}>
                <span><Search aria-hidden="true" /><b>SEO</b><strong>+42%</strong></span>
                <span><CheckCircle2 aria-hidden="true" /><b>AEO</b><strong>78%</strong></span>
                <span><Globe2 aria-hidden="true" /><b>GEO</b><strong>+31%</strong></span>
              </div>
            </section>
            <figure className={`${styles.secondaryArt} ${styles.visibilityArt}`}>
              <Image src="/brand/auth-stories/seo-aeo-geo-clean.webp" alt="Clean search, answer, and geographic discovery objects"
                fill sizes="(max-width: 700px) 42vw, 17vw" className={styles.artImage} />
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
