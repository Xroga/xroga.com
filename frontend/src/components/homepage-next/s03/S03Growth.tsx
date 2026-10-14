'use client';

/**
 * S03 — Search & Growth. One section, two modes on one shared stage: Search & Visibility (website, search, AI answers,
 * authority, local) and Launch & Marketing (launch, search ads, social ads, conversions). When the stage is first seen,
 * a short guided demonstration drives the real components so a first-time visitor sees Xroga do the work; any input
 * hands control over at once. Everything is a local, interactive preview: no account is linked and nothing is published or spent.
 */
import Link from 'next/link';
import { useReducedMotion } from 'motion/react';
import { useEffect, useReducer, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { COPY } from './data';
import { GrowthStudio } from './GrowthStudio';
import { SearchStudio } from './SearchStudio';
import { initialState, isDefault, reducer, type Chapter } from './state';
import { TourBar, useTour } from './Tour';
import s from './S03.module.css';

const MODES: Chapter[] = ['search', 'growth'];

export function S03Growth({ loggedIn = false }: { loggedIn?: boolean }) {
  const root = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [st, dispatch] = useReducer(reducer, undefined, initialState);
  const reduced = !!useReducedMotion();
  const [under, setUnder] = useState(false);
  // phones and reduced motion never autoplay; the tour is one tap away
  const [wide, setWide] = useState(false);
  useEffect(() => setWide(window.matchMedia('(min-width: 701px)').matches), []);
  const tour = useTour(root, stage, dispatch, wide && !reduced);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setUnder(e.isIntersecting && e.boundingClientRect.top < 0), { rootMargin: '0px 0px -100% 0px', threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && el.contains(document.activeElement)) dispatch({ type: 'escape' });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // a phone sheet locks the page behind it while open
  useEffect(() => {
    if (!st.sheet) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [st.sheet]);

  const onModeKey = (ev: ReactKeyboardEvent, i: number) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(ev.key)) return;
    ev.preventDefault();
    const n = ev.key === 'Home' ? 0 : ev.key === 'End' ? 1 : (i + 1) % 2;
    dispatch({ type: 'view', view: MODES[n] });
    root.current?.querySelector<HTMLElement>(`#s03-mode-${MODES[n]}`)?.focus({ preventScroll: true });
  };

  return (
    <section
      ref={root}
      id="s03"
      className={s.section}
      aria-labelledby="s03-title"
      data-view={st.view}
      data-reduced={reduced || undefined}
      data-modal={st.sheet ? '' : undefined}
      data-under={under || undefined}
      data-tour={tour.status}
    >
      <div className={s.shield} aria-hidden="true" />
      <div className={s.inner}>
        <header className={s.head}>
          <p className={s.eyebrow}>{COPY.eyebrow}</p>
          <h2 id="s03-title" className={s.title}>
            {COPY.title}
          </h2>
          <p className={s.lede}>{COPY.lede}</p>
        </header>

        <div className={s.modes} role="tablist" aria-label="What Xroga works on">
          {MODES.map((m, i) => (
            <button
              key={m}
              type="button"
              role="tab"
              id={`s03-mode-${m}`}
              aria-selected={st.view === m}
              aria-controls="s03-stage"
              tabIndex={st.view === m ? 0 : -1}
              className={s.mode}
              data-mode={m}
              onClick={() => dispatch({ type: 'view', view: m })}
              onKeyDown={(ev) => onModeKey(ev, i)}
            >
              {m === 'search' ? <ModeSearch /> : <ModeGrowth />}
              <span className={s.modeText}>
                <b>{COPY[m].label}</b>
                <small>{COPY[m].line}</small>
              </span>
              <i className={s.modeCheck} aria-hidden="true" />
            </button>
          ))}
        </div>

        <TourBar tour={tour} view={st.view} />

        <div ref={stage} id="s03-stage" role="tabpanel" aria-labelledby={`s03-mode-${st.view}`} className={s.shared} data-view={st.view}>
          <div className={s.scenario}>
            <span>{COPY[st.view].scenario}</span>
            {!isDefault(st, st.view) && tour.status !== 'playing' && (
              <button type="button" className={s.linkBtn} data-quiet="" onClick={() => dispatch({ type: 'reset', chapter: st.view })}>
                Start over
              </button>
            )}
          </div>
          <div key={st.view} className={s.modePanel}>
            {st.view === 'search' ? <SearchStudio st={st} dispatch={dispatch} /> : <GrowthStudio st={st} dispatch={dispatch} />}
          </div>
        </div>

        <div className={s.foot}>
          <Link href={loggedIn ? '/workspace' : '/auth/signup'} className={s.cta}>
            Open the Xroga workspace
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" />
            </svg>
          </Link>
          <button
            type="button"
            className={s.preview}
            aria-expanded={st.about}
            aria-controls="s03-about"
            onClick={() => dispatch({ type: 'set', patch: { about: !st.about } })}
          >
            <i aria-hidden="true" />
            {COPY.disclosure}
          </button>
          {st.about && (
            <p id="s03-about" className={s.aboutNote} role="note">
              {COPY.about}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/** Mode art: a site with one verified link, one competitor-only link and one AI citation. */
function ModeSearch() {
  return (
    <svg className={s.modeArt} viewBox="0 0 220 120" aria-hidden="true">
      <path className={s.dLink} data-k="verified" d="M150 26 C120 26 110 60 70 60" />
      <path className={s.dLink} data-k="rival" d="M160 98 C130 98 120 104 96 104" />
      <path className={s.dLink} data-k="ai" d="M176 62 C140 62 120 62 74 64" />
      <g className={s.dSite}>
        <rect x="26" y="40" width="48" height="40" rx="5" />
        <rect x="32" y="34" width="48" height="40" rx="5" />
        <path d="M38 46h26M38 52h18" />
      </g>
      <circle className={s.dNode} data-k="verified" cx="156" cy="26" r="7" />
      <rect className={s.dNode} data-k="ai" x="174" y="55" width="14" height="14" rx="3" />
      <path className={s.dNode} data-k="rival" d="M166 90 l8 8 -8 8 -8 -8z" />
      <rect className={s.dRival} x="70" y="96" width="26" height="16" rx="3" />
    </svg>
  );
}

/** Mode art: one product becoming a search ad and a social post, ending in a customer. */
function ModeGrowth() {
  return (
    <svg className={s.modeArt} viewBox="0 0 220 120" aria-hidden="true">
      <path className={s.gFlow} d="M60 64 C90 64 96 30 120 30" />
      <path className={s.gFlow} d="M60 64 C90 64 96 92 120 92" />
      <path className={s.gFlow} d="M160 30 C180 30 182 62 196 62 M160 92 C180 92 182 62 196 62" />
      <path className={s.gBag} d="M34 40 h28 l2 46 h-32z" />
      <rect className={s.gLabel} x="38" y="56" width="20" height="16" rx="2" />
      <rect className={s.gAd} x="120" y="20" width="44" height="22" rx="4" />
      <path className={s.gAdLine} d="M126 28h28M126 34h20" />
      <rect className={s.gPost} x="122" y="74" width="34" height="38" rx="4" />
      <circle className={s.gPerson} cx="200" cy="62" r="8" />
    </svg>
  );
}
