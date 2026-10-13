/**
 * AI workforce preview state (V10): a pure reducer, separate from the browser mission engine so that switching
 * modes never wipes either side.
 *
 * team        the atrium: six specialists, each with a standing responsibility (the entrance plays once per visit)
 * assignment  a two-step sheet: responsibility (goal, trigger, deliverable) then boundaries (tools, approvals)
 * away        the night away: a playhead crosses Mon 17:42 → Tue 18:00 while work lands on each lane
 * workspace   back at the desk: what changed, the latest artifact, the decision waiting, and the employee's own tools
 *
 * `tasks` is client-local demo state for this page session only. It is derived from a fixed reference clock in
 * script.ts, never from real elapsed time, and no action here reaches a server or an outside service.
 */
import { AWAY_BEATS, EMPLOYEES, REFERENCE, type EmployeeId } from './script';

export type View = 'team' | 'assignment' | 'away' | 'workspace';

export interface SimTask {
  assignedAt: string;
  lastActivity: string;
  nextRun: string;
  status: 'scheduled' | 'working' | 'review' | 'delivered';
  artifacts: string[];
  approvalNeeded: number;
  /** standing: part of the sample team · you: assigned by the visitor in this preview */
  source: 'standing' | 'you';
}

export interface Config {
  trigger: number;
  tools: boolean[];
  approvals: boolean[];
}

export interface WfState {
  view: View;
  selected: EmployeeId;
  /** Assignment sheet step: 0 responsibility, 1 boundaries. */
  sheet: 0 | 1;
  intro: 'pending' | 'done';
  /** Index into AWAY_BEATS while away. */
  beat: number;
  /** The night away has been shown at least once, so every employee has results to inspect. */
  returned: boolean;
  tasks: Record<EmployeeId, SimTask>;
  config: Record<EmployeeId, Config>;
  decisions: Partial<Record<EmployeeId, 'approved' | 'held'>>;
  gen: number;
}

export type WfAction =
  | { type: 'intro-done' }
  | { type: 'open'; id: EmployeeId }
  | { type: 'sheet'; step: 0 | 1 }
  | { type: 'trigger'; index: number }
  | { type: 'tool'; index: number }
  | { type: 'approval'; index: number }
  | { type: 'preview' }
  | { type: 'tick'; gen: number }
  | { type: 'skip' }
  /** Reduced motion: show the whole night at once (the visitor moves on with "See what changed"). */
  | { type: 'settle' }
  | { type: 'inspect'; id: EmployeeId }
  | { type: 'team' }
  | { type: 'decide'; id: EmployeeId; value: 'approved' | 'held' };

const ids = EMPLOYEES.map((e) => e.id);
const byId = <T>(f: (id: EmployeeId) => T) => Object.fromEntries(ids.map((id) => [id, f(id)])) as Record<EmployeeId, T>;
const emp = (id: EmployeeId) => EMPLOYEES.find((e) => e.id === id)!;

const standing = (id: EmployeeId): SimTask => ({
  assignedAt: 'Mon 6 Oct',
  lastActivity: 'Mon 16:50',
  nextRun: emp(id).assignment.triggers[0],
  status: 'scheduled',
  artifacts: [],
  approvalNeeded: 0,
  source: 'standing',
});

/** What every task looks like at Tue 18:00, after the night away. */
const afterAway = (id: EmployeeId, t: SimTask): SimTask => {
  const e = emp(id);
  const lastBlock = e.away[e.away.length - 1];
  const h = 18 + lastBlock.at;
  const hh = Math.floor(h) % 24;
  return {
    ...t,
    lastActivity: `Tue ${String(hh).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`,
    nextRun: e.ret.next,
    status: e.ret.decisions > 0 ? 'review' : 'delivered',
    artifacts: [e.ret.artifact.title],
    approvalNeeded: e.ret.decisions,
  };
};

export const initialWorkforce = (): WfState => ({
  view: 'team',
  selected: 'ops',
  sheet: 0,
  intro: 'pending',
  beat: 0,
  returned: false,
  tasks: byId(standing),
  config: byId((id) => ({ trigger: 0, tools: emp(id).assignment.tools.map((t) => t.on), approvals: emp(id).assignment.approvals.map((a) => a.on) })),
  decisions: {},
  gen: 0,
});

const toggle = (xs: boolean[], i: number) => xs.map((v, j) => (j === i ? !v : v));
const back = (s: WfState): WfState => ({
  ...s,
  view: 'workspace',
  beat: AWAY_BEATS.length - 1,
  returned: true,
  tasks: byId((id) => afterAway(id, s.tasks[id])),
  gen: s.gen + 1,
});

export function workforceReducer(s: WfState, a: WfAction): WfState {
  switch (a.type) {
    case 'intro-done':
      return { ...s, intro: 'done' };
    case 'open':
      // choosing a specialist opens their assignment sheet; the team entrance never replays
      return { ...s, view: 'assignment', selected: a.id, sheet: 0, intro: 'done', gen: s.gen + 1 };
    case 'sheet':
      return { ...s, sheet: a.step };
    case 'trigger':
      return { ...s, config: { ...s.config, [s.selected]: { ...s.config[s.selected], trigger: a.index } } };
    case 'tool':
      return { ...s, config: { ...s.config, [s.selected]: { ...s.config[s.selected], tools: toggle(s.config[s.selected].tools, a.index) } } };
    case 'approval':
      return { ...s, config: { ...s.config, [s.selected]: { ...s.config[s.selected], approvals: toggle(s.config[s.selected].approvals, a.index) } } };
    case 'preview': {
      const e = emp(s.selected);
      const task: SimTask = { ...s.tasks[s.selected], source: 'you', assignedAt: REFERENCE.assigned, nextRun: e.assignment.triggers[s.config[s.selected].trigger], status: 'scheduled' };
      return { ...s, view: 'away', beat: 0, tasks: { ...s.tasks, [s.selected]: task }, decisions: { ...s.decisions, [s.selected]: undefined }, gen: s.gen + 1 };
    }
    case 'tick':
      if (a.gen !== s.gen || s.view !== 'away') return s;
      if (s.beat < AWAY_BEATS.length - 1) return { ...s, beat: s.beat + 1, gen: s.gen + 1 };
      return back(s);
    case 'skip':
      return s.view === 'away' ? back(s) : s;
    case 'settle':
      return s.view === 'away' ? { ...s, beat: AWAY_BEATS.length - 1, gen: s.gen + 1 } : s;
    case 'inspect':
      // after the night away, any employee's results can be opened directly from the team or the roster
      return s.returned ? { ...s, view: 'workspace', selected: a.id, intro: 'done', gen: s.gen + 1 } : { ...s, view: 'assignment', selected: a.id, sheet: 0, intro: 'done', gen: s.gen + 1 };
    case 'team':
      return { ...s, view: 'team', intro: 'done', gen: s.gen + 1 };
    case 'decide': {
      const t = s.tasks[a.id];
      // a preview decision only marks the local demo state; nothing is merged, sent, bought or posted
      return {
        ...s,
        decisions: { ...s.decisions, [a.id]: a.value },
        tasks: { ...s.tasks, [a.id]: { ...t, approvalNeeded: 0, status: a.value === 'approved' ? 'delivered' : 'review' } },
      };
    }
  }
}

/** Blocks on a lane that have happened by the current beat. */
export const visibleUntil = (beat: number) => AWAY_BEATS[Math.min(beat, AWAY_BEATS.length - 1)].hour;
