'use client';

import Image from 'next/image';
import {
  AppWindow, Bot, CheckCircle2, ChevronRight, Code2, Globe2, Pause, Plane,
  Play, PlugZap, Rocket, Search, Sparkles, TestTube2, TrendingUp,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import styles from './AuthPowerPanel.module.css';

const SLIDE_COUNT = 4;
const INTRO_DURATION_MS = 5200;
const FEATURE_DURATION_MS = 6200;

const COMPANY_MARKS = [
  { name: 'GitHub', src: '/brand/logos/github.svg' },
  { name: 'Vercel', src: '/brand/logos/vercel.svg' },
  { name: 'Supabase', src: '/brand/logos/supabase.svg' },
  { name: 'OpenAI', src: '/brand/logos/openai.svg' },
  { name: 'GitLab', src: '/brand/logos/gitlab.svg' },
  { name: 'Anthropic', src: '/brand/logos/anthropic.svg' },
] as const;

const BUILD_STAGES = [
  { label: 'Talk', icon: Sparkles },
  { label: 'Research', icon: Search },
  { label: 'Build', icon: Code2 },
  { label: 'Test', icon: TestTube2 },
  { label: 'Ship', icon: Rocket },
] as const;

const EMPLOYEE_ROLES = ['Research', 'Content', 'Operations', 'Development', 'Customer'] as const;

export function AuthShowcase() {
  const [activeSlide, setActiveSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setReducedMotion(query.matches);
    updatePreference();
    query.addEventListener('change', updatePreference);
    return () => query.removeEventListener('change', updatePreference);
  }, []);

  useEffect(() => {
    if (paused || reducedMotion) return;
    const duration = activeSlide === 0 ? INTRO_DURATION_MS : FEATURE_DURATION_MS;
    const timer = window.setTimeout(
      () => setActiveSlide((current) => (current + 1) % SLIDE_COUNT),
      duration,
    );
    return () => window.clearTimeout(timer);
  }, [activeSlide, paused, reducedMotion]);

  return (
    <section
      className={styles.panel}
      aria-label="Xroga capability story"
      aria-roledescription="carousel"
    >
      <header className={styles.header}>
        <Image src="/brand/xroga-orb-wordmark-dark-v3.webp" alt="Xroga" width={168} height={54}
          priority unoptimized className={styles.logo} />
        <div className={styles.headerControls}>
          <span className={styles.slideCount}>0{activeSlide + 1} / 0{SLIDE_COUNT}</span>
          <button type="button" className={styles.pauseButton}
            onClick={() => setPaused((current) => !current)}
            aria-label={paused ? 'Resume capability slides' : 'Pause capability slides'}>
            {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
          </button>
        </div>
      </header>

      <div className={styles.viewport} aria-live="polite">
        <article className={`${styles.slide} ${styles.introSlide} ${activeSlide === 0 ? styles.active : ''}`}
          aria-hidden={activeSlide !== 0}>
          <div className={styles.introGlow} aria-hidden="true" />
          <div className={styles.introCopy}>
            <p className={styles.eyebrow}><Sparkles aria-hidden="true" /> One workspace. Every stage.</p>
            <h2>Convert your ideas into <em>working businesses.</em></h2>
            <p>Describe what you want. Xroga researches, builds, tests, ships, and grows it with you.</p>
          </div>
          <div className={styles.swipeCue}>See what Xroga can do <ChevronRight aria-hidden="true" /></div>
        </article>

        <article className={`${styles.slide} ${styles.buildSlide} ${activeSlide === 1 ? styles.active : ''}`}
          aria-hidden={activeSlide !== 1}>
          <div className={styles.sceneCopy}>
            <p className={styles.eyebrow}><Rocket aria-hidden="true" /> From prompt to production</p>
            <h2>Build it. Test it.<br /><em>Ship it everywhere.</em></h2>
            <p>Turn a simple conversation into working web, iOS, Android, desktop, or API products—with automatic testing and publishing support.</p>
          </div>
          <div className={styles.buildStudio} aria-label="Xroga build workflow">
            <div className={styles.stageRail}>
              {BUILD_STAGES.map(({ label, icon: Icon }) => (
                <span className={styles.stage} key={label}><i><Icon aria-hidden="true" /></i>{label}</span>
              ))}
            </div>
            <div className={styles.browserMock} aria-hidden="true">
              <div className={styles.browserBar}><i /><i /><i /><span>xroga.com/preview</span></div>
              <div className={styles.browserBody}>
                <AppWindow className={styles.floatingIcon} />
                <CheckCircle2 className={styles.successIcon} />
                <span className={styles.testLine}>Acting as a real user…</span>
                <b>18 flows verified</b>
              </div>
            </div>
          </div>
        </article>

        <article className={`${styles.slide} ${styles.connectSlide} ${activeSlide === 2 ? styles.active : ''}`}
          aria-hidden={activeSlide !== 2}>
          <div className={styles.sceneCopy}>
            <p className={styles.eyebrow}><PlugZap aria-hidden="true" /> Connected intelligence</p>
            <h2>1,500+ apps.<br /><em>One place to work.</em></h2>
            <p>Connect approved tools and custom MCPs. Research the web and X, run live browser automations, plan travel, and move work forward.</p>
          </div>
          <div className={styles.logoCloud} aria-label="Supported integration examples">
            {COMPANY_MARKS.map((company) => (
              <span className={styles.logoTile} key={company.name} title={company.name}>
                <Image src={company.src} alt={company.name} width={32} height={32} unoptimized />
              </span>
            ))}
          </div>
          <div className={styles.automationStrip}>
            <span><Globe2 aria-hidden="true" /> Web &amp; X research</span>
            <span><Plane aria-hidden="true" /> Travel &amp; flights</span>
            <span><Bot aria-hidden="true" /> Browser automation</span>
          </div>
        </article>

        <article className={`${styles.slide} ${styles.growthSlide} ${activeSlide === 3 ? styles.active : ''}`}
          aria-hidden={activeSlide !== 3}>
          <div className={styles.sceneCopy}>
            <p className={styles.eyebrow}><TrendingUp aria-hidden="true" /> Build, operate, grow</p>
            <h2>AI employees for<br /><em>real business work.</em></h2>
            <p>Specialized workers research, create, operate, support, and grow your business across SEO, AEO, and GEO.</p>
          </div>
          <div className={styles.growthGrid}>
            <div className={styles.chartCard} aria-label="Illustrative discoverability trend">
              <span className={styles.growthBadge}><TrendingUp aria-hidden="true" /> +42%</span>
              <svg viewBox="0 0 260 100" role="img" aria-label="Illustrative upward growth graph">
                <path className={styles.graphLine} d="M4 90 C35 82 43 57 73 62 S112 77 139 45 S180 52 204 27 S235 26 256 7" />
              </svg>
              <small>Illustrative visibility signals</small>
            </div>
            <div className={styles.employeeCard}>
              <div className={styles.employeeHeading}><Bot aria-hidden="true" /><span>Xroga AI Employees</span></div>
              <div className={styles.employeeRoles}>
                {EMPLOYEE_ROLES.map((role) => <span key={role}>{role}</span>)}
              </div>
            </div>
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
