'use client';

/**
 * S03 — Xroga Growth Studio. One sample shop (Morrow Supply) seen through three worlds that share one landscape:
 * Search demand (where customers are already looking), Campaigns (what they will see) and Outcomes (which sources
 * bring buyers), plus the growth stack. Visual first; detail opens on request. Everything is driven by the visitor:
 * one short entrance plays once when the section is first reached, never under reduced motion, and nothing autoplays.
 */
import Link from 'next/link';
import { useReducedMotion } from 'motion/react';
import { useEffect, useReducer, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Campaigns } from './Campaigns';
import { BRAND, COPY, type World } from './data';
import { Discover } from './Discover';
import { Outcomes } from './Outcomes';
import { Stack } from './Stack';
import { initialState, isDefault, reducer, type Action } from './state';
import { Terrain } from './Terrain';
import { Trace } from './Trace';
import s from './S03.module.css';

const WORLDS: World[] = ['discover', 'campaigns', 'outcomes'];
/** The site header is fixed over the page; S03 keeps its working area clear of it. */
const HEADER_CLEARANCE = 84;

export function S03Growth({ loggedIn = false }: { loggedIn?: boolean }) {
  const root = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [st, dispatch] = useReducer(reducer, undefined, initialState);
  const reduced = !!useReducedMotion();
  // the entrance is armed only when the section starts below the fold, and plays once when reached
  const [entry, setEntry] = useState<'none' | 'armed' | 'played'>('none');

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
    // plays when the section's top crosses 75% of the viewport, whatever the section's height
    const io = new IntersectionObserver(([e]) => e.isIntersecting && play(), { rootMargin: '0px 0px -25% 0px', threshold: 0 });
    io.observe(el);
    // never leave content hidden from someone already using it
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
      if (ev.key !== 'Escape' || !el.contains(document.activeElement)) return;
      // close whatever the visitor is in: the tool detail when focus is in the stack, otherwise the innermost layer
      if (document.activeElement?.closest('[data-stack]')) dispatch({ type: 'tool', id: null });
      else dispatch({ type: 'escape' });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  /** After a visitor's own action changes the stage, make sure its top is not hidden under the fixed site header. */
  const reveal = () =>
    requestAnimationFrame(() => {
      const top = stage.current?.getBoundingClientRect().top;
      if (top === undefined || (top >= HEADER_CLEARANCE && top < window.innerHeight * 0.5)) return;
      if (top < HEADER_CLEARANCE) window.scrollBy({ top: top - HEADER_CLEARANCE, behavior: reduced ? 'auto' : 'smooth' });
    });

  const act = (a: Action) => {
    dispatch(a);
    if (a.type === 'world' || a.type === 'next-query') reveal();
  };

  const onWorldKey = (ev: ReactKeyboardEvent, i: number) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(ev.key)) return;
    ev.preventDefault();
    const n = ev.key === 'Home' ? 0 : ev.key === 'End' ? WORLDS.length - 1 : (i + (ev.key === 'ArrowRight' ? 1 : -1) + WORLDS.length) % WORLDS.length;
    act({ type: 'world', world: WORLDS[n] });
    requestAnimationFrame(() => root.current?.querySelector<HTMLElement>(`#s03-tab-${WORLDS[n]}`)?.focus({ preventScroll: true }));
  };

  const explore = () => {
    act({ type: 'next-query' });
    requestAnimationFrame(() => stage.current?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus({ preventScroll: true }));
  };

  return (
    <section
      ref={root}
      id="s03"
      className={s.section}
      aria-labelledby="s03-title"
      data-world={st.world}
      data-entry={entry}
      data-reduced={reduced || undefined}
      data-modal={st.tool || st.layer === 'preview' ? '' : undefined}
    >
      <div className={s.atmos} aria-hidden="true" />
      <div className={s.inner}>
        <header className={s.head}>
          <div className={s.lead}>
            <p className={s.eyebrow}>{COPY.eyebrow}</p>
            <h2 id="s03-title" className={s.title}>
              {COPY.title}
            </h2>
          </div>
          <div className={s.side}>
            <p className={s.lede}>{COPY.lede}</p>
            <div className={s.ctas}>
              <Link href={loggedIn ? '/workspace' : '/auth/signup'} className={s.cta}>
                {COPY.cta}
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" />
                </svg>
              </Link>
              <button type="button" className={s.ctaGhost} onClick={explore}>
                {COPY.explore}
              </button>
            </div>
          </div>
        </header>

        <div ref={stage} className={s.stage} data-world={st.world}>
          <Terrain world={st.world} query={st.query} audience={st.audience} onSelect={(id) => act({ type: 'query', id })} />

          <div className={s.bar}>
            <span className={s.shop}>
              <i aria-hidden="true" />
              <span>
                <b>{BRAND.name}</b>
                <small>Sample shop · {BRAND.sells}</small>
              </span>
            </span>
            <div className={s.worlds} role="tablist" aria-label="Growth Studio">
              {WORLDS.map((w, i) => (
                <button
                  key={w}
                  type="button"
                  role="tab"
                  id={`s03-tab-${w}`}
                  aria-selected={st.world === w}
                  aria-controls="s03-panel"
                  tabIndex={st.world === w ? 0 : -1}
                  className={s.worldTab}
                  data-w={w}
                  onClick={() => act({ type: 'world', world: w })}
                  onKeyDown={(ev) => onWorldKey(ev, i)}
                >
                  <i aria-hidden="true" />
                  {COPY.worlds[w]}
                </button>
              ))}
            </div>
            {!isDefault(st) ? (
              <button
                type="button"
                className={s.reset}
                onClick={() => {
                  dispatch({ type: 'reset' });
                  // the button leaves with the state it undoes; keep focus in the section
                  requestAnimationFrame(() => root.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus({ preventScroll: true }));
                }}
              >
                Start over
              </button>
            ) : (
              <span className={s.sample}>{COPY.disclosure}</span>
            )}
          </div>

          <div id="s03-panel" role="tabpanel" aria-labelledby={`s03-tab-${st.world}`} className={s.panel}>
            <div key={st.world} className={s.world} data-world={st.world}>
              {st.world === 'discover' && <Discover st={st} dispatch={act} />}
              {st.world === 'campaigns' && <Campaigns st={st} dispatch={act} />}
              {st.world === 'outcomes' && <Outcomes st={st} dispatch={act} />}
            </div>
          </div>

          {st.world === 'discover' && <Trace stage={stage} trace={`${st.query}:${st.lens}:${st.layer}`} />}
        </div>

        <Stack st={st} dispatch={act} />
        <p className={s.disclosure}>{COPY.disclosure}</p>
      </div>
    </section>
  );
}
