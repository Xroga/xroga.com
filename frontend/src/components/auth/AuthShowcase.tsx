'use client';

import Image from 'next/image';
import { Plus, ScanSearch, Globe2, SquareTerminal } from 'lucide-react';
import { type CSSProperties, useEffect, useState } from 'react';
import styles from './AuthPowerPanel.module.css';

const STORIES = [
  { label: 'Create · write · organize', title: 'Your next big idea.', accent: 'Built with Xroga.', description: 'Create images, documents, slides, spreadsheets, and content—from a single idea.', color: '#22c9e8' },
  { label: 'Code · test · repair · launch', title: 'Build for every screen.', accent: 'Keep moving forward.', description: 'Build responsive apps, test in the browser, repair errors, and prepare for launch.', color: '#8b83f6' },
  { label: 'Find · connect · automate', title: 'Your tools, together.', accent: 'Less busywork.', description: 'Find files and answers. Connect apps, automate browser work, and delegate to AI employees.', color: '#eda46c' },
  { label: 'Research · discover · grow', title: 'Explore every angle.', accent: 'Move with insight.', description: 'Explore web and X sources, plan travel, and grow with SEO, AEO, and GEO.', color: '#69cbb0' },
] as const;

const CAPABILITIES = [
  { title: 'Create', description: 'Tasks, images, docs & slides', icon: Plus, slide: 0 },
  { title: 'Find', description: 'Answers, files & connected apps', icon: ScanSearch, slide: 2 },
  { title: 'Research', description: 'Web, sources, travel & insights', icon: Globe2, slide: 3 },
  { title: 'Code', description: 'Build, test, fix & launch apps', icon: SquareTerminal, slide: 1 },
] as const;

export function AuthShowcase() {
  const [activeSlide, setActiveSlide] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setReducedMotion(query.matches);
    updatePreference();
    query.addEventListener('change', updatePreference);
    return () => query.removeEventListener('change', updatePreference);
  }, []);

  useEffect(() => {
    if (reducedMotion || paused) return;
    const timer = window.setTimeout(() => setActiveSlide(current => (current + 1) % STORIES.length), 6500);
    return () => window.clearTimeout(timer);
  }, [activeSlide, reducedMotion, paused]);

  return (
    <section className={styles.panel} aria-label="Xroga capability story" aria-roledescription="carousel"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}>
      <div className={styles.pattern} aria-hidden="true" style={{ backgroundColor: STORIES[activeSlide].color }} />
      <header className={styles.header}>
        <Image src="/brand/xroga-orb-wordmark-dark-v3.webp" alt="Xroga" width={160} height={60} priority />
      </header>
      <nav className={styles.capabilities} aria-label="Explore Xroga capabilities">
        {CAPABILITIES.map(({ title, description, icon: Icon, slide }) => (
          <button key={title} type="button" onClick={() => setActiveSlide(slide)}
            style={{ '--card-accent': STORIES[slide].color } as CSSProperties}
            aria-pressed={activeSlide === slide}>
            <Icon aria-hidden="true" />
            <strong>{title}</strong>
            <span>{description}</span>
          </button>
        ))}
      </nav>
      <div className={styles.copyArea}>
        {STORIES.map((story, index) => (
          <article key={story.title} className={styles.story} hidden={activeSlide !== index}>
            <p className={styles.eyebrow}><span />{story.label}</p>
            <h2>{story.title}<br /><em>{story.accent}</em></h2>
            <p className={styles.description}>{story.description}</p>
          </article>
        ))}
        <nav className={styles.dots} aria-label="Choose a capability slide">
          {STORIES.map((story, index) => (
            <button key={story.title} type="button" aria-label={`Show capability slide ${index + 1}`}
              aria-current={activeSlide === index ? 'true' : undefined}
              onClick={() => setActiveSlide(index)}><span /></button>
          ))}
        </nav>
      </div>
    </section>
  );
}
