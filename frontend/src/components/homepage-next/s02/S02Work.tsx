'use client';

/**
 * S02: Xroga in action (V12). One compact section, two different products behind one switch:
 *
 * Browser Automation: four bounded missions executed in a browser by Xroga's blue X cursor (engine.ts).
 * AI Employees: six specialists, each with its own conversation and computer, owning ongoing jobs (workforce.ts).
 *
 * The selector row sits ABOVE the computer: four missions, or six employees. Both modes keep their own state, so
 * switching never resets the other. Every clock pauses offscreen or in a hidden tab; nothing scrolls the page and
 * nothing leaves the page.
 */
import dynamic from 'next/dynamic';
import { useEffect, useReducer, useRef, useState, type CSSProperties } from 'react';
import { useReducedMotion } from 'motion/react';
import { COPY, MISSIONS, missionOf, stepsOf, type Mode, type TrackId } from './script';
import { EMPLOYEES, INTRO_MS, employeeOf } from './team';
import { stateLabel } from './labels';
import { browserPhase } from './engine';
import { useDemoClock } from './useDemoClock';
import { busy, delayOf, gateOf, initialWorkforce, workforceReducer } from './workforce';
import { Companion } from './Companion';
import { MissionGlyph } from './Glyphs';
import { useSeen } from '../ambient/useSeen';
import s from './S02.module.css';

const MODES: Mode[] = ['browser', 'workforce'];

// The computer loads as its own chunk shortly before the section is reached, behind a computer-sized hold.
const Hold = () => <div className={s.hold} aria-hidden="true" />;
const Theater = dynamic(() => import('./Theater').then((m) => m.Theater), { ssr: false, loading: Hold });


// the heading's emphasis: "AI Employee" carries the section's brushed-platinum treatment
const TITLE_EM = 'AI Employee';
const TITLE = COPY.title.split(TITLE_EM) as [string, string];

export function S02Work(_props: { loggedIn?: boolean }) {
  const root = useRef<HTMLElement>(null);
  const prefersReduced = useReducedMotion();
  const [reduced, setReduced] = useState(false);
  useEffect(() => setReduced(!!prefersReduced), [prefersReduced]);
  const [mode, setMode] = useState<Mode>('browser');
  const { state, dispatch, running, onScreen, hidden } = useDemoClock(root, reduced, mode === 'browser');
  const [wf, wfDispatch] = useReducer(workforceReducer, undefined, initialWorkforce);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleSeen = useSeen(titleRef);

  // mount the computer once the section is within about a screen and a half
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = root.current;
    if (!el || near) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: '1200px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);

  /* ---------------------------------------------------------------------------- AI Employees timing */
  const live = mode === 'workforce' && onScreen && !hidden;
  // the team entrance, once per visit
  useEffect(() => {
    if (mode !== 'workforce' || wf.view !== 'intro') return;
    if (reduced) return wfDispatch({ type: 'intro-done' });
    if (!live) return;
    const id = window.setTimeout(() => wfDispatch({ type: 'intro-done' }), INTRO_MS);
    return () => window.clearTimeout(id);
  }, [mode, wf.view, live, reduced]);
  // each conversation releases its queued beats one by one (an employee keeps working while another is open)
  useEffect(() => {
    if (!live || wf.view !== 'chat') return;
    const timers = EMPLOYEES.flatMap(({ id }) => {
      const t = wf.threads[id];
      if (!busy(t)) return [];
      const gen = t.gen;
      return [window.setTimeout(() => wfDispatch({ type: 'tick', id, gen }), reduced ? 60 : delayOf(t.queue[0]))];
    });
    return () => timers.forEach((x) => window.clearTimeout(x));
  }, [live, wf.view, wf.threads, reduced]);
  // until the visitor touches this mode, the first employee's assignment is typed and sent once, as an example
  useEffect(() => {
    if (!live || !wf.auto || wf.view !== 'chat' || reduced) return;
    const t = wf.threads[wf.selected];
    const gate = gateOf(wf.selected, t);
    if (!gate) return;
    const id = window.setTimeout(
      () => (t.draft === gate.text ? wfDispatch({ type: 'send', id: wf.selected }) : wfDispatch({ type: 'draft', id: wf.selected, text: gate.text })),
      t.draft === gate.text ? 1300 : 1500,
    );
    return () => window.clearTimeout(id);
  }, [live, wf.auto, wf.view, wf.selected, wf.threads, reduced]);

  /* -------------------------------------------------------------------------------------------- tabs */
  const onTabKey = (ev: React.KeyboardEvent, i: number) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(ev.key)) return;
    ev.preventDefault();
    const next = ev.key === 'Home' ? 0 : ev.key === 'End' ? MODES.length - 1 : (i + (ev.key === 'ArrowRight' ? 1 : -1) + MODES.length) % MODES.length;
    setMode(MODES[next]);
    tabs.current[next]?.focus({ preventScroll: true });
  };

  const steps = stepsOf(state.track);
  const last = state.step >= steps.length - 1;
  const mission = missionOf(state.track)!;
  const phase = browserPhase(state, mission.outcome.state === 'approval');
  const sel = employeeOf(wf.selected);
  const selThread = wf.threads[wf.selected];
  const live1 = mode === 'browser' ? (last ? `${mission.label}: ${mission.outcome.title}. ${mission.outcome.gate}.` : '') : '';

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
      data-employee={wf.selected}
      data-thread={selThread.state}
      data-settled={(last && (state.ended || reduced)) || undefined}
      data-running={running || undefined}
      data-reduced={reduced || undefined}
      data-title-seen={titleSeen || undefined}
    >
      <div className={s.inner}>
        <header className={s.head}>
          <div className={s.copy}>
            <p className={s.eyebrow}>{COPY.eyebrow}</p>
            <h2 ref={titleRef} id="s02-title" className={s.title}>
              {TITLE[0]}
              <span className={s.titleEm}>{TITLE_EM}</span>
              {TITLE[1]}
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
                onClick={() => setMode(m)}
                onKeyDown={(ev) => onTabKey(ev, i)}
              >
                {m === 'browser' ? (
                  <span className={s.tabIcon} data-k="browser" aria-hidden="true" />
                ) : (
                  <img className={s.tabMark} src="/homepage/orb/xroga-orb-icon.webp" alt="" width={18} height={18} />
                )}
                {COPY.modes[m]}
              </button>
            ))}
          </div>
        </header>

        <div id="s02-stage" role="tabpanel" aria-labelledby={`s02-tab-${mode}`} className={s.stage}>
          {/* the selector row sits above the computer: four missions, or six employees */}
          {mode === 'browser' ? (
            <div key="m" className={s.picker} role="group" aria-label="Choose a browser mission">
              {MISSIONS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={s.pick}
                  data-kind="mission"
                  data-id={m.id}
                  aria-pressed={state.track === `browser:${m.id}`}
                  onClick={() => dispatch({ type: 'select', track: `browser:${m.id}` as TrackId })}
                >
                  <span className={s.glyph} data-id={m.id} aria-hidden="true">
                    <MissionGlyph id={m.id} />
                  </span>
                  <span className={s.pickText}>
                    <b>{m.label}</b>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div key="e" className={s.picker} data-kind="team" role="group" aria-label="Choose an AI Employee">
              {EMPLOYEES.map((x) => {
                const t = wf.threads[x.id];
                const on = wf.view === 'chat' && wf.selected === x.id;
                return (
                  <button
                    key={x.id}
                    type="button"
                    className={s.pick}
                    data-kind="employee"
                    data-state={t.state}
                    aria-pressed={on}
                    onClick={() => wfDispatch({ type: 'select', id: x.id })}
                    style={{ '--accent': x.accent } as CSSProperties}
                  >
                    <span className={s.mate} aria-hidden="true">
                      <Companion e={x} size={40} state={on ? 'active' : busy(t) ? 'working' : 'idle'} />
                    </span>
                    <span className={s.pickText}>
                      <b>{x.short}</b>
                      <small data-state={t.state}>{stateLabel(x.id, t)}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {near ? <Theater mode={mode} track={state.track} step={state.step} running={running} reduced={reduced} wf={wf} wfDispatch={wfDispatch} /> : <Hold />}
          <p className={s.sr} aria-live="polite">
            {mode === 'browser' ? live1 : wf.view === 'chat' ? `${sel.role}: ${stateLabel(sel.id, selThread)}.` : ''}
          </p>
        </div>
      </div>
    </section>
  );
}
