'use client';

/**
 * The Xroga Workforce studio: the AI Employees interior of the S02 computer. It deliberately shares nothing with
 * the browser interior except the frame: no app window, no pointer, no mission dock. Its subject is ongoing
 * ownership: who is on the team, what each one is responsible for, what happened while you were away, and what
 * waits for your decision.
 *
 * team        atrium: six glass-X specialists arranged as one unit on a lit floor; the entrance plays once
 * assignment  the chosen specialist steps forward; a two-step sheet sets goal, trigger, deliverable, tools, approvals
 * away        operations timeline: Mon 17:42 → Tue 18:00, a playhead crossing six lanes as work lands on them
 * workspace   back at the desk: roster with live status, what changed, and the employee's own tools (Workspaces.tsx)
 */
import type { CSSProperties } from 'react';
import { Companion } from './Companion';
import { EMPLOYEE_SURFACES } from './Workspaces';
import { AWAY_BEATS, COPY, EMPLOYEES, REFERENCE, employeeOf, type Employee, type EmployeeId } from './script';
import { visibleUntil, type WfAction, type WfState } from './workforce';
import w from './Workforce.module.css';

type D = (a: WfAction) => void;

export function Workforce({ wf, dispatch, reduced }: { wf: WfState; dispatch: D; reduced: boolean }) {
  return (
    <div className={w.studio} data-view={wf.view} style={{ '--accent': employeeOf(wf.selected).accent } as CSSProperties}>
      <div className={w.backdrop} aria-hidden="true" data-daylight={wf.view === 'away' ? (wf.beat >= 3 ? 'day' : 'night') : undefined} />
      <div key={wf.view} className={w.view}>
        {wf.view === 'team' && <Atrium wf={wf} dispatch={dispatch} reduced={reduced} />}
        {wf.view === 'assignment' && <AssignmentSheet wf={wf} dispatch={dispatch} />}
        {wf.view === 'away' && <Away wf={wf} dispatch={dispatch} reduced={reduced} />}
        {wf.view === 'workspace' && <Desk wf={wf} dispatch={dispatch} />}
      </div>
    </div>
  );
}

/** Menu bar content for the workforce interior: where you are in the story, and the simulated clock. */
export function WorkforceMenu({ wf }: { wf: WfState }) {
  const e = employeeOf(wf.selected);
  const clock = wf.view === 'away' ? AWAY_BEATS[wf.beat].clock : wf.returned && wf.view !== 'assignment' ? REFERENCE.back : 'Mon 17:40';
  return (
    <>
      <span key={`${wf.view}-${wf.view === 'away' ? wf.beat : ''}`} className={w.menuAsk}>
        {wf.view === 'team' && (
          <>
            <b>{COPY.team}</b> 6 specialists · each owns a responsibility
          </>
        )}
        {wf.view === 'assignment' && (
          <>
            <b>New responsibility</b> for {e.name}
          </>
        )}
        {wf.view === 'away' && (
          <>
            <b>While you’re away</b> {AWAY_BEATS[wf.beat].caption}
          </>
        )}
        {wf.view === 'workspace' && (
          <>
            <b>While you were away</b> {REFERENCE.assigned} → {REFERENCE.back}
          </>
        )}
      </span>
      <span className={w.menuRight}>
        <span className={w.concept}>{COPY.conceptTag}</span>
        <span className={w.clock} data-away={wf.view === 'away' || undefined}>
          {clock}
        </span>
      </span>
    </>
  );
}

/* ================================================================================================ atrium */
/** Two tiers with depth: the back row stands higher and smaller, every face turned a little toward the centre. */
const SPOTS: Record<EmployeeId, { x: number; y: number; z: number; tilt: number }> = {
  research: { x: 29, y: 2, z: 0.84, tilt: 4 },
  builder: { x: 50, y: -1, z: 0.84, tilt: 0 },
  creative: { x: 71, y: 2, z: 0.84, tilt: -4 },
  growth: { x: 14.5, y: 38, z: 1, tilt: 6 },
  ops: { x: 50, y: 42, z: 1.05, tilt: 0 },
  data: { x: 85.5, y: 38, z: 1, tilt: -6 },
};

function Atrium({ wf, dispatch, reduced }: { wf: WfState; dispatch: D; reduced: boolean }) {
  const playing = wf.intro === 'pending' && !reduced;
  return (
    <div className={w.atrium} data-intro={playing ? 'playing' : 'done'}>
      <div className={w.floor} aria-hidden="true">
        <i />
        <i />
      </div>
      <div className={w.parent} aria-hidden="true">
        <img src="/homepage/s02/companion-orb-256.webp" alt="" />
      </div>
      <ul className={w.team} aria-label={COPY.team}>
        {EMPLOYEES.map((e, i) => {
          const p = SPOTS[e.id];
          const t = wf.tasks[e.id];
          return (
            <li
              key={e.id}
              className={w.member}
              data-row={p.z < 1 ? 'back' : 'front'}
              style={{ '--x': p.x, '--y': p.y, '--z': p.z, '--tilt': `${p.tilt}deg`, '--i': i, '--accent': e.accent } as CSSProperties}
            >
              <button
                type="button"
                className={w.memberBtn}
                onClick={() => dispatch({ type: wf.returned ? 'inspect' : 'open', id: e.id })}
                aria-label={wf.returned ? `${e.name}: ${e.ret.status}. Open their results` : `${e.name}, ${e.role}. Preview this employee`}
              >
                <span className={w.figure}>
                  <Companion e={e} size={148} pedestal state="idle" style={{ '--idle-delay': `${-i * 0.7}s`, '--glint-delay': `${1 + i * 0.9}s` } as CSSProperties} />
                </span>
                <span className={w.nameplate}>
                  <b>{e.name}</b>
                  <span>{wf.returned ? e.ret.status : e.role}</span>
                  <small className={w.sched}>
                    <i aria-hidden="true">↻</i>
                    {wf.returned ? `Next: ${t.nextRun}` : e.assignment.triggers[wf.config[e.id].trigger]}
                  </small>
                </span>
                {wf.returned && t.approvalNeeded > 0 && <i className={w.badge}>{t.approvalNeeded}</i>}
                <span className={w.cue} aria-hidden="true">
                  {wf.returned ? 'See results' : 'Preview this employee'} →
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className={w.hint}>{wf.returned ? 'Results are in. Open anyone to see what changed.' : 'Choose a specialist and give them a responsibility.'}</p>
    </div>
  );
}

/* ============================================================================================ assignment */
function AssignmentSheet({ wf, dispatch }: { wf: WfState; dispatch: D }) {
  const e = employeeOf(wf.selected);
  const c = wf.config[e.id];
  const a = e.assignment;
  return (
    <div className={w.assign}>
      <div className={w.stepForward}>
        <Companion e={e} size={176} pedestal state="active" />
        <b>{e.name}</b>
        <span>{e.role}</span>
        <button type="button" className={w.textBtn} onClick={() => dispatch({ type: 'team' })}>
          ← Back to the team
        </button>
      </div>
      <form className={w.sheet} onSubmit={(ev) => ev.preventDefault()} aria-label={`Give ${e.name} a responsibility`}>
        <div className={w.sheetHead}>
          <b>Give {e.short} a responsibility</b>
          <ol className={w.stepper}>
            <li data-on={wf.sheet === 0 || undefined}>
              <i>1</i> Responsibility
            </li>
            <li data-on={wf.sheet === 1 || undefined}>
              <i>2</i> Boundaries
            </li>
          </ol>
        </div>
        {wf.sheet === 0 ? (
          <div className={w.sheetBody} key="s0">
            <div className={w.field}>
              <span>Goal</span>
              <p className={w.goal}>{a.goal}</p>
            </div>
            <fieldset className={w.field}>
              <legend>When to work</legend>
              <div className={w.chips}>
                {a.triggers.map((tr, i) => (
                  <button key={tr} type="button" className={w.chip} aria-pressed={c.trigger === i} onClick={() => dispatch({ type: 'trigger', index: i })}>
                    {tr}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className={w.field}>
              <span>What to deliver</span>
              <p className={w.deliver}>{a.deliver}</p>
            </div>
            <div className={w.sheetFoot}>
              <span className={w.note}>Defaults are filled in; change anything.</span>
              <button type="button" className={w.primary} onClick={() => dispatch({ type: 'sheet', step: 1 })}>
                Next: boundaries →
              </button>
            </div>
          </div>
        ) : (
          <div className={w.sheetBody} key="s1">
            <fieldset className={w.field}>
              <legend>Allowed tools and sources</legend>
              <div className={w.chips}>
                {a.tools.map((tl, i) => (
                  <button key={tl.label} type="button" className={w.chip} data-kind="tool" aria-pressed={c.tools[i]} onClick={() => dispatch({ type: 'tool', index: i })}>
                    {tl.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className={w.field}>
              <legend>Ask me before</legend>
              <div className={w.checks}>
                {a.approvals.map((ap, i) => (
                  <label key={ap.label} className={w.check}>
                    <input type="checkbox" checked={c.approvals[i]} onChange={() => dispatch({ type: 'approval', index: i })} />
                    <span>{ap.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className={w.sheetFoot}>
              <button type="button" className={w.textBtn} onClick={() => dispatch({ type: 'sheet', step: 0 })}>
                ← Responsibility
              </button>
              <span className={w.note}>Simulation only · nothing is created or contacted</span>
              <button type="button" className={w.primary} onClick={() => dispatch({ type: 'preview' })}>
                Preview assignment
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}

/* ================================================================================================= away */
const TICKS = ['Mon 18:00', '21:00', 'Tue 00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00'];

function Away({ wf, dispatch, reduced }: { wf: WfState; dispatch: D; reduced: boolean }) {
  const now = reduced ? 24 : visibleUntil(wf.beat);
  const done = now >= 24;
  const research = EMPLOYEES.findIndex((e) => e.id === 'research');
  const growth = EMPLOYEES.findIndex((e) => e.id === 'growth');
  const handed = now >= 12.15;
  const saved = EMPLOYEES.flatMap((e) => e.away.filter((b) => b.kind === 'deliver' && b.at <= now).map((b) => ({ e, b })));
  const waiting = EMPLOYEES.reduce((n, e) => n + e.away.filter((b) => b.kind === 'decision' && b.at <= now).length, 0);
  return (
    <div className={w.away} style={{ '--now': now } as CSSProperties} data-done={done || undefined}>
      <div className={w.awayHead}>
        <span className={w.laptop} data-closed={wf.beat > 0 || reduced || undefined} aria-hidden="true">
          <svg viewBox="0 0 64 40">
            <rect className={w.lid} x="10" y="3" width="44" height="28" rx="3" />
            <path d="M4 33h56l-3 4H7z" />
          </svg>
        </span>
        <span className={w.awayWho}>
          <b>{done ? 'You’re back' : 'Your laptop is closed'}</b>
          <small>{done ? 'Tue 18:00 · results are waiting' : 'The team keeps its schedule (in the product vision, on Xroga’s servers)'}</small>
        </span>
        <span className={w.bigClock} aria-hidden="true">
          {reduced ? 'Tue 18:00' : AWAY_BEATS[wf.beat].clock}
        </span>
        <button type="button" className={done ? w.primary : w.textBtn} onClick={() => dispatch({ type: 'skip' })}>
          {done ? 'See what changed →' : 'Skip to results'}
        </button>
      </div>

      <div className={w.timeline} role="img" aria-label={`Team activity from Monday 17:42 to Tuesday 18:00. ${saved.length} deliverables saved, ${waiting} decisions waiting for you.`}>
        <div className={w.axis} aria-hidden="true">
          <span />
          <span className={w.axisTrack}>
            {TICKS.map((t, i) => (
              <i key={t} style={{ left: `${(i / (TICKS.length - 1)) * 100}%` }}>
                {t}
              </i>
            ))}
          </span>
          <span />
        </div>
        <div className={w.lanes}>
        {EMPLOYEES.map((e) => {
          const vis = e.away.filter((b) => b.at <= now);
          const latest = vis[vis.length - 1];
          const mine = wf.tasks[e.id].source === 'you';
          const active = e.away.some((b) => b.at <= now && b.at + b.len > now - 0.01 && b.kind === 'run');
          return (
            <div key={e.id} className={w.lane} data-mine={mine || undefined} style={{ '--accent': e.accent } as CSSProperties}>
              <span className={w.laneWho}>
                <Companion e={e} size={30} state={active ? 'working' : 'quiet'} />
                <b>{e.short}</b>
                {mine && <em>You assigned</em>}
              </span>
              <span className={w.track}>
                <span className={w.night} />
                {e.away.map((b) => (
                  <i
                    key={b.label}
                    className={w.block}
                    data-kind={b.kind}
                    data-on={b.at <= now || undefined}
                    style={{ left: `${(b.at / 24) * 100}%`, width: `max(7px, ${(b.len / 24) * 100}%)` }}
                    title={b.label}
                  />
                ))}
              </span>
              <span key={latest?.label ?? 'idle'} className={w.latest} data-kind={latest?.kind}>
                {latest ? latest.label : <em>Scheduled · {e.assignment.triggers[wf.config[e.id].trigger].replace('Every ', '')}</em>}
              </span>
            </div>
          );
        })}
        <span className={w.playhead} aria-hidden="true" />
        {handed && (
          <span className={w.handoff} style={{ '--from': research, '--to': growth } as CSSProperties} aria-hidden="true">
            <i />
            Brief #7 · Research → Growth · 06:10
          </span>
        )}
        </div>
      </div>

      <div className={w.tray}>
        <span className={w.trayLabel}>Saved while you were away</span>
        <span className={w.trayItems}>
          {saved.map(({ e, b }) => (
            <span key={b.label} className={w.artifact} style={{ '--accent': e.accent } as CSSProperties}>
              <i />
              {b.label}
            </span>
          ))}
          {saved.length === 0 && <em className={w.trayEmpty}>Nothing yet</em>}
        </span>
        <span className={w.waiting} data-n={waiting}>
          <b>{waiting}</b> waiting for your decision
        </span>
      </div>
    </div>
  );
}

/* ================================================================================================= desk */
function Desk({ wf, dispatch }: { wf: WfState; dispatch: D }) {
  const e = employeeOf(wf.selected);
  const task = wf.tasks[e.id];
  const Surface = EMPLOYEE_SURFACES[e.id];
  const decision = wf.decisions[e.id];
  return (
    <div className={w.desk}>
      <nav className={w.roster} aria-label="Your AI workforce">
        <button type="button" className={w.rosterTeam} onClick={() => dispatch({ type: 'team' })}>
          <img src="/homepage/s02/companion-orb-256.webp" alt="" width={22} height={22} />
          Team
        </button>
        <ul>
          {EMPLOYEES.map((m) => {
            const t = wf.tasks[m.id];
            const d = wf.decisions[m.id];
            return (
              <li key={m.id}>
                <button
                  type="button"
                  className={w.rosterItem}
                  aria-pressed={m.id === e.id}
                  onClick={() => dispatch({ type: 'inspect', id: m.id })}
                  style={{ '--accent': m.accent } as CSSProperties}
                >
                  <Companion e={m} size={36} state={m.id === e.id ? 'active' : 'idle'} />
                  <span>
                    <b>{m.short}</b>
                    <small>{d === 'approved' ? 'Approved in preview' : d === 'held' ? 'On hold' : m.ret.status}</small>
                  </span>
                  {t.approvalNeeded > 0 && <i className={w.rosterBadge}>{t.approvalNeeded}</i>}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div key={e.id} className={w.focus}>
        <header className={w.focusHead}>
          <Companion e={e} size={48} state="active" />
          <span className={w.focusWho}>
            <b>{e.name}</b>
            <small>
              {e.role} · {task.source === 'you' ? `assigned by you ${task.assignedAt}` : `on the job since ${task.assignedAt}`} · {e.assignment.triggers[wf.config[e.id].trigger]}
            </small>
          </span>
          <button type="button" className={w.textBtn} onClick={() => dispatch({ type: 'open', id: e.id })}>
            Change responsibility
          </button>
        </header>
        <div className={w.since}>
          <span className={w.stat} data-kind="deliver">
            <b>{e.ret.delivered}</b> Delivered
          </span>
          <span className={w.stat} data-kind="decision" data-clear={task.approvalNeeded === 0 || undefined}>
            <b>{task.approvalNeeded}</b> Needs your decision
          </span>
          <span className={w.stat} data-kind="next">
            <b>{e.ret.next}</b> Next scheduled run
          </span>
          <ul className={w.changed} aria-label="What changed since your last check">
            {e.ret.changed.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
        <Surface e={e} decision={decision} onDecide={(value) => dispatch({ type: 'decide', id: e.id, value })} handoff={wf.returned} />
      </div>
    </div>
  );
}

export type SurfaceProps = { e: Employee; decision?: 'approved' | 'held'; onDecide: (v: 'approved' | 'held') => void; handoff: boolean };
