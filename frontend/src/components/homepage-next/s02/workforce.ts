/**
 * AI Employees preview state (V12): one persistent conversation per employee, a pure reducer.
 *
 * Every thread walks its employee's script (team.ts): a user beat waits for the visitor to send it (or pick its
 * suggestion), then the employee's replies, work beats and time skips are queued and released one by one by a
 * timer in the section (paused offscreen). After the report, follow-ups can be asked in any order.
 *
 * Threads, drafts and decisions persist while the visitor switches employees or modes. Nothing here calls a
 * model, a server or any outside service: unscripted messages get an honest "sample conversation" reply.
 */
import { EMPLOYEES, FIRST_EMPLOYEE, employeeOf, type Beat, type Card, type EmployeeId, type ThreadState, type UserBeat } from './team';

export interface Msg {
  id: number;
  from: 'user' | 'emp' | 'skip';
  text: string;
  at: string;
  card?: Card;
}

export interface Thread {
  msgs: Msg[];
  /** Index of the next script beat that has not been released. */
  pos: number;
  /** Beats released by the timer, in order. */
  queue: Beat[];
  /** The employee's computer stage. */
  ws: number;
  /** One live "working on" line while work is happening. */
  status: string | null;
  state: ThreadState;
  used: string[];
  draft: string;
  decisions: Record<string, 'approved' | 'held'>;
  gen: number;
}

export interface WfState {
  view: 'intro' | 'chat';
  selected: EmployeeId;
  /** Until the visitor touches the AI Employees mode, the first assignment plays itself once. */
  auto: boolean;
  /** Phones show one panel at a time. */
  pane: 'chat' | 'computer';
  threads: Record<EmployeeId, Thread>;
}

export type WfAction =
  | { type: 'intro-done' }
  | { type: 'select'; id: EmployeeId }
  | { type: 'draft'; id: EmployeeId; text: string; manual?: boolean }
  | { type: 'send'; id: EmployeeId; text?: string; manual?: boolean }
  | { type: 'tick'; id: EmployeeId; gen: number }
  | { type: 'decide'; id: EmployeeId; key: string; value: 'approved' | 'held' }
  | { type: 'pane'; pane: 'chat' | 'computer' }
  | { type: 'stop-auto' };

const thread = (): Thread => ({ msgs: [], pos: 0, queue: [], ws: 0, status: null, state: 'ready', used: [], draft: '', decisions: {}, gen: 0 });

export const initialWorkforce = (): WfState => ({
  view: 'intro',
  selected: FIRST_EMPLOYEE,
  auto: true,
  pane: 'chat',
  threads: Object.fromEntries(EMPLOYEES.map((x) => [x.id, thread()])) as Record<EmployeeId, Thread>,
});

export const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** The user beat the thread is waiting on, if any. */
export function gateOf(id: EmployeeId, t: Thread) {
  const b = employeeOf(id).script[t.pos];
  return t.queue.length === 0 && b?.t === 'user' ? b : null;
}
/** Follow-ups that can still be asked (only once the scripted story has finished). */
export function followupsOf(id: EmployeeId, t: Thread) {
  const e = employeeOf(id);
  if (t.queue.length > 0 || t.pos < e.script.length) return [];
  return e.followups.filter((f) => !t.used.includes(f.id));
}
export const busy = (t: Thread) => t.queue.length > 0;
export const clockOf = (t: Thread, id: EmployeeId) => t.msgs.at(-1)?.at ?? (employeeOf(id).script[0] as UserBeat).at;

/** Releases script beats from `from` up to (not including) the next user beat. */
function release(id: EmployeeId, from: number): { queue: Beat[]; pos: number } {
  const script = employeeOf(id).script;
  const queue: Beat[] = [];
  let i = from;
  while (i < script.length && script[i].t !== 'user') queue.push(script[i++]);
  return { queue, pos: i };
}

const upd = (s: WfState, id: EmployeeId, f: (t: Thread) => Thread): WfState => ({ ...s, threads: { ...s.threads, [id]: f(s.threads[id]) } });

export function workforceReducer(s: WfState, a: WfAction): WfState {
  switch (a.type) {
    case 'intro-done':
      return s.view === 'intro' ? { ...s, view: 'chat' } : s;
    case 'select':
      // a deliberate choice: the entrance never replays and the intro autoplay stops
      return { ...s, view: 'chat', selected: a.id, auto: false, pane: 'chat' };
    case 'stop-auto':
      return s.auto ? { ...s, auto: false } : s;
    case 'pane':
      return { ...s, pane: a.pane, auto: false };
    case 'draft':
      return upd({ ...s, auto: a.manual ? false : s.auto }, a.id, (t) => ({ ...t, draft: a.text }));
    case 'send': {
      const t = s.threads[a.id];
      const text = (a.text ?? t.draft).trim();
      const base = { ...s, auto: a.manual ? false : s.auto };
      if (!text || busy(t)) return base;
      const id = a.id;
      const gate = gateOf(id, t);
      const at = gate?.at ?? clockOf(t, id);
      const mk = (from: Msg['from'], body: string, when: string): Msg => ({ id: t.msgs.length, from, text: body, at: when });
      const n = norm(text);
      // the scripted next message (typed exactly, or picked as a suggestion)
      if (gate && (n === norm(gate.text) || n === norm(gate.chip))) {
        const r = release(id, t.pos + 1);
        return upd(base, id, (x) => ({ ...x, msgs: [...x.msgs, mk('user', gate.text, gate.at)], pos: r.pos, queue: r.queue, draft: '', state: 'thinking', gen: x.gen + 1 }));
      }
      // a follow-up after the report
      const f = followupsOf(id, t).find((x) => n === norm(x.text) || n === norm(x.chip) || x.keys.some((k) => n.includes(norm(k))));
      if (f) {
        return upd(base, id, (x) => ({ ...x, msgs: [...x.msgs, mk('user', f.text, f.reply[0].at)], queue: [...f.reply], used: [...x.used, f.id], draft: '', state: 'thinking', gen: x.gen + 1 }));
      }
      // anything else: honest about the limits of a sample conversation
      const hint = gate ? `To continue this example, send: “${gate.chip}”.` : 'Pick one of the suggestions below to continue this example.';
      return upd(base, id, (x) => ({
        ...x,
        msgs: [...x.msgs, mk('user', text, at)],
        queue: [{ t: 'emp', text: `This is a sample conversation, so I can only follow the suggested messages here. ${hint} To give me a real job, start in Xroga.`, at, delay: 700 }],
        draft: '',
        gen: x.gen + 1,
      }));
    }
    case 'tick': {
      const t = s.threads[a.id];
      if (a.gen !== t.gen || t.queue.length === 0) return s;
      const [b, ...rest] = t.queue;
      return upd(s, a.id, (x) => {
        const msgs = x.msgs;
        const id = msgs.length;
        if (b.t === 'work') return { ...x, queue: rest, ws: b.ws, status: b.status, state: 'working', gen: x.gen + 1 };
        if (b.t === 'user') return { ...x, queue: rest };
        if (b.t === 'skip') return { ...x, queue: rest, msgs: [...msgs, { id, from: 'skip', text: b.label, at: b.at }], status: null, gen: x.gen + 1 };
        return {
          ...x,
          queue: rest,
          msgs: [...msgs, { id, from: 'emp', text: b.text, at: b.at, card: b.card }],
          ws: b.ws ?? x.ws,
          status: b.state && b.state !== 'working' ? null : x.status,
          state: b.state ?? x.state,
          gen: x.gen + 1,
        };
      });
    }
    case 'decide':
      // a preview decision only marks this page's local state; nothing is published, merged or deleted
      return upd(s, a.id, (t) => ({ ...t, decisions: { ...t.decisions, [a.key]: a.value }, state: t.state === 'decision' ? 'report' : t.state }));
  }
}

/** How long the next queued beat waits before it lands. */
export function delayOf(b: Beat): number {
  if (b.t !== 'user' && b.delay) return b.delay;
  if (b.t === 'emp') return 900 + Math.min(1100, b.text.length * 7);
  return 1500;
}
