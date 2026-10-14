'use client';

/**
 * The S02 computer: one machined titanium display on a graphite stand, with two different interiors.
 *
 * Browser Automation: an Xroga desktop with one browser window. Xroga's blue X cursor works across its tabs, findings
 * are pinned where they happen, and a result card waits for approval and lets the visitor inspect every step.
 *
 * AI Employees: the selected employee's conversation beside that employee's own computer (Workforce.tsx). No
 * cursor drives the employees: they are a different product, owning ongoing jobs and reporting back in chat.
 *
 * The selectors (four missions, or six employees) live ABOVE the computer, in S02Work.
 */
import { useRef, useState } from 'react';
import { makeCtx, type Ctx } from './ctx';
import { Pins, Pointer, usePush } from './motion';
import { MISSION_APPS } from './Missions';
import { Workforce, WorkforceMenu } from './WorkforceSurface';
import { COPY, missionOf, stepsOf, type Mission, type Mode, type Step, type TrackId } from './script';
import type { WfAction, WfState } from './workforce';
import { inertIf } from './inert';
import t from './Theater.module.css';

const XBLUE = '#4589ff';

export function Theater({
  mode,
  track,
  step,
  running,
  reduced,
  wf,
  wfDispatch,
}: {
  mode: Mode;
  track: TrackId;
  step: number;
  running: boolean;
  reduced: boolean;
  wf: WfState;
  wfDispatch: (a: WfAction) => void;
}) {
  const mission = missionOf(track)!;
  const steps = stepsOf(track);
  const ctx = makeCtx(steps, Math.min(step, steps.length - 1), running, reduced, XBLUE);
  return (
    <div className={t.computer} data-mode={mode}>
      <div className={t.bezel}>
        <div className={t.screen}>
          <div className={t.menubar}>
            <span className={t.brand}>
              <img src="/homepage/orb/xroga-orb-icon.webp" alt="" width={16} height={16} />
              {mode === 'browser' ? 'Xroga' : 'Xroga Workforce'}
            </span>
            {mode === 'browser' ? (
              <>
                <span key={mission.id} className={t.ask}>
                  <b>You asked</b>
                  {mission.request}
                </span>
                <span className={t.clock} aria-hidden="true">
                  <i />
                  Mon 9:41
                </span>
              </>
            ) : (
              <WorkforceMenu wf={wf} />
            )}
          </div>
          <div key={mode} className={t.desk} data-mode={mode}>
            {mode === 'browser' ? (
              <>
                <div className={t.wallpaper} aria-hidden="true" />
                <div key={track} className={t.scene}>
                  <BrowserScene mission={mission} ctx={ctx} />
                </div>
              </>
            ) : (
              <Workforce wf={wf} dispatch={wfDispatch} reduced={reduced} />
            )}
          </div>
        </div>
      </div>
      <div className={t.stand} aria-hidden="true" />
    </div>
  );
}

/* ------------------------------------------------------------------------------------------- browser scene */
function BrowserScene({ mission, ctx }: { mission: Mission; ctx: Ctx }) {
  const cam = useRef<HTMLDivElement>(null);
  const app = MISSION_APPS[mission.id];
  const cur = ctx.steps[ctx.step];
  const push = usePush(cam, cur.t, !!cur.push && !ctx.done, ctx.reduced);
  const tabs = app.tabs(ctx);
  return (
    <>
      <div className={t.window}>
        <div ref={cam} className={t.cam} style={push}>
          <div className={t.chrome}>
            <span className={t.lights} aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span className={t.tabStrip}>
              {tabs.map((tb) => (
                <span key={tb.label} className={t.tab} data-on={tb.active || undefined} data-t={tb.t} data-new={tb.fresh || undefined}>
                  <i style={{ background: tb.favicon }} aria-hidden="true" />
                  {tb.label}
                </span>
              ))}
            </span>
            <span className={t.url}>
              <svg viewBox="0 0 12 12" aria-hidden="true">
                <path d="M3.5 5.5V4a2.5 2.5 0 0 1 5 0v1.5M2.8 5.5h6.4v4.2H2.8z" />
              </svg>
              {app.url(ctx)}
            </span>
            <span className={t.driver}>
              <img src="/homepage/orb/xroga-orb-icon.webp" alt="" width={14} height={14} />
              Xroga
            </span>
          </div>
          <div className={t.viewport}>
            <app.App ctx={ctx} />
          </div>
          <Pins steps={ctx.steps} step={ctx.step} scope={cam} />
          <Pointer target={cur.t ?? null} stepKey={`${mission.id}-${cur.id}`} action={cur.act} show={!ctx.done && !ctx.reduced && !!cur.t} reduced={ctx.reduced} accent={XBLUE} />
        </div>
      </div>
      <OutcomeCard mission={mission} show={ctx.done} steps={ctx.steps} />
    </>
  );
}

/* --------------------------------------------------------------------------------------------- the result */
function OutcomeCard({ mission, show, steps }: { mission: Mission; show: boolean; steps: Step[] }) {
  const [open, setOpen] = useState(false);
  const o = mission.outcome;
  return (
    <aside className={t.outcome} data-show={show || undefined} data-state={o.state} data-open={open || undefined} {...inertIf(!show)} aria-hidden={!show || undefined} aria-label="Result">
      <div className={t.outcomeHead}>
        <img src="/homepage/orb/xroga-orb-icon.webp" alt="" width={20} height={20} />
        <b>{o.title}</b>
      </div>
      {open ? (
        <ol className={t.trail} aria-label="Steps Xroga took">
          {steps.slice(0, -1).map((st, i) => (
            <li key={st.id}>
              <span>{i + 1}</span>
              {st.label}
            </li>
          ))}
        </ol>
      ) : (
        <ul>
          {o.lines.map((l) => (
            <li key={l.text} data-mark={l.mark}>
              <i aria-hidden="true" />
              {l.label && <b>{l.label}</b>}
              <span>{l.text}</span>
            </li>
          ))}
        </ul>
      )}
      <div className={t.gate} data-state={o.state}>
        <span>
          <i aria-hidden="true" />
          {o.gate}
        </span>
        <button type="button" className={t.inspect} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? 'Show result' : COPY.inspect}
        </button>
      </div>
    </aside>
  );
}
