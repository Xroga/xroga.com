'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import styles from './AuthPowerPanel.module.css';

const STORIES = [
  { label: 'From a conversation to something real', title: 'Your next big idea.', accent: 'Built with Xroga.', description: 'Think out loud. Research the possibilities, shape your idea, and turn your conversation into a working project.', color: '#22c9e8' },
  { label: 'Build · test · repair', title: 'Build for every screen.', accent: 'Keep moving forward.', description: 'Create responsive apps, test in the browser, and work through fixes. Keep long-running projects moving from the first version to launch.', color: '#8b83f6' },
  { label: 'Connected apps · browser workflows', title: 'Less busywork.', accent: 'More possibility.', description: 'Bring your apps and custom MCP tools together. Research, plan, and run browser workflows, with approvals for sensitive actions.', color: '#eda46c' },
  { label: 'AI employees · SEO · AEO · GEO', title: 'Your team for', accent: 'what comes next.', description: 'Put specialized AI employees to work on research, content, operations, and development. Build a stronger presence across search and AI discovery.', color: '#69cbb0' },
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
        <Image src="/brand/xroga-orb-mark-v2.webp" alt="" width={28} height={28} priority unoptimized />
        <span>Xroga</span>
      </header>
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
