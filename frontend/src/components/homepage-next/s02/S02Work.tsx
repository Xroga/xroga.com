'use client';

/**
 * S02: Xroga in action (V7). One compact section: a short heading, one mode switch with its selector (four browser
 * missions, or the six AI Employees), and one large work theater. A choice plays once and settles on a result the
 * visitor can inspect; nothing chains, nothing scrolls the page, and the clock runs only while the section is on
 * screen (useDemoClock over script.ts).
 */
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { COPY, MISSIONS, employeeOf, modeOf, stepsOf, type EmployeeId, type Mode, type TrackId } from './script';
import { useDemoClock } from './useDemoClock';
import { Lineup } from './Team';
import s from './S02.module.css';

const MODES: Mode[] = ['browser', 'employees'];

// The stage content loads as its own chunk shortly before the section is reached, behind a stage-sized hold.
const Hold = () => <div className={s.hold} aria-hidden="true" />;
const Theater = dynamic(() => import('./Theater').then((m) => m.Theater), { ssr: false, loading: Hold });
const TeamIntro = dynamic(() => import('./Team').then((m) => m.TeamIntro), { ssr: false, loading: Hold });

export function S02Work({ loggedIn = false }: { loggedIn?: boolean }) {
  const root = useRef<HTMLElement>(null);
  const prefersReduced = useReducedMotion();
  const [reduced, setReduced] = useState(false);
  useEffect(() => setReduced(!!prefersReduced), [prefersReduced]);
  const { state, dispatch, running } = useDemoClock(root, reduced);
  const mode = modeOf(state.track);
  const steps = stepsOf(state.track);
  const cur = steps[Math.min(state.step, steps.length - 1)];
  const employee = employeeOf(state.track) ?? null;
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  // mount the stage content once the section is within about a screen and a half
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = root.current;
    if (!el || near) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: '1200px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);

  // the one handoff: once the Research Analyst delivers, the brief waits on Client Acquisition
  const [briefReady, setBriefReady] = useState(false);
  useEffect(() => {
    if (state.track === 'emp:research' && state.step === steps.length - 1) setBriefReady(true);
  }, [state.track, state.step, steps.length]);

  const pick = (track: TrackId) => dispatch({ type: 'select', track });
  const onTabKey = (ev: React.KeyboardEvent, i: number) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(ev.key)) return;
    ev.preventDefault();
    const next = ev.key === 'Home' ? 0 : ev.key === 'End' ? MODES.length - 1 : (i + (ev.key === 'ArrowRight' ? 1 : -1) + MODES.length) % MODES.length;
    dispatch({ type: 'mode', mode: MODES[next] });
    tabs.current[next]?.focus({ preventScroll: true });
  };
  const last = state.step >= steps.length - 1;
  const caption = state.track === 'emp:team' ? 'Six AI Employees. Choose one to open their workspace.' : `${employee ? employee.name : MISSIONS.find((x) => `browser:${x.id}` === state.track)!.label}: ${cur.label}.`;

  return (
    <section
      ref={root}
      className={s.section}
      aria-labelledby="s02-title"
      data-mode={mode}
      data-track={state.track}
      data-step={cur.stepId}
      data-settled={(last && (state.ended || reduced)) || undefined}
      data-running={running || undefined}
      data-reduced={reduced || undefined}
    >
      <div className={s.inner}>
        <header className={s.head}>
          <p className={s.eyebrow}>{COPY.eyebrow}</p>
          <h2 id="s02-title" className={s.title}>{COPY.title}</h2>
          <p className={s.support}>{COPY.support}</p>
        </header>

        <div className={s.controls}>
          <div className={s.switch} role="tablist" aria-label="Choose what to watch">
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
                <span className={s.tabIcon} data-k={m} aria-hidden="true"><i /></span>
                {COPY.modes[m]}
              </button>
            ))}
            <span className={s.thumb} aria-hidden="true" />
          </div>
          <div className={s.selector}>
            {mode === 'browser' ? (
              <div className={s.picks} role="group" aria-label="Choose a browser mission">
                {MISSIONS.map((x, i) => (
                  <button key={x.id} type="button" className={s.pick} data-id={x.id} aria-pressed={state.track === `browser:${x.id}`} onClick={() => pick(`browser:${x.id}`)}>
                    <span className={s.pickNum}>0{i + 1}</span>
                    {x.label}
                  </button>
                ))}
              </div>
            ) : (
              <Lineup active={employee?.id ?? null} briefReady={briefReady} onPick={(id: EmployeeId) => pick(`emp:${id}`)} onTeam={() => pick('emp:team')} />
            )}
          </div>
        </div>

        <div id="s02-stage" role="tabpanel" aria-labelledby={`s02-tab-${mode}`} className={s.stage} data-mode={mode}>
          <div className={s.env} aria-hidden="true">
            <span className={s.key} />
            <span className={s.rim} />
            <span className={s.floor} />
          </div>
          <div key={mode} className={s.layer}>
            {!near ? (
              <Hold />
            ) : state.track === 'emp:team' ? (
              <TeamIntro reduced={reduced} onPick={(id: EmployeeId) => pick(`emp:${id}`)} />
            ) : (
              <Theater track={state.track} step={state.step} running={running} reduced={reduced} onReplay={() => dispatch({ type: 'replay' })} />
            )}
          </div>
          <span className={s.illus}>{COPY.illustrative}</span>
          <p className={s.sr} aria-live="polite">{reduced || last ? caption : ''}</p>
        </div>

        <footer className={s.foot}>
          <Link href={loggedIn ? '/workspace' : '/auth/signup'} className={s.cta}>
            {COPY.cta}
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" /></svg>
          </Link>
          <p className={s.note}>{COPY.availability}</p>
        </footer>
      </div>
    </section>
  );
}
