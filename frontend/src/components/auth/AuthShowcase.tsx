'use client';

import Image from 'next/image';
import { Plus, ScanSearch, Globe2, SquareTerminal } from 'lucide-react';
import { type CSSProperties, useEffect, useState } from 'react';
import styles from './AuthPowerPanel.module.css';

const STORIES = [
  { label: 'Create · write · organize', title: 'Your next big idea.', accent: 'Built with Xroga.', description: 'Start with a conversation. Create tasks, images, documents, presentations, and spreadsheets. Turn ideas into plans, content, and work you can share.', features: ['Images & documents', 'Slides & spreadsheets', 'Blogs & content', 'Tasks & project plans'], color: '#22c9e8' },
  { label: 'Code · test · repair · launch', title: 'Build for every screen.', accent: 'Keep moving forward.', description: 'Build websites and responsive apps. Test real browser interactions, find UI and functional errors, and work through repairs on long-running projects.', features: ['Web & mobile projects', 'Browser testing', 'Debugging & repairs', 'Deployment workflows'], color: '#8b83f6' },
  { label: 'Find · connect · automate', title: 'Your tools, together.', accent: 'Less busywork.', description: 'Find answers and files, connect apps and custom MCP tools, and automate browser workflows. Put specialized AI employees to work across your business.', features: ['App integrations & MCP', 'Answers & file search', 'Live browser automation', 'Specialized AI employees'], color: '#eda46c' },
  { label: 'Research · discover · grow', title: 'Explore every angle.', accent: 'Move with insight.', description: 'Research the web and X, compare sources, and plan travel. Create content for SEO, AEO, and GEO, with approval before sensitive actions or purchases.', features: ['Web & X research', 'Travel & flight planning', 'SEO · AEO · GEO', 'Business & content growth'], color: '#69cbb0' },
] as const;

const CAPABILITIES = [
  { title: 'Create', description: 'Tasks, images, docs', icon: Plus, slide: 0 },
  { title: 'Find', description: 'Answers & files', icon: ScanSearch, slide: 2 },
  { title: 'Research', description: 'Apps & web', icon: Globe2, slide: 3 },
  { title: 'Code', description: 'Build apps', icon: SquareTerminal, slide: 1 },
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
      <p className={styles.voicePrompt}>Describe your idea in your language.<br /><strong>Speak with voice, or simply type.</strong></p>
      <div className={styles.copyArea}>
        {STORIES.map((story, index) => (
          <article key={story.title} className={styles.story} hidden={activeSlide !== index}>
            <p className={styles.eyebrow}><span />{story.label}</p>
            <h2>{story.title}<br /><em>{story.accent}</em></h2>
            <p className={styles.description}>{story.description}</p>
            <ul className={styles.features} aria-label={`${story.label} features`}>
              {story.features.map(feature => <li key={feature}>{feature}</li>)}
            </ul>
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
