'use client';

/**
 * AI Employees: the entrance (the Xroga orb energizes, then six X companions separate from it into formation, each
 * over a glimpse of its own workspace) and the lineup selector that keeps all six visible while one works.
 */
import { EMPLOYEES, type EmployeeId } from './script';
import { XMark, XrogaCore } from './XMark';
import m from './Team.module.css';

export function TeamIntro({ onPick, reduced }: { onPick: (id: EmployeeId) => void; reduced: boolean }) {
  return (
    <div className={m.intro} data-reduced={reduced || undefined}>
      <span className={m.core}><XrogaCore size={96} /></span>
      <div className={m.formation}>
        {EMPLOYEES.map((e, i) => (
          <button
            key={e.id}
            type="button"
            className={m.member}
            data-id={e.id}
            style={{ '--i': i, '--dx': `${(2.5 - i) * 100}%` } as React.CSSProperties}
            aria-label={`Open ${e.name}: ${e.role}`}
            onClick={() => onPick(e.id)}
          >
            <span className={m.glimpse} data-app={e.id} aria-hidden="true"><i /><i /><i /><i /></span>
            <XMark id={e.id} size={64} />
            <b>{e.name}</b>
            <small>{e.role}</small>
          </button>
        ))}
      </div>
      <p className={m.hint}>Choose an employee to open their workspace</p>
    </div>
  );
}

export function Lineup({ active, onPick, onTeam, briefReady }: { active: EmployeeId | null; onPick: (id: EmployeeId) => void; onTeam: () => void; briefReady: boolean }) {
  return (
    <div className={m.lineup} role="group" aria-label="AI Employees">
      <button type="button" className={m.chip} data-team="" aria-pressed={active === null} aria-label="Show the whole team" onClick={onTeam}>
        <XrogaCore size={26} />
        <span>Team</span>
      </button>
      {EMPLOYEES.map((e) => (
        <button key={e.id} type="button" className={m.chip} data-id={e.id} aria-pressed={active === e.id} aria-label={`Open ${e.name}`} onClick={() => onPick(e.id)}>
          <XMark id={e.id} size={30} focus={active === e.id} />
          <span>{e.name}</span>
          {e.id === 'acquisition' && briefReady && active !== 'acquisition' && <em className={m.badge}>Brief</em>}
        </button>
      ))}
    </div>
  );
}
