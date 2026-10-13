'use client';

/**
 * The S02 computer: a machined titanium display on a graphite stand. On its screen, an Xroga desktop whose
 * wallpaper is drawn from the orb's own glass colours, a menu bar that carries the current assignment, the work
 * itself (a browser driven by Xroga's blue pointer, or an AI Employee at its own computer), and a glass dock that
 * is the selector. Everything visible is a function of (track, step) from script.ts.
 */
import { useRef, type CSSProperties } from 'react';
import { Companion } from './Companion';
import { makeCtx, type Ctx } from './ctx';
import { Pins, Pointer, usePush } from './motion';
import { MISSION_APPS } from './Missions';
import { EMPLOYEE_APPS } from './Workspaces';
import { COPY, EMPLOYEES, FEATURED, MISSIONS, TEAM_STEPS, employeeOf, missionOf, modeOf, stepsOf, type Employee, type Mission, type Outcome, type TrackId } from './script';
import { inertIf } from './inert';
import t from './Theater.module.css';

const XBLUE = '#4589ff';

export function Theater({
  track,
  step,
  ended,
  running,
  reduced,
  briefSent,
  hold,
  onPick,
  onReplay,
}: {
  track: TrackId;
  step: number;
  ended: boolean;
  running: boolean;
  reduced: boolean;
  briefSent: boolean;
  hold: boolean;
  onPick: (t: TrackId) => void;
  onReplay: () => void;
}) {
  const mode = modeOf(track);
  const mission = missionOf(track);
  const employee = employeeOf(track);
  const steps = stepsOf(track);
  const accent = employee?.accent ?? XBLUE;
  const ctx = makeCtx(steps, Math.min(step, steps.length - 1), running, reduced, accent);

  return (
    <div className={t.computer} data-mode={mode} data-track={track} style={{ '--accent': accent } as CSSProperties}>
      <div className={t.bezel}>
        <div className={t.screen}>
          <MenuBar mission={mission} employee={employee} team={track === 'emp:team'} />
          <div className={t.desk}>
            <div className={t.wallpaper} aria-hidden="true" />
            <div key={track} className={t.scene}>
              {mission && <BrowserScene mission={mission} ctx={ctx} ended={ended} onReplay={onReplay} />}
              {employee && <EmployeeScene employee={employee} ctx={ctx} briefSent={briefSent} onReplay={onReplay} />}
              {track === 'emp:team' && <TeamLineup step={ctx.step} reduced={reduced} hold={hold} onPick={onPick} />}
            </div>
            <Dock track={track} briefSent={briefSent} onPick={onPick} />
          </div>
        </div>
      </div>
      <div className={t.stand} aria-hidden="true" />
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------- menu bar */
function MenuBar({ mission, employee, team }: { mission?: Mission; employee?: Employee; team: boolean }) {
  return (
    <div className={t.menubar}>
      <span className={t.brand}>
        <img src="/homepage/orb/xroga-orb-icon.webp" alt="" width={16} height={16} />
        Xroga
      </span>
      <span key={mission?.id ?? employee?.id ?? 'team'} className={t.ask}>
        {team ? (
          <>
            <b>AI Employees</b> Six specialists, each with its own computer
          </>
        ) : (
          <>
            <b>{mission ? 'You asked' : `Assigned to ${employee!.name}`}</b>
            {mission?.request ?? employee!.request}
          </>
        )}
      </span>
      <span className={t.clock} aria-hidden="true">
        <i />
        Thu 9:41
      </span>
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

/* ------------------------------------------------------------------------------------------ employee scene */
function EmployeeScene({ employee, ctx, briefSent, onReplay }: { employee: Employee; ctx: Ctx; briefSent: boolean; onReplay: () => void }) {
  const cam = useRef<HTMLDivElement>(null);
  const app = EMPLOYEE_APPS[employee.id];
  const cur = ctx.steps[ctx.step];
  const push = usePush(cam, cur.t, !!cur.push && !ctx.done, ctx.reduced);
  return (
    <>
      <div className={t.colleague}>
        <Companion e={employee} size={96} state={ctx.done ? 'active' : 'working'} pedestal />
        <span className={t.colleagueName}>{employee.name}</span>
      </div>
      <div className={t.window} data-kind="workspace">
        <div ref={cam} className={t.cam} style={push}>
          <div className={t.chrome} data-app={app.chrome}>
            <span className={t.lights} aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span className={t.title}>{employee.app}</span>
            <span className={t.driver} style={{ '--c': employee.accent } as CSSProperties}>
              <i aria-hidden="true" />
              {employee.name} at work
            </span>
          </div>
          <div className={t.viewport} data-scroll>
            <app.App ctx={ctx} briefSent={briefSent} />
          </div>
          <Pins steps={ctx.steps} step={ctx.step} scope={cam} accent={employee.accent} />
          <Pointer target={cur.t ?? null} stepKey={`${employee.id}-${cur.id}`} action={cur.act} show={!ctx.done && !ctx.reduced && !!cur.t} reduced={ctx.reduced} accent={employee.accent} />
        </div>
      </div>
      <OutcomeCard outcome={employee.outcome} show={ctx.done} ended={false} reduced={ctx.reduced} onReplay={onReplay} employee={employee} />
    </>
  );
}

/* --------------------------------------------------------------------------------------------- the result */
function OutcomeCard({ outcome, show, reduced, onReplay, employee }: { outcome: Outcome; show: boolean; ended: boolean; reduced: boolean; onReplay: () => void; employee?: Employee }) {
  return (
    <aside className={t.outcome} data-show={show || undefined} data-state={outcome.state} {...inertIf(!show)} aria-hidden={!show || undefined}>
      <div className={t.outcomeHead}>
        {employee ? <Companion e={employee} size={30} state="quiet" className={t.outcomeMark} /> : <img src="/homepage/orb/xroga-orb-icon.webp" alt="" width={22} height={22} />}
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
            {COPY.watchAgain}
          </button>
        )}
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------------------------------ team lineup */
const ARC = [
  { x: 10.5, y: 26 },
  { x: 26, y: 35 },
  { x: 42, y: 40 },
  { x: 58, y: 40 },
  { x: 74, y: 35 },
  { x: 89.5, y: 26 },
];
function TeamLineup({ step, reduced, hold, onPick }: { step: number; reduced: boolean; hold: boolean; onPick: (t: TrackId) => void }) {
  const id = (n: string) => TEAM_STEPS.findIndex((x) => x.id === n);
  const phase = reduced ? 'settle' : step >= id('feature') && !hold ? 'feature' : step >= id('settle') ? 'settle' : step >= id('emerge') ? 'emerge' : 'glow';
  return (
    <div className={t.lineup} data-phase={phase}>
      <div className={t.parent} aria-hidden="true">
        <img src="/homepage/s02/companion-orb-512.webp" alt="" />
      </div>
      <ul className={t.team} aria-label="AI Employees">
        {EMPLOYEES.map((e, i) => (
          <li
            key={e.id}
            className={t.member}
            data-featured={e.id === FEATURED || undefined}
            style={{ '--x': `${ARC[i].x}%`, '--y': `${ARC[i].y}%`, '--i': i, '--accent': e.accent } as CSSProperties}
          >
            <button type="button" className={t.memberBtn} onClick={() => onPick(`emp:${e.id}`)} aria-label={`Open ${e.name}'s workspace`}>
              <Companion e={e} size={112} pedestal state="idle" style={{ '--idle-delay': `${-i * 0.7}s`, '--glint-delay': `${1 + i * 0.9}s` } as CSSProperties} />
              <span className={t.memberName}>{e.name}</span>
              <span className={t.memberJob}>{JOBS[e.id]}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
const JOBS: Record<Employee['id'], string> = {
  builder: 'Code, fixes, tests',
  growth: 'Prospects, offers, outreach',
  research: 'Sources, evidence, decisions',
  creative: 'Campaigns, visuals, formats',
  data: 'Records, cleanup, reports',
  ops: 'Requests, schedules, follow-ups',
};

/* ------------------------------------------------------------------------------------------------- dock */
function Dock({ track, briefSent, onPick }: { track: TrackId; briefSent: boolean; onPick: (t: TrackId) => void }) {
  const mode = modeOf(track);
  return (
    <nav className={t.dock} aria-label={mode === 'browser' ? 'Choose a browser mission' : 'Choose an AI Employee'}>
      <div className={t.dockShelf}>
        {mode === 'browser'
          ? MISSIONS.map((m) => (
              <button key={m.id} type="button" className={t.dockItem} data-kind="mission" aria-pressed={track === `browser:${m.id}`} onClick={() => onPick(`browser:${m.id}`)}>
                <span className={t.appIcon} data-id={m.id} aria-hidden="true">
                  <MissionGlyph id={m.id} />
                </span>
                <span className={t.dockLabel}>{m.label}</span>
              </button>
            ))
          : [
              <button key="team" type="button" className={t.dockItem} data-kind="team" aria-pressed={track === 'emp:team'} onClick={() => onPick('emp:team')}>
                <span className={t.teamIcon} aria-hidden="true">
                  <img src="/homepage/s02/companion-orb-256.webp" alt="" />
                </span>
                <span className={t.dockLabel}>{COPY.team}</span>
              </button>,
              <span key="sep" className={t.dockSep} aria-hidden="true" />,
              ...EMPLOYEES.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className={t.dockItem}
                  data-kind="employee"
                  aria-pressed={track === `emp:${e.id}`}
                  onClick={() => onPick(`emp:${e.id}`)}
                  style={{ '--accent': e.accent } as CSSProperties}
                  aria-label={e.name}
                >
                  <span className={t.dockMate}>
                    <Companion e={e} size={38} state={track === `emp:${e.id}` ? 'active' : 'idle'} style={{ '--idle-delay': `${-EMPLOYEES.indexOf(e) * 0.6}s` } as CSSProperties} />
                    {e.id === 'growth' && briefSent && <i className={t.dockBadge} title="Brief waiting" />}
                  </span>
                  <span className={t.dockLabel}>{e.short}</span>
                </button>
              )),
            ]}
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
