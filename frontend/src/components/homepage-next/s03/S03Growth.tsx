'use client';

/**
 * S03 — Launch & Growth. One fictional product, Aurel, carried through a four-step journey on one stage: Launch,
 * Discovery, Campaigns, Results. The product's launch plane is a single persistent object that moves to a new place
 * and depth at every step, so the steps read as one product entering the market rather than four slides. Everything is
 * driven by the visitor: one short entrance plays once when the section is reached (never under reduced motion), and
 * nothing autoplays.
 */
import Link from 'next/link';
import { useReducedMotion } from 'motion/react';
import { useEffect, useReducer, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Artifact } from './Artifact';
import { Campaigns } from './Campaigns';
import { COPY, PERSPECTIVES, toolOf, type Perspective } from './data';
import { Discovery } from './Discovery';
import { Launch } from './Launch';
import { Results } from './Results';
import { Stack } from './Stack';
import { initialState, isDefault, reducer, type Action } from './state';
import s from './S03.module.css';

const ORDER: Perspective[] = PERSPECTIVES.map((p) => p.id);
/** The site header is fixed over the page; S03 keeps its working area clear of it. */
const HEADER_CLEARANCE = 88;
/** Each step hands on to the next with an action that names what happens there. */
const NEXT: Record<Perspective, { to: Perspective; label: string }> = {
  launch: { to: 'discovery', label: 'Take it to market' },
  discovery: { to: 'campaigns', label: 'Shape the campaign' },
  campaigns: { to: 'results', label: 'Follow the customer path' },
  results: { to: 'launch', label: 'Back to the launch' },
};

export function S03Growth({ loggedIn = false }: { loggedIn?: boolean }) {
  const root = useRef<HTMLElement>(null);
  const studio = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const [st, dispatch] = useReducer(reducer, undefined, initialState);
  const reduced = !!useReducedMotion();
  // the entrance is armed only when the section starts below the fold, and plays once when reached
  const [entry, setEntry] = useState<'none' | 'armed' | 'played'>('none');
  // the header shield is on only while S03 runs under the top of the viewport (never over S03's own heading)
  const [under, setUnder] = useState(false);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setUnder(e.isIntersecting && e.boundingClientRect.top < 0), { rootMargin: '0px 0px -100% 0px', threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

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
      // close whatever the visitor is in: the service detail when focus is in the stack, otherwise the open detail
      if (document.activeElement?.closest('[data-stack]')) dispatch({ type: 'tool', id: null });
      else dispatch({ type: 'escape' });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  /** A faint depth response to the pointer: layers shift by their depth. Fine pointers only, never under reduced motion. */
  const onPointerMove = (ev: ReactPointerEvent<HTMLDivElement>) => {
    if (reduced || ev.pointerType !== 'mouse') return;
    const el = stage.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    const y = ((ev.clientY - r.top) / r.height) * 2 - 1;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      el.style.setProperty('--px', x.toFixed(3));
      el.style.setProperty('--py', y.toFixed(3));
    });
  };
  const onPointerLeave = () => {
    cancelAnimationFrame(frame.current);
    stage.current?.style.setProperty('--px', '0');
    stage.current?.style.setProperty('--py', '0');
  };

  /** After a step switch, keep the journey navigator clear of the fixed site header (only if it is under it). */
  const reveal = () =>
    requestAnimationFrame(() => {
      const top = studio.current?.getBoundingClientRect().top;
      if (top !== undefined && top < HEADER_CLEARANCE) window.scrollBy({ top: top - HEADER_CLEARANCE, behavior: reduced ? 'auto' : 'smooth' });
    });

  const act = (a: Action) => {
    dispatch(a);
    if (a.type === 'p') reveal();
  };

  const onTabKey = (ev: ReactKeyboardEvent, i: number) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(ev.key)) return;
    ev.preventDefault();
    const n = ev.key === 'Home' ? 0 : ev.key === 'End' ? ORDER.length - 1 : (i + (ev.key === 'ArrowRight' ? 1 : -1) + ORDER.length) % ORDER.length;
    act({ type: 'p', p: ORDER[n] });
    requestAnimationFrame(() => root.current?.querySelector<HTMLElement>(`#s03-tab-${ORDER[n]}`)?.focus({ preventScroll: true }));
  };

  const at = ORDER.indexOf(st.p);
  const cur = PERSPECTIVES[at];
  const next = NEXT[st.p];
  const hint = st.tool ? toolOf(st.tool).step : null;

  return (
    <section
      ref={root}
      id="s03"
      className={s.section}
      aria-labelledby="s03-title"
      data-p={st.p}
      data-entry={entry}
      data-reduced={reduced || undefined}
      data-modal={st.tool ? '' : undefined}
      data-under={under || undefined}
    >
      {/* content fades out under the fixed site header instead of peeking around it */}
      <div className={s.shield} aria-hidden="true" />
      <div className={s.inner}>
        <header className={s.head}>
          <p className={s.eyebrow}>{COPY.eyebrow}</p>
          <h2 id="s03-title" className={s.title}>
            {COPY.title}
          </h2>
          <div className={s.side}>
            <p className={s.lede}>{COPY.lede}</p>
            <Link href={loggedIn ? '/workspace' : '/auth/signup'} className={s.cta}>
              {COPY.cta}
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" />
              </svg>
            </Link>
          </div>
        </header>

        <div ref={studio} className={s.studio}>
          <div className={s.journey} role="tablist" aria-label="Launch to growth journey" style={{ ['--at' as string]: at }}>
            <span className={s.track} aria-hidden="true">
              <span className={s.trackFill} />
            </span>
            {PERSPECTIVES.map((x, i) => (
              <button
                key={x.id}
                type="button"
                role="tab"
                id={`s03-tab-${x.id}`}
                aria-selected={st.p === x.id}
                aria-controls="s03-panel"
                tabIndex={st.p === x.id ? 0 : -1}
                className={s.step}
                data-p={x.id}
                data-past={i < at || undefined}
                data-hint={hint === x.id || undefined}
                onClick={() => act({ type: 'p', p: x.id })}
                onKeyDown={(ev) => onTabKey(ev, i)}
              >
                <span className={s.stepNode} aria-hidden="true" />
                <span className={s.stepLabel}>{x.label}</span>
              </button>
            ))}
          </div>

          <div ref={stage} className={s.stage} data-p={st.p} data-asset={st.asset} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
            <div className={s.env} aria-hidden="true">
              <span className={s.planes} />
              <span className={s.bloom} />
              <span className={s.floor} />
            </div>

            <Artifact />

            <div className={s.stageTop}>
              <div key={st.p} className={s.stageTitle}>
                <h3>{cur.title}</h3>
                <p>{cur.line}</p>
              </div>
              <div className={s.stageMeta}>
                {!isDefault(st) && (
                  <button
                    type="button"
                    className={s.linkBtn}
                    data-quiet=""
                    onClick={() => {
                      dispatch({ type: 'reset' });
                      requestAnimationFrame(() =>
                        root.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus({ preventScroll: true }),
                      );
                    }}
                  >
                    Start over
                  </button>
                )}
                <button
                  type="button"
                  className={s.previewTag}
                  aria-expanded={st.detail === 'about'}
                  aria-controls="s03-about"
                  onClick={() => dispatch({ type: 'detail', detail: st.detail === 'about' ? null : 'about' })}
                >
                  <i aria-hidden="true" />
                  {COPY.preview}
                </button>
              </div>
              {st.detail === 'about' && (
                <p id="s03-about" className={s.about} role="note">
                  {COPY.about}
                </p>
              )}
            </div>

            <div id="s03-panel" role="tabpanel" aria-labelledby={`s03-tab-${st.p}`} className={s.panel}>
              <div key={st.p} className={s.scene}>
                {st.p === 'launch' && <Launch st={st} dispatch={act} />}
                {st.p === 'discovery' && <Discovery st={st} dispatch={act} />}
                {st.p === 'campaigns' && <Campaigns st={st} dispatch={act} />}
                {st.p === 'results' && <Results st={st} dispatch={act} />}
              </div>
              <button type="button" className={s.nextBtn} data-to={next.to} onClick={() => act({ type: 'p', p: next.to })}>
                {next.label}
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <Stack st={st} dispatch={act} />
      </div>
    </section>
  );
}
