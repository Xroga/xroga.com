'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useState, type CSSProperties, type WheelEvent } from 'react';
import { SHOWCASE_TEMPLATES, thumbnailFor } from '@/lib/showcase/registry';

const INITIAL_TEMPLATE = Math.max(0, SHOWCASE_TEMPLATES.findIndex((item) => item.slug === 'ai-saas-chatbot'));

export function HomepageShowcase() {
  const [activeIndex, setActiveIndex] = useState(INITIAL_TEMPLATE);
  const template = SHOWCASE_TEMPLATES[activeIndex];

  const selectTemplate = useCallback((index: number) => setActiveIndex(index), []);
  const step = (direction: -1 | 1) => selectTemplate((activeIndex + direction + SHOWCASE_TEMPLATES.length) % SHOWCASE_TEMPLATES.length);
  const scrollTemplates = useCallback((event: WheelEvent<HTMLElement>) => {
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      event.preventDefault();
      event.currentTarget.scrollLeft += event.deltaY;
    }
  }, []);

  return (
    <section className="xv-editorial-showcase xv-showcase-gallery" aria-labelledby="showcase-home-heading">
      <div className="xv-showcase-gallery__canvas" style={{ '--showcase-accent': template.accent } as CSSProperties}>
        <header className="xv-showcase-gallery__header" aria-live="polite">
          <div>
            <small>{template.category} · Live template</small>
            <h2 id="showcase-home-heading">{template.name}</h2>
          </div>
          <div className="xv-showcase-gallery__header-actions">
            <span>{String(activeIndex + 1).padStart(2, '0')} / {String(SHOWCASE_TEMPLATES.length).padStart(2, '0')}</span>
            <Link href={`/showcase/${template.slug}`}>Use template <ArrowRight aria-hidden="true" /></Link>
            <Link href={`/showcase/${template.slug}/preview`}>Open preview <ArrowUpRight aria-hidden="true" /></Link>
          </div>
        </header>

        <div className="xv-showcase-gallery__stage">
          <div className="xv-showcase-laptop">
            <Link className="xv-showcase-laptop__lid" href={`/showcase/${template.slug}/preview`} aria-label={`Open ${template.name} desktop preview`}>
              <span className="xv-showcase-laptop__camera" aria-hidden="true" />
              <span className="xv-showcase-laptop__browser" aria-hidden="true">
                <i /><i /><i />
                <code>xroga.com/showcase/{template.slug}</code>
              </span>
              <span className="xv-showcase-laptop__screen">
                <Image
                  key={`${template.slug}-desktop`}
                  src={thumbnailFor(template, 'desktop')}
                  alt={`${template.name} desktop preview`}
                  fill
                  priority={activeIndex === INITIAL_TEMPLATE}
                  sizes="(max-width: 760px) 1px, 82vw"
                />
              </span>
            </Link>
            <span className="xv-showcase-laptop__base" aria-hidden="true"><i /></span>
          </div>

          <Link className="xv-showcase-phone" href={`/showcase/${template.slug}/preview`} aria-label={`Open ${template.name} mobile preview`}>
            <span className="xv-showcase-phone__speaker" aria-hidden="true" />
            <span className="xv-showcase-phone__screen">
              <Image
                key={`${template.slug}-mobile`}
                src={thumbnailFor(template, 'mobile')}
                alt={`${template.name} mobile preview`}
                fill
                sizes="(max-width: 760px) 76vw, 17vw"
              />
            </span>
            <span className="xv-showcase-phone__home" aria-hidden="true" />
          </Link>

          <button type="button" className="xv-showcase-gallery__arrow is-left" onClick={() => step(-1)} aria-label="Previous template"><ChevronLeft aria-hidden="true" /></button>
          <button type="button" className="xv-showcase-gallery__arrow is-right" onClick={() => step(1)} aria-label="Next template"><ChevronRight aria-hidden="true" /></button>
        </div>

        <nav className="xv-showcase-gallery__rail" aria-label="Scroll through showcase templates" onWheel={scrollTemplates}>
          {SHOWCASE_TEMPLATES.map((item, index) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={index === activeIndex}
              className={index === activeIndex ? 'is-active' : undefined}
              onClick={() => selectTemplate(index)}
            >
              <span className="xv-showcase-gallery__rail-image">
                <Image src={thumbnailFor(item, 'desktop')} alt="" fill sizes="150px" />
              </span>
              <span><small>{item.category}</small><b>{item.name}</b></span>
            </button>
          ))}
        </nav>
      </div>
    </section>
  );
}
