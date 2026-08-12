'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Gamepad2,
  Monitor,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Sparkles,
  WandSparkles,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SHOWCASE_TEMPLATES, thumbnailFor } from '@/lib/showcase/registry';
import { cn } from '@/lib/utils';

const categoryIcons = [Monitor, ShoppingBag, CalendarDays, Smartphone, Sparkles, Gamepad2] as const;

export function HomepageShowcase() {
  const sectionRef = useRef<HTMLElement>(null);
  const frameRef = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const template = SHOWCASE_TEMPLATES[activeIndex];
  const previous = SHOWCASE_TEMPLATES[(activeIndex - 1 + SHOWCASE_TEMPLATES.length) % SHOWCASE_TEMPLATES.length];
  const next = SHOWCASE_TEMPLATES[(activeIndex + 1) % SHOWCASE_TEMPLATES.length];

  useEffect(() => {
    const updateFromScroll = () => {
      frameRef.current = null;
      const section = sectionRef.current;
      if (!section) return;
      const rect = section.getBoundingClientRect();
      const travel = Math.max(1, section.offsetHeight - window.innerHeight);
      const progress = Math.min(1, Math.max(0, -rect.top / travel));
      setActiveIndex(Math.min(SHOWCASE_TEMPLATES.length - 1, Math.floor(progress * SHOWCASE_TEMPLATES.length)));
    };
    const onScroll = () => {
      if (frameRef.current !== null) return;
      frameRef.current = window.requestAnimationFrame(updateFromScroll);
    };
    updateFromScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const selectTemplate = useCallback((index: number) => {
    const section = sectionRef.current;
    setActiveIndex(index);
    if (!section) return;
    const travel = Math.max(1, section.offsetHeight - window.innerHeight);
    const top = window.scrollY + section.getBoundingClientRect().top;
    const position = top + travel * ((index + 0.5) / SHOWCASE_TEMPLATES.length);
    window.scrollTo({ top: position, behavior: 'smooth' });
  }, []);

  const step = (direction: -1 | 1) => {
    selectTemplate((activeIndex + direction + SHOWCASE_TEMPLATES.length) % SHOWCASE_TEMPLATES.length);
  };

  return (
    <section ref={sectionRef} className="xv-showcase-scroll" aria-labelledby="showcase-home-heading">
      <div className="xv-showcase-stage">
        <div className="xv-showcase-grid" aria-hidden="true" />
        <header className="xv-showcase-heading">
          <p className="xv-showcase-kicker"><span /> BUILT WITH XROGA AI <span /></p>
          <h2 id="showcase-home-heading">See what you can <em>build.</em></h2>
          <p className="xv-showcase-subtitle">Start from something powerful.</p>
          <p className="xv-showcase-copy">
            Explore complete Xroga products across web, marketplaces, booking, mobile, AI, and games—then make one yours.
          </p>
        </header>

        <div className="xv-showcase-visual" style={{ '--showcase-accent': template.accent } as React.CSSProperties}>
          <div className="xv-showcase-side xv-showcase-side--left" aria-hidden="true">
            <Image src={thumbnailFor(previous)} alt="" fill sizes="22vw" />
          </div>
          <button type="button" className="xv-showcase-arrow xv-showcase-arrow--left" onClick={() => step(-1)} aria-label="Previous template">
            <ChevronLeft aria-hidden="true" />
          </button>

          <Link
            href={`/showcase/${template.slug}/preview`}
            className={cn('xv-showcase-preview', template.mobileApp && 'is-mobile')}
            aria-label={`Open live preview of ${template.name}`}
          >
            <span className="xv-showcase-windowbar" aria-hidden="true"><i /><i /><i /><b>{template.category}</b></span>
            <span className="xv-showcase-image">
              <Image
                key={`${template.slug}-${template.mobileApp ? 'mobile' : 'desktop'}`}
                src={thumbnailFor(template, template.mobileApp ? 'mobile' : 'desktop')}
                alt={`${template.name} real product preview`}
                fill
                priority={activeIndex === 0}
                sizes={template.mobileApp ? '(max-width: 640px) 54vw, 24vw' : '(max-width: 900px) 88vw, 58vw'}
              />
            </span>
          </Link>

          <button type="button" className="xv-showcase-arrow xv-showcase-arrow--right" onClick={() => step(1)} aria-label="Next template">
            <ChevronRight aria-hidden="true" />
          </button>
          <div className="xv-showcase-side xv-showcase-side--right" aria-hidden="true">
            <Image src={thumbnailFor(next)} alt="" fill sizes="22vw" />
          </div>
        </div>

        <div className="xv-showcase-dock" role="tablist" aria-label="Template categories">
          {SHOWCASE_TEMPLATES.map((item, index) => {
            const Icon = categoryIcons[index];
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={activeIndex === index}
                className={activeIndex === index ? 'is-active' : undefined}
                onClick={() => selectTemplate(index)}
              >
                <Icon aria-hidden="true" />
                <span>{item.category === 'Mobile app' ? 'Mobile App' : item.category}</span>
              </button>
            );
          })}
        </div>

        <article className="xv-showcase-detail" aria-live="polite">
          <div className="xv-showcase-detail-icon" aria-hidden="true">
            {(() => { const Icon = categoryIcons[activeIndex]; return <Icon />; })()}
          </div>
          <div className="xv-showcase-detail-copy">
            <span>{template.category} · Live</span>
            <h3>{template.name}</h3>
            <p>{template.shortDescription}</p>
          </div>
          <ul className="xv-showcase-capabilities" aria-label="Included capabilities">
            {template.capabilities.slice(0, 3).map((capability) => <li key={capability}>{capability}</li>)}
          </ul>
          <div className="xv-showcase-actions">
            <Link href={`/showcase/${template.slug}`}>Use this template <ArrowRight aria-hidden="true" /></Link>
            <Link href={`/showcase/${template.slug}/preview`}>Preview live <ArrowUpRight aria-hidden="true" /></Link>
          </div>
        </article>

        <div className="xv-showcase-stack" aria-label="Technology stack">
          <span>BUILT WITH MODERN STACK</span>
          <div>{template.technologies.map((technology) => <b key={technology}>{technology}</b>)}</div>
        </div>

        <div className="xv-showcase-proof" aria-label="Template qualities">
          <span><Monitor aria-hidden="true" /><b>Responsive</b><small>Desktop to mobile</small></span>
          <span><WandSparkles aria-hidden="true" /><b>Xroga-ready</b><small>Make every detail yours</small></span>
          <span><ShieldCheck aria-hidden="true" /><b>Verified</b><small>Real working previews</small></span>
          <Link href="/showcase">Explore all templates <ArrowUpRight aria-hidden="true" /></Link>
        </div>

        <div className="xv-showcase-progress" aria-hidden="true">
          {SHOWCASE_TEMPLATES.map((item, index) => <i key={item.id} className={index === activeIndex ? 'is-active' : undefined} />)}
        </div>
      </div>
    </section>
  );
}
