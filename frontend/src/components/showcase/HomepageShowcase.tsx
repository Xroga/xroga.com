'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Check, ChevronLeft, ChevronRight, Monitor, ShieldCheck, Smartphone, WandSparkles } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SHOWCASE_TEMPLATES, thumbnailFor } from '@/lib/showcase/registry';
import { Logo } from '@/components/layout/Logo';

const INITIAL_TEMPLATE = Math.max(0, SHOWCASE_TEMPLATES.findIndex((item) => item.slug === 'ai-saas-chatbot'));

export function HomepageShowcase() {
  const sectionRef = useRef<HTMLElement>(null);
  const [activeIndex, setActiveIndex] = useState(INITIAL_TEMPLATE);
  const [isInView, setIsInView] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const template = SHOWCASE_TEMPLATES[activeIndex];

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const observer = new IntersectionObserver(([entry]) => setIsInView(entry.isIntersecting), { threshold: 0.3 });
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isInView || isPaused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => setActiveIndex((current) => (current + 1) % SHOWCASE_TEMPLATES.length), 5200);
    return () => window.clearInterval(timer);
  }, [isInView, isPaused]);

  const selectTemplate = useCallback((index: number) => setActiveIndex(index), []);
  const step = (direction: -1 | 1) => selectTemplate((activeIndex + direction + SHOWCASE_TEMPLATES.length) % SHOWCASE_TEMPLATES.length);

  return (
    <section
      ref={sectionRef}
      className="xv-editorial-showcase"
      aria-labelledby="showcase-home-heading"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsPaused(false);
      }}
    >
      <div className="xv-editorial-showcase__canvas" style={{ '--showcase-accent': template.accent } as React.CSSProperties}>
        <header className="xv-editorial-showcase__masthead">
          <Link href="/showcase" aria-label="Explore all Xroga templates">
            <Logo href={null} variant="homepage" height={34} />
          </Link>
          <span>PRODUCT SHOWCASE · {String(activeIndex + 1).padStart(2, '0')} / {String(SHOWCASE_TEMPLATES.length).padStart(2, '0')}</span>
          <p>Real working products. Ready to make yours.</p>
        </header>

        <div className="xv-editorial-showcase__devices">
          <Link className="xv-editorial-showcase__phone" href={`/showcase/${template.slug}/preview`} aria-label={`${template.name} mobile preview`}>
            <span className="xv-editorial-showcase__phone-speaker" aria-hidden="true" />
            <Image key={`${template.slug}-mobile`} src={thumbnailFor(template, 'mobile')} alt={`${template.name} mobile view`} fill sizes="(max-width: 700px) 34vw, 22vw" />
          </Link>

          <Link className="xv-editorial-showcase__desktop" href={`/showcase/${template.slug}/preview`} aria-label={`${template.name} desktop preview`}>
            <span className="xv-editorial-showcase__browserbar" aria-hidden="true"><i /><i /><i /><b>xroga.com/showcase/{template.slug}</b></span>
            <span className="xv-editorial-showcase__desktop-image">
              <Image key={`${template.slug}-desktop`} src={thumbnailFor(template, 'desktop')} alt={`${template.name} desktop view`} fill priority={activeIndex === INITIAL_TEMPLATE} sizes="(max-width: 700px) 78vw, 64vw" />
            </span>
          </Link>

          <button type="button" className="xv-editorial-showcase__arrow is-left" onClick={() => step(-1)} aria-label="Previous template"><ChevronLeft /></button>
          <button type="button" className="xv-editorial-showcase__arrow is-right" onClick={() => step(1)} aria-label="Next template"><ChevronRight /></button>
        </div>

        <nav className="xv-editorial-showcase__tabs" aria-label="Showcase templates">
          {SHOWCASE_TEMPLATES.map((item, index) => (
            <button key={item.id} type="button" aria-pressed={index === activeIndex} className={index === activeIndex ? 'is-active' : undefined} onClick={() => selectTemplate(index)}>
              <span>{item.category}</span><small>{item.name}</small>
            </button>
          ))}
        </nav>

        <article className="xv-editorial-showcase__story" aria-live="polite">
          <div className="xv-editorial-showcase__story-copy">
            <span>{template.category} · Live</span>
            <h2 id="showcase-home-heading">{template.name}</h2>
            <p>{template.shortDescription}</p>
          </div>
          <ul aria-label={`${template.name} capabilities`}>
            {template.capabilities.slice(0, 3).map((capability) => <li key={capability}><Check aria-hidden="true" />{capability}</li>)}
          </ul>
          <div className="xv-editorial-showcase__actions">
            <Link href={`/showcase/${template.slug}`}>Use this template <ArrowRight aria-hidden="true" /></Link>
            <Link href={`/showcase/${template.slug}/preview`}>Full preview <ArrowUpRight aria-hidden="true" /></Link>
          </div>
        </article>

        <footer className="xv-editorial-showcase__footer">
          <span><Monitor aria-hidden="true" /><b>Responsive</b><small>Desktop to mobile</small></span>
          <span><WandSparkles aria-hidden="true" /><b>Xroga-ready</b><small>Make every detail yours</small></span>
          <span><ShieldCheck aria-hidden="true" /><b>Verified</b><small>Real working previews</small></span>
          <Link href="/showcase">Explore all templates <ArrowUpRight aria-hidden="true" /></Link>
          <span className="xv-editorial-showcase__device-note"><Smartphone aria-hidden="true" /> Every template includes a real mobile view</span>
        </footer>
      </div>
    </section>
  );
}
