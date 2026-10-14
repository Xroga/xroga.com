'use client';

/**
 * S03 — Search & Growth. Two chapters inside one section, each understandable on its own: A, the Search & Authority
 * Studio (site health, content, AI answers, links, local presence) and B, the Launch, Campaigns & Growth Studio (launch,
 * search ads, social ads, conversions). Two entrances at the top show what each chapter does and take the visitor
 * straight to it. Everything is a local, interactive example: one short entrance plays when the section is reached,
 * nothing autoplays, and nothing leaves the page.
 */
import Link from 'next/link';
import { useReducedMotion } from 'motion/react';
import { useEffect, useReducer, useRef, useState } from 'react';
import { COPY } from './data';
import { GrowthStudio } from './GrowthStudio';
import { SearchStudio } from './SearchStudio';
import { initialState, reducer, type Chapter } from './state';
import s from './S03.module.css';

/** The site header is fixed over the page; chapter jumps land below it. */
const HEADER_CLEARANCE = 88;

export function S03Growth({ loggedIn = false }: { loggedIn?: boolean }) {
  const root = useRef<HTMLElement>(null);
  const [st, dispatch] = useReducer(reducer, undefined, initialState);
  const reduced = !!useReducedMotion();
  const [entry, setEntry] = useState<'none' | 'armed' | 'played'>('none');
  const [under, setUnder] = useState(false);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setUnder(e.isIntersecting && e.boundingClientRect.top < 0), { rootMargin: '0px 0px -100% 0px', threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // the entrance is armed only when the section starts below the fold, and plays once when reached
  useEffect(() => {
    const el = root.current;
    if (!el || reduced) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.75) return;
    setEntry('armed');
    const play = () => {
      setEntry('played');
      io.disconnect();
      el.removeEventListener('focusin', play);
      el.removeEventListener('pointerdown', play);
    };
    const io = new IntersectionObserver(([e]) => e.isIntersecting && play(), { rootMargin: '0px 0px -25% 0px', threshold: 0 });
    io.observe(el);
    el.addEventListener('focusin', play);
    el.addEventListener('pointerdown', play);
    return () => {
      io.disconnect();
      el.removeEventListener('focusin', play);
      el.removeEventListener('pointerdown', play);
    };
  }, [reduced]);

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

  /** Jump to a chapter: below the fixed header, focus on its heading, no scroll hijacking. */
  const go = (c: Chapter) => {
    const target = root.current?.querySelector<HTMLElement>(`#s03-${c}`);
    if (!target) return;
    window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - HEADER_CLEARANCE, behavior: reduced ? 'auto' : 'smooth' });
    target.querySelector<HTMLElement>('h3')?.focus({ preventScroll: true });
  };

  return (
    <section
      ref={root}
      id="s03"
      className={s.section}
      aria-labelledby="s03-title"
      data-entry={entry}
      data-reduced={reduced || undefined}
      data-modal={st.sheet ? '' : undefined}
      data-under={under || undefined}
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

        <div className={s.doors}>
          <a
            href="#s03-search"
            className={s.door}
            data-door="search"
            onClick={(e) => {
              e.preventDefault();
              go('search');
            }}
          >
            <DoorSearch />
            <span className={s.doorText}>
              <small>{COPY.search.kicker}</small>
              <b>{COPY.search.title}</b>
              <em>
                {COPY.search.enter}
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M8 3v9M4.5 8.5 8 12l3.5-3.5" />
                </svg>
              </em>
            </span>
          </a>
          <a
            href="#s03-growth"
            className={s.door}
            data-door="growth"
            onClick={(e) => {
              e.preventDefault();
              go('growth');
            }}
          >
            <DoorGrowth />
            <span className={s.doorText}>
              <small>{COPY.growth.kicker}</small>
              <b>{COPY.growth.title}</b>
              <em>
                {COPY.growth.enter}
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M8 3v9M4.5 8.5 8 12l3.5-3.5" />
                </svg>
              </em>
            </span>
          </a>
        </div>

        <SearchStudio st={st} dispatch={dispatch} />
        <GrowthStudio st={st} dispatch={dispatch} />

        <p className={s.foot}>
          <Link href={loggedIn ? '/workspace' : '/auth/signup'} className={s.cta}>
            Open the Xroga workspace
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" />
            </svg>
          </Link>
          <button
            type="button"
            className={s.linkBtn}
            data-quiet=""
            aria-expanded={st.about}
            aria-controls="s03-about"
            onClick={() => dispatch({ type: 'set', patch: { about: !st.about } })}
          >
            About these examples
          </button>
          {st.about && (
            <span id="s03-about" role="note">
              {COPY.about}
            </span>
          )}
        </p>
      </div>
    </section>
  );
}

/** Door art: a site with one verified link, one competitor-only link and one AI citation. */
function DoorSearch() {
  return (
    <svg className={s.doorArt} viewBox="0 0 220 120" aria-hidden="true">
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

/** Door art: one product becoming a search ad and a social post, ending in a customer. */
function DoorGrowth() {
  return (
    <svg className={s.doorArt} viewBox="0 0 220 120" aria-hidden="true">
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
