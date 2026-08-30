'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Pause, Play } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type WheelEvent,
} from 'react';
import { SHOWCASE_TEMPLATES, thumbnailFor } from '@/lib/showcase/registry';

const INITIAL_TEMPLATE = Math.max(0, SHOWCASE_TEMPLATES.findIndex((item) => item.slug === 'ai-saas-chatbot'));
const AUTO_ADVANCE_MS = 8_000;

export function HomepageShowcase() {
  const [activeIndex, setActiveIndex] = useState(INITIAL_TEMPLATE);
  const [autoplayEnabled, setAutoplayEnabled] = useState(true);
  const railRef = useRef<HTMLElement>(null);
  const reducedMotion = useReducedMotion();
  const template = SHOWCASE_TEMPLATES[activeIndex];
  const isPaused = !autoplayEnabled || reducedMotion;

  useEffect(() => {
    if (isPaused) return;
    const timer = window.setTimeout(() => {
      setActiveIndex((current) => (current + 1) % SHOWCASE_TEMPLATES.length);
    }, AUTO_ADVANCE_MS);
    return () => window.clearTimeout(timer);
  }, [activeIndex, isPaused]);

  useEffect(() => {
    const rail = railRef.current;
    const active = rail?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    if (!rail || !active) return;
    rail.scrollTo({
      left: active.offsetLeft - rail.clientWidth / 2 + active.clientWidth / 2,
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  }, [activeIndex, reducedMotion]);

  const selectTemplate = useCallback((index: number) => setActiveIndex(index), []);
  const scrollTemplates = useCallback((event: WheelEvent<HTMLElement>) => {
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      event.preventDefault();
      event.currentTarget.scrollLeft += event.deltaY;
    }
  }, []);
  return (
    <section className="xv-editorial-showcase xv-showcase-gallery" aria-labelledby="showcase-home-heading">
      <div
        className="xv-showcase-gallery__canvas"
        data-autoplay={isPaused ? 'paused' : 'running'}
        style={{ '--showcase-accent': template.accent } as CSSProperties}
      >
        <div className="xv-showcase-gallery__stage">
          <Link className="xv-showcase-display" href={`/showcase/${template.slug}/preview`} aria-label={`Open ${template.name} desktop preview`}>
            <Image
              key={`${template.slug}-desktop`}
              src={thumbnailFor(template, 'desktop')}
              alt={`${template.name} desktop preview`}
              fill
              priority={activeIndex === INITIAL_TEMPLATE}
              sizes="(max-width: 760px) 64vw, 72vw"
            />
          </Link>

          <Link className="xv-showcase-phone" href={`/showcase/${template.slug}/preview`} aria-label={`Open ${template.name} mobile preview`}>
            <span className="xv-showcase-phone__speaker" aria-hidden="true" />
            <span className="xv-showcase-phone__screen">
              <Image
                key={`${template.slug}-mobile`}
                src={thumbnailFor(template, 'mobile')}
                alt={`${template.name} mobile preview`}
                fill
                priority={activeIndex === INITIAL_TEMPLATE}
                sizes="(max-width: 760px) 28vw, 24vw"
              />
            </span>
            <span className="xv-showcase-phone__home" aria-hidden="true" />
          </Link>
        </div>

        <header className="xv-showcase-gallery__header" aria-live={isPaused ? 'polite' : 'off'}>
          <div>
            <small>{template.category} · Live template</small>
            <h2 id="showcase-home-heading">{template.name}</h2>
          </div>
          <div className="xv-showcase-gallery__header-actions">
            <span className="xv-showcase-gallery__count">{String(activeIndex + 1).padStart(2, '0')} / {String(SHOWCASE_TEMPLATES.length).padStart(2, '0')}</span>
            <button
              type="button"
              className="xv-showcase-gallery__autoplay"
              aria-label={autoplayEnabled ? 'Pause automatic template rotation' : 'Play automatic template rotation'}
              aria-pressed={!autoplayEnabled}
              onClick={() => setAutoplayEnabled((enabled) => !enabled)}
            >
              {autoplayEnabled ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
            </button>
            <Link href={`/showcase/${template.slug}`}>Use template <ArrowRight aria-hidden="true" /></Link>
            <Link href={`/showcase/${template.slug}/preview`}>Open preview <ArrowUpRight aria-hidden="true" /></Link>
          </div>
        </header>

        <nav ref={railRef} className="xv-showcase-gallery__rail" aria-label="Scroll through showcase templates" onWheel={scrollTemplates}>
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
