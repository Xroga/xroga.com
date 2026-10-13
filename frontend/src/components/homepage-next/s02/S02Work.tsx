'use client';

/**
 * S02: Xroga in action (V9). One compact section: an eyebrow, one headline, one line and the two-mode switch on
 * the heading row, then one physical computer. The computer's dock is the selector (four browser missions, or
 * the six AI Employees), so a choice and its result are always on screen together. A choice plays once and
 * settles on a result; nothing chains on its own, nothing scrolls the page, and the clock runs only while the
 * section is on screen (useDemoClock over script.ts).
 */
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { COPY, employeeOf, missionOf, modeOf, stepsOf, type Mode, type TrackId } from './script';
import { useDemoClock } from './useDemoClock';
import s from './S02.module.css';

const MODES: Mode[] = ['browser', 'employees'];

// The computer loads as its own chunk shortly before the section is reached, behind a computer-sized hold.
const Hold = () => <div className={s.hold} aria-hidden="true" />;
const Theater = dynamic(() => import('./Theater').then((m) => m.Theater), { ssr: false, loading: Hold });

export function S02Work({ loggedIn = false }: { loggedIn?: boolean }) {
  const root = useRef<HTMLElement>(null);
  const prefersReduced = useReducedMotion();
  const [reduced, setReduced] = useState(false);
  useEffect(() => setReduced(!!prefersReduced), [prefersReduced]);
  const { state, dispatch, running } = useDemoClock(root, reduced);
  const mode = modeOf(state.track);
  const steps = stepsOf(state.track);
  const last = state.step >= steps.length - 1;
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  // mount the computer once the section is within about a screen and a half
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = root.current;
    if (!el || near) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: '1200px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);

  // the one handoff: once the Research Analyst sends its brief, it is waiting on the Growth Strategist's board
  const [briefSent, setBriefSent] = useState(false);
  useEffect(() => {
    if (state.track === 'emp:research' && stepsOf(state.track)[state.step]?.id === 'handoff') setBriefSent(true);
  }, [state.track, state.step]);

  const onTabKey = (ev: React.KeyboardEvent, i: number) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(ev.key)) return;
    ev.preventDefault();
    const next = ev.key === 'Home' ? 0 : ev.key === 'End' ? MODES.length - 1 : (i + (ev.key === 'ArrowRight' ? 1 : -1) + MODES.length) % MODES.length;
    dispatch({ type: 'mode', mode: MODES[next] });
    tabs.current[next]?.focus({ preventScroll: true });
  };

  // one short line for screen readers when a scene settles (no live narration of every step)
  const mission = missionOf(state.track);
  const employee = employeeOf(state.track);
  const settledLine = mission
    ? `${mission.label}: ${mission.outcome.title}. ${mission.outcome.gate}.`
    : employee
      ? `${employee.name}: ${employee.outcome.title}. ${employee.outcome.gate}.`
      : '';

  return (
    <section
      ref={root}
      id="s02"
      className={s.section}
      aria-labelledby="s02-title"
      data-mode={mode}
      data-track={state.track}
      data-step={steps[Math.min(state.step, steps.length - 1)].id}
      data-settled={(last && (state.ended || reduced)) || undefined}
      data-running={running || undefined}
      data-reduced={reduced || undefined}
    >
      <div className={s.ambient} aria-hidden="true" />
      <div className={s.inner}>
        <header className={s.head}>
          <div className={s.copy}>
            <p className={s.eyebrow}>{COPY.eyebrow}</p>
            <h2 id="s02-title" className={s.title}>
              {COPY.title}
            </h2>
            <p className={s.lede}>{COPY.lede}</p>
          </div>
          <div className={s.switch} role="tablist" aria-label="Choose what to watch" data-mode={mode}>
            <span className={s.thumb} aria-hidden="true" />
            {MODES.map((m, i) => (
              <button
                key={m}
                ref={(el) => {
                  tabs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`s02-tab-${m}`}
                aria-selected={mode === m}
                aria-controls="s02-stage"
                tabIndex={mode === m ? 0 : -1}
                className={s.tab}
                onClick={() => dispatch({ type: 'mode', mode: m })}
                onKeyDown={(ev) => onTabKey(ev, i)}
              >
                <span className={s.tabIcon} data-k={m} aria-hidden="true" />
                {COPY.modes[m]}
              </button>
            ))}
          </div>
        </header>

        <div id="s02-stage" role="tabpanel" aria-labelledby={`s02-tab-${mode}`} className={s.stage}>
          {near ? (
            <Theater
              track={state.track}
              step={state.step}
              ended={state.ended}
              running={running}
              reduced={reduced}
              briefSent={briefSent}
              hold={state.stay}
              onPick={(t: TrackId) => dispatch({ type: 'select', track: t })}
              onReplay={() => dispatch({ type: 'replay' })}
            />
          ) : (
            <Hold />
          )}
          <p className={s.sr} aria-live="polite">
            {last ? settledLine : ''}
          </p>
        </div>

        <footer className={s.foot}>
          <span className={s.disclosure}>{COPY.disclosure}</span>
          <Link href={loggedIn ? '/workspace' : '/auth/signup'} className={s.cta}>
            {COPY.cta}
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" />
            </svg>
          </Link>
        </footer>
      </div>
    </section>
  );
}
