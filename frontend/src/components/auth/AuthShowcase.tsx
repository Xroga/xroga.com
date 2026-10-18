'use client';

import Image from 'next/image';
import {
  AppWindow,
  Bot,
  BrainCircuit,
  CheckCircle2,
  Code2,
  Globe2,
  Plane,
  PlugZap,
  Rocket,
  Search,
  Sparkles,
  TestTube2,
  TrendingUp,
} from 'lucide-react';

import styles from './AuthPowerPanel.module.css';

const BUILD_STAGES = [
  { label: 'Talk', icon: Sparkles },
  { label: 'Research', icon: Search },
  { label: 'Build', icon: Code2 },
  { label: 'Test', icon: TestTube2 },
  { label: 'Ship', icon: Rocket },
] as const;

const COMPANY_MARKS = [
  { name: 'GitHub', src: '/brand/logos/github.svg' },
  { name: 'Vercel', src: '/brand/logos/vercel.svg' },
  { name: 'Supabase', src: '/brand/logos/supabase.svg' },
  { name: 'OpenAI', src: '/brand/logos/openai.svg' },
  { name: 'GitLab', src: '/brand/logos/gitlab.svg' },
  { name: 'Anthropic', src: '/brand/logos/anthropic.svg' },
] as const;

const EMPLOYEES = [
  { label: 'Research', tone: 'cyan' },
  { label: 'Content', tone: 'violet' },
  { label: 'Operations', tone: 'amber' },
  { label: 'Development', tone: 'blue' },
  { label: 'Customer', tone: 'rose' },
] as const;

export function AuthShowcase() {
  return (
    <section className={styles.panel} aria-label="What you can do with Xroga">
      <div className={styles.aurora} aria-hidden="true" />
      <div className={styles.grid} aria-hidden="true" />

      <header className={styles.header}>
        <Image
          src="/brand/xroga-orb-wordmark-dark-v3.webp"
          alt="Xroga"
          width={168}
          height={54}
          priority
          unoptimized
          className={styles.logo}
        />
        <span className={styles.live}><i /> One AI workspace</span>
      </header>

      <div className={styles.hero}>
        <p className={styles.eyebrow}><BrainCircuit aria-hidden="true" /> Built for the whole journey</p>
        <h2>Bring the idea.<br /><em>Xroga moves the work.</em></h2>
        <p>
          Go from a simple conversation to research, software, verified releases,
          browser work, and business growth—all from one workspace.
        </p>
      </div>

      <div className={styles.flow} aria-label="Xroga product workflow">
        {BUILD_STAGES.map(({ label, icon: Icon }, index) => (
          <div className={styles.stage} key={label}>
            <span><Icon aria-hidden="true" /></span>
            <b>{label}</b>
            {index < BUILD_STAGES.length - 1 ? <i aria-hidden="true" /> : null}
          </div>
        ))}
      </div>

      <div className={styles.cards}>
        <article className={`${styles.card} ${styles.buildCard}`}>
          <div className={styles.cardIcon}><AppWindow aria-hidden="true" /></div>
          <div>
            <p className={styles.cardKicker}>Build anything</p>
            <h3>Apps that reach production</h3>
            <p>Plan, code, test, repair, and prepare web, iOS, Android, and desktop products for publishing.</p>
          </div>
          <div className={styles.checks} aria-label="Build workflow">
            <span><CheckCircle2 /> UI &amp; logic</span>
            <span><CheckCircle2 /> Automated checks</span>
            <span><CheckCircle2 /> Release evidence</span>
          </div>
        </article>

        <article className={`${styles.card} ${styles.browserCard}`}>
          <div className={styles.cardIcon}><AppWindow aria-hidden="true" /></div>
          <p className={styles.cardKicker}>Live browser work</p>
          <h3>Test it like a real user</h3>
          <p>Run browser automations, inspect screens and flows, then fix broken UI, buttons, and functionality.</p>
          <div className={styles.browserWindow} aria-hidden="true">
            <div><i /><i /><i /><span>xroga.com/preview</span></div>
            <p><Bot /> Testing checkout flow…</p>
            <b><CheckCircle2 /> 12 interactions verified</b>
          </div>
        </article>

        <article className={`${styles.card} ${styles.connectCard}`}>
          <div className={styles.connectTitle}>
            <div className={styles.cardIcon}><PlugZap aria-hidden="true" /></div>
            <div><p className={styles.cardKicker}>Connected work</p><h3>1,500+ apps &amp; custom MCPs</h3></div>
          </div>
          <p>Connect the services you already use and let Xroga act across approved tools.</p>
          <div className={styles.logos} aria-label="Supported integration examples">
            {COMPANY_MARKS.map((company) => (
              <span key={company.name} title={company.name}>
                <Image src={company.src} alt={company.name} width={22} height={22} unoptimized />
              </span>
            ))}
            <b>+1,494</b>
          </div>
        </article>

        <article className={`${styles.card} ${styles.growthCard}`}>
          <div className={styles.growthTop}>
            <div>
              <p className={styles.cardKicker}>Growth workspace</p>
              <h3>SEO · AEO · GEO</h3>
            </div>
            <span><TrendingUp /> +42%</span>
          </div>
          <div className={styles.chart} aria-label="Illustrative discoverability trend">
            <svg viewBox="0 0 220 64" role="img" aria-label="Illustrative upward growth graph">
              <defs>
                <linearGradient id="auth-growth-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#8b5cf6" stopOpacity=".42" />
                  <stop offset="1" stopColor="#8b5cf6" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M2 58 C28 52 32 40 54 43 S88 51 108 32 S143 37 162 20 S194 22 218 5 L218 64 L2 64 Z" fill="url(#auth-growth-fill)" />
              <path d="M2 58 C28 52 32 40 54 43 S88 51 108 32 S143 37 162 20 S194 22 218 5" fill="none" stroke="#a78bfa" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <small>Illustrative signals</small>
          </div>
          <p>Research demand, create human-quality content, measure visibility, and improve what customers discover.</p>
        </article>
      </div>

      <article className={styles.employeeCard}>
        <div className={styles.employeeCopy}>
          <span><Bot aria-hidden="true" /></span>
          <div><p className={styles.cardKicker}>Xroga AI Employees</p><h3>Specialized workers for real work</h3></div>
        </div>
        <div className={styles.employees} aria-label="AI employee roles">
          {EMPLOYEES.map((employee) => (
            <span key={employee.label} data-tone={employee.tone}>{employee.label}</span>
          ))}
        </div>
      </article>

      <footer className={styles.footer}>
        <span><Globe2 /> Research the web &amp; X</span>
        <span><Plane /> Travel, flights &amp; more</span>
        <span><Rocket /> Work automatically with Xroga</span>
      </footer>
    </section>
  );
}
