'use client';

/**
 * S02: Xroga in action (V10). One compact section with two different experiences behind one switch:
 *
 * Browser Automation: one mission executed inside an application (engine.ts + useDemoClock over script.ts).
 * AI Employees: an ongoing team with responsibilities, a night away and results on return (workforce.ts).
 *
 * The two keep separate state, so switching modes never resets the other side. Each clock runs only while the
 * section is on screen and the tab is visible; nothing scrolls the page and nothing reaches a server.
 */
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useReducer, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { AWAY_BEAT_MS, AWAY_BEATS, COPY, INTRO_MS, employeeOf, missionOf, stepsOf, type Mode, type TrackId } from './script';
import { browserPhase } from './engine';
import { useDemoClock } from './useDemoClock';
import { initialWorkforce, workforceReducer } from './workforce';
import s from './S02.module.css';

const MODES: Mode[] = ['browser', 'workforce'];

// The computer loads as its own chunk shortly before the section is reached, behind a computer-sized hold.
const Hold = () => <div className={s.hold} aria-hidden="true" />;
const Theater = dynamic(() => import('./Theater').then((m) => m.Theater), { ssr: false, loading: Hold });

export function S02Work({ loggedIn = false }: { loggedIn?: boolean }) {
  const root = useRef<HTMLElement>(null);
  const prefersReduced = useReducedMotion();
  const [reduced, setReduced] = useState(false);
  useEffect(() => setReduced(!!prefersReduced), [prefersReduced]);
  const [mode, setMode] = useState<Mode>('browser');
  const { state, dispatch, running, onScreen, hidden } = useDemoClock(root, reduced, mode === 'browser');
  const [wf, wfDispatch] = useReducer(workforceReducer, undefined, initialWorkforce);
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

  // workforce timing: the team entrance once, then the night away beat by beat (paused offscreen or hidden)
  const wfLive = mode === 'workforce' && onScreen && !hidden;
  useEffect(() => {
    if (mode !== 'workforce' || wf.intro === 'done') return;
    if (reduced) return wfDispatch({ type: 'intro-done' });
    if (!wfLive) return;
    const id = window.setTimeout(() => wfDispatch({ type: 'intro-done' }), INTRO_MS);
    return () => window.clearTimeout(id);
  }, [mode, wf.intro, wfLive, reduced]);
  useEffect(() => {
    if (wf.view === 'away' && reduced && wf.beat < AWAY_BEATS.length - 1) wfDispatch({ type: 'settle' });
  }, [wf.view, wf.beat, reduced]);
  useEffect(() => {
    if (wf.view !== 'away' || !wfLive || reduced) return;
    const gen = wf.gen;
    const last = wf.beat >= AWAY_BEATS.length - 1;
    const id = window.setTimeout(() => wfDispatch({ type: 'tick', gen }), last ? 1100 : AWAY_BEAT_MS);
    return () => window.clearTimeout(id);
  }, [wf.view, wf.beat, wf.gen, wfLive, reduced]);

  const pick = (m: Mode) => setMode(m);
  const onTabKey = (ev: React.KeyboardEvent, i: number) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(ev.key)) return;
    ev.preventDefault();
    const next = ev.key === 'Home' ? 0 : ev.key === 'End' ? MODES.length - 1 : (i + (ev.key === 'ArrowRight' ? 1 : -1) + MODES.length) % MODES.length;
    pick(MODES[next]);
    tabs.current[next]?.focus({ preventScroll: true });
  };

  const steps = stepsOf(state.track);
  const last = state.step >= steps.length - 1;
  const mission = missionOf(state.track)!;
  const phase = browserPhase(state, mission.outcome.state === 'approval');
  // one short line for screen readers when something settles (no live narration of every step)
  const live =
    mode === 'browser'
      ? last
        ? `${mission.label}: ${mission.outcome.title}. ${mission.outcome.gate}.`
        : ''
      : wf.view === 'workspace'
        ? `${employeeOf(wf.selected).name}: ${employeeOf(wf.selected).ret.changed.join('. ')}.`
        : wf.view === 'away' && wf.beat === AWAY_BEATS.length - 1
          ? 'Tuesday 18:00. Your team’s results are ready.'
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
      data-phase={phase}
      data-view={wf.view}
      data-beat={wf.view === 'away' ? wf.beat : undefined}
      data-employee={wf.selected}
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
            <p key={mode} className={s.lede}>
              {COPY.lede[mode]}
            </p>
          </div>
          <div className={s.switch} role="tablist" aria-label="Choose what to see" data-mode={mode}>
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
                onClick={() => pick(m)}
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
              mode={mode}
              track={state.track}
              step={state.step}
              ended={state.ended}
              running={running}
              reduced={reduced}
              wf={wf}
              wfDispatch={wfDispatch}
              onPick={(t: TrackId) => dispatch({ type: 'select', track: t })}
              onReplay={() => dispatch({ type: 'replay' })}
            />
          ) : (
            <Hold />
          )}
          <p className={s.sr} aria-live="polite">
            {live}
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
