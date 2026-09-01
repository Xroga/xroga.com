'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

const AUDIENCES = [
  {
    label: 'Founders',
    eyebrow: 'FROM IDEA TO OWNED PRODUCT',
    title: 'Move the product forward while you run the company.',
    copy: 'Start fresh or bring an existing repository. Xroga turns the brief into implementation, checks, and release-ready work while consequential decisions stay with you.',
  },
  {
    label: 'Developers',
    eyebrow: 'MORE PROGRESS, LESS REPETITION',
    title: 'Stay close to the code. Hand off the repetitive work.',
    copy: 'Xroga can inspect the existing system, plan across files, implement changes, and show diffs and checks you can judge before anything ships.',
  },
  {
    label: 'Non-coders',
    eyebrow: 'PLAIN LANGUAGE TO WORKING SOFTWARE',
    title: 'Describe the outcome, without pretending software is simple.',
    copy: 'Xroga makes the technical work visible in one workspace, explains blockers plainly, and asks for permission when a connected account or release action matters.',
  },
  {
    label: 'Product teams',
    eyebrow: 'ONE SHARED BUILD STORY',
    title: 'Keep the brief, implementation, and proof together.',
    copy: 'Product intent, repository work, previews, checks, and handoff live in one traceable flow so the team can review what changed and why.',
  },
] as const;

const AUTO_ADVANCE_MS = 6_000;

export function HomepageAudienceSlider() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const item = AUDIENCES[active];

  useEffect(() => {
    if (paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setTimeout(() => setActive((index) => (index + 1) % AUDIENCES.length), AUTO_ADVANCE_MS);
    return () => window.clearTimeout(timer);
  }, [active, paused]);

  return (
    <section
      className="xv-audience"
      aria-labelledby="xv-audience-title"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
      }}
    >
      <div className="xv-audience__copy">
        <p>BUILT FOR THE PERSON DOING THE WORK</p>
        <h2 id="xv-audience-title">
          An AI build partner that works <span>while you work.</span>
        </h2>
        <div className="xv-audience__panel" role="tabpanel" id="audience-panel">
          <small>{item.eyebrow}</small>
          <h3>{item.title}</h3>
          <p>{item.copy}</p>
          <Link href="/features">See how Xroga works <ArrowRight aria-hidden="true" /></Link>
        </div>
      </div>

      <div className="xv-audience__tabs" role="tablist" aria-label="Who Xroga is built for">
        {AUDIENCES.map((audience, index) => (
          <button
            key={audience.label}
            type="button"
            role="tab"
            aria-selected={active === index}
            aria-controls="audience-panel"
            tabIndex={active === index ? 0 : -1}
            onClick={() => setActive(index)}
            onKeyDown={(event) => {
              const last = AUDIENCES.length - 1;
              const next = event.key === 'ArrowRight'
                ? (index + 1) % AUDIENCES.length
                : event.key === 'ArrowLeft'
                  ? (index - 1 + AUDIENCES.length) % AUDIENCES.length
                  : event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? last
                      : null;
              if (next === null) return;
              event.preventDefault();
              setActive(next);
              const tabs = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
              tabs?.[next]?.focus();
            }}
            className={active === index ? 'is-active' : undefined}
          >
            <span className={`xv-audience__avatar xv-audience__avatar--${index + 1}`} aria-hidden="true" />
            <span>{audience.label}</span>
            <ArrowRight aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}
