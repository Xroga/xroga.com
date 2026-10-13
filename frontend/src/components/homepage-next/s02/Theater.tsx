'use client';

/**
 * The S02 computer: one machined titanium display on a graphite stand, with two different interiors.
 *
 * Browser Automation: an Xroga desktop with one application window driven by Xroga's blue pointer, a glass dock of
 * four missions, findings pinned where they happen and a result that waits for approval.
 *
 * AI Employees: the Xroga Workforce studio (Workforce.tsx), a team environment with assignments, a night away and
 * the results waiting on return. It has no pointer and no app dock: the employees are the subject, not the browser.
 */
import { useRef, type CSSProperties } from 'react';
import { makeCtx, type Ctx } from './ctx';
import { Pins, Pointer, usePush } from './motion';
import { MISSION_APPS } from './Missions';
import { Workforce, WorkforceMenu } from './WorkforceSurface';
import { COPY, MISSIONS, missionOf, stepsOf, type Mission, type Mode, type Outcome, type TrackId } from './script';
import type { WfAction, WfState } from './workforce';
import { inertIf } from './inert';
import t from './Theater.module.css';

const XBLUE = '#4589ff';

export function Theater({
  mode,
  track,
  step,
  ended,
  running,
  reduced,
  wf,
  wfDispatch,
  onPick,
  onReplay,
}: {
  mode: Mode;
  track: TrackId;
  step: number;
  ended: boolean;
  running: boolean;
  reduced: boolean;
  wf: WfState;
  wfDispatch: (a: WfAction) => void;
  onPick: (t: TrackId) => void;
  onReplay: () => void;
}) {
  const mission = missionOf(track)!;
  const steps = stepsOf(track);
  const ctx = makeCtx(steps, Math.min(step, steps.length - 1), running, reduced, XBLUE);
  return (
    <div className={t.computer} data-mode={mode} data-view={mode === 'workforce' ? wf.view : undefined} style={{ '--accent': XBLUE } as CSSProperties}>
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
                  <BrowserScene mission={mission} ctx={ctx} ended={ended} onReplay={onReplay} />
                </div>
                <Dock track={track} onPick={onPick} />
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
function BrowserScene({ mission, ctx, ended, onReplay }: { mission: Mission; ctx: Ctx; ended: boolean; onReplay: () => void }) {
  const cam = useRef<HTMLDivElement>(null);
  const app = MISSION_APPS[mission.id];
  const cur = ctx.steps[ctx.step];
  const push = usePush(cam, cur.t, !!cur.push && !ctx.done, ctx.reduced);
  return (
    <>
      <div className={t.window} data-kind="browser">
        <div ref={cam} className={t.cam} style={push}>
          <div className={t.chrome}>
            <span className={t.lights} aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span className={t.tabStrip}>
              <span className={t.tab}>
                <i style={{ background: app.favicon }} aria-hidden="true" />
                {app.tab}
              </span>
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
      <OutcomeCard outcome={mission.outcome} show={ctx.done} ended={ended} reduced={ctx.reduced} onReplay={onReplay} />
    </>
  );
}

/* --------------------------------------------------------------------------------------------- the result */
function OutcomeCard({ outcome, show, reduced, onReplay }: { outcome: Outcome; show: boolean; ended: boolean; reduced: boolean; onReplay: () => void }) {
  return (
    <aside className={t.outcome} data-show={show || undefined} data-state={outcome.state} {...inertIf(!show)} aria-hidden={!show || undefined}>
      <div className={t.outcomeHead}>
        <img src="/homepage/orb/xroga-orb-icon.webp" alt="" width={22} height={22} />
        <b>{outcome.title}</b>
      </div>
      <ul>
        {outcome.lines.map((l) => (
          <li key={l.text} data-mark={l.mark}>
            <i aria-hidden="true" />
            {l.text}
          </li>
        ))}
      </ul>
      <div className={t.gate} data-state={outcome.state}>
        <span>
          <i aria-hidden="true" />
          {outcome.gate}
        </span>
        {!reduced && (
          <button type="button" className={t.again} onClick={onReplay}>
            {COPY.replay}
          </button>
        )}
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------------------------------------- dock */
function Dock({ track, onPick }: { track: TrackId; onPick: (t: TrackId) => void }) {
  return (
    <nav className={t.dock} aria-label="Choose a browser mission">
      <div className={t.dockShelf}>
        {MISSIONS.map((m) => (
          <button key={m.id} type="button" className={t.dockItem} data-kind="mission" aria-pressed={track === `browser:${m.id}`} onClick={() => onPick(`browser:${m.id}`)}>
            <span className={t.appIcon} data-id={m.id} aria-hidden="true">
              <MissionGlyph id={m.id} />
            </span>
            <span className={t.dockLabel}>{m.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

/** Small app glyphs for the four missions (drawn for this page, no third-party logos). */
function MissionGlyph({ id }: { id: Mission['id'] }) {
  switch (id) {
    case 'bug':
      return (
        <svg viewBox="0 0 24 24">
          <rect x="3" y="4" width="18" height="14" rx="2.5" />
          <path d="M3 8h18" />
          <circle cx="15.5" cy="14.5" r="3.2" />
          <path d="M17.8 16.8 20.5 19.5" />
        </svg>
      );
    case 'ads':
      return (
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="12" r="4.8" />
          <circle cx="12" cy="12" r="1.4" fill="currentColor" />
          <path d="M18 6l2.5-2.5" />
        </svg>
      );
    case 'extension':
      return (
        <svg viewBox="0 0 24 24">
          <path d="M9 4.5a2 2 0 1 1 4 0V6h3.5a1.5 1.5 0 0 1 1.5 1.5V11h-1.5a2 2 0 1 0 0 4H18v3.5a1.5 1.5 0 0 1-1.5 1.5H13v-1.5a2 2 0 1 0-4 0V20H5.5A1.5 1.5 0 0 1 4 18.5V15h1.5a2 2 0 1 0 0-4H4V7.5A1.5 1.5 0 0 1 5.5 6H9z" />
        </svg>
      );
    case 'article':
      return (
        <svg viewBox="0 0 24 24">
          <path d="M6 3.5h8.5L19 8v12.5H6z" />
          <path d="M14.5 3.5V8H19M9 12h7M9 15.5h7M9 9h3" />
        </svg>
      );
  }
}
