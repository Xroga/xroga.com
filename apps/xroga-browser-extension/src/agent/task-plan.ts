// The run's visible plan: a few milestones with a REAL state. The model proposes and revises them; it can never mark one verified by saying so.
// "Verified" means a page condition the milestone declared (a text that must be on the page, or a URL part) was observed true when the model reported it done.
// Without a declared condition a finished milestone shows as "reported" (the model says it is done, nothing independent confirms it). The loop moves a
// working milestone to "recovering" when a tool fails and back to "working" when the next one succeeds, so progress follows observed results.

export type MilestoneStatus = 'pending' | 'working' | 'verified' | 'reported' | 'recovering' | 'waiting' | 'blocked';
export interface Check { text?: string; url?: string }
export interface Milestone { id: string; title: string; status: MilestoneStatus; check?: Check; note?: string }
export interface PlanSnapshot { revision: number; milestones: Milestone[] }

export const MAX_MILESTONES = 12;
const ID = /^[a-z0-9][a-z0-9_-]{0,23}$/;
const SETTABLE = new Set(['pending', 'working', 'done', 'blocked', 'waiting']);

export interface MilestoneInput { id?: unknown; title?: unknown; check?: unknown }

function cleanCheck(raw: unknown): Check | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const check: Check = {};
  if (typeof r.text === 'string' && r.text.trim()) check.text = r.text.trim().slice(0, 200);
  if (typeof r.url === 'string' && r.url.trim()) check.url = r.url.trim().slice(0, 200);
  return check.text || check.url ? check : undefined;
}

export class TaskPlan {
  #revision = 0;
  #milestones: Milestone[] = [];

  static restore(snapshot: PlanSnapshot | undefined): TaskPlan {
    const p = new TaskPlan();
    if (snapshot && Array.isArray(snapshot.milestones)) {
      p.#revision = Number.isSafeInteger(snapshot.revision) ? snapshot.revision : 0;
      p.#milestones = snapshot.milestones.filter(m => m && ID.test(m.id) && typeof m.title === 'string').slice(0, MAX_MILESTONES).map(m => ({ ...m }));
    }
    return p;
  }

  get active(): boolean { return this.#milestones.length > 0; }
  snapshot(): PlanSnapshot { return { revision: this.#revision, milestones: this.#milestones.map(m => ({ ...m })) }; }

  /** Sets or revises the whole plan. A milestone that keeps its id keeps a verified state; everything else starts pending. */
  set(inputs: MilestoneInput[]): string | null {
    if (!Array.isArray(inputs) || inputs.length === 0) return 'milestones is a non-empty list';
    if (inputs.length > MAX_MILESTONES) return `at most ${MAX_MILESTONES} milestones: group the steps into deliverables`;
    const seen = new Set<string>();
    const next: Milestone[] = [];
    for (const m of inputs) {
      const id = typeof m.id === 'string' ? m.id : '';
      const title = typeof m.title === 'string' ? m.title.trim().slice(0, 120) : '';
      if (!ID.test(id)) return `milestone id "${id}" must be lower case letters, digits, - or _ (at most 24)`;
      if (!title) return `milestone ${id} needs a title that names a deliverable`;
      if (seen.has(id)) return `milestone id ${id} is used twice`;
      seen.add(id);
      const old = this.#milestones.find(o => o.id === id);
      next.push({ id, title, status: old && old.status === 'verified' ? 'verified' : 'pending', ...(cleanCheck(m.check) ? { check: cleanCheck(m.check) } : {}) });
    }
    this.#milestones = next;
    if (!next.some(m => m.status === 'working')) { const first = next.find(m => m.status === 'pending'); if (first) first.status = 'working'; }
    this.#revision++;
    return null;
  }

  get(id: string): Milestone | undefined { return this.#milestones.find(m => m.id === id); }

  /** The model's requested change. `done` is not stored here: the loop decides verified or reported and calls finish(). */
  validateUpdate(id: unknown, status: unknown): string | null {
    if (typeof id !== 'string' || !this.get(id)) return `no milestone has the id ${String(id)}`;
    if (typeof status !== 'string' || !SETTABLE.has(status)) return 'status is one of pending, working, done, blocked, waiting';
    return null;
  }

  apply(id: string, status: Exclude<MilestoneStatus, 'recovering'>, note?: string): void {
    const m = this.get(id)!;
    m.status = status;
    if (note) m.note = note.slice(0, 200);
    this.#revision++;
    // Finishing a milestone starts the next pending one, so the list always shows what is being worked on.
    if ((status === 'verified' || status === 'reported') && !this.#milestones.some(x => x.status === 'working' || x.status === 'recovering')) {
      const next = this.#milestones.find(x => x.status === 'pending');
      if (next) next.status = 'working';
    }
  }

  /** A tool failed: the milestone being worked is recovering. Returns true when the snapshot changed. */
  markFailure(): boolean {
    const m = this.#milestones.find(x => x.status === 'working');
    if (!m) return false;
    m.status = 'recovering';
    this.#revision++;
    return true;
  }

  /** A tool succeeded: a recovering milestone is working again. */
  markSuccess(): boolean {
    const m = this.#milestones.find(x => x.status === 'recovering');
    if (!m) return false;
    m.status = 'working';
    this.#revision++;
    return true;
  }

  /** The user's step (an approval or a hand-over) is pending, or ended. */
  markWaiting(waiting: boolean): boolean {
    const m = waiting ? this.#milestones.find(x => x.status === 'working' || x.status === 'recovering') : this.#milestones.find(x => x.status === 'waiting');
    if (!m) return false;
    m.status = waiting ? 'waiting' : 'working';
    this.#revision++;
    return true;
  }

  render(): string {
    const mark: Record<MilestoneStatus, string> = { pending: '[ ]', working: '[~]', verified: '[x]', reported: '[?]', recovering: '[!]', waiting: '[…]', blocked: '[#]' };
    return this.#milestones.map(m => `${mark[m.status]} ${m.id}: ${m.title} (${m.status}${m.check ? ', verifiable' : ''}${m.note ? `; ${m.note}` : ''})`).join('\n');
  }
}

export const PLAN_TOOL = {
  name: 'plan',
  source: 'agent' as const,
  group: 'acting' as const,
  description:
    'Show the user a short plan for a substantial task (about four or more dependent steps, several applications, or a professional deliverable). Do NOT use it for a simple question or a few clicks. ' +
    'action "set": milestones is a list of {id, title, check?}: a title names a deliverable (not a click), check {text} or {url} is something observable on the page when the milestone is truly done. Call set again to revise the plan when you find a better method. ' +
    'action "update": id and status working, done, blocked or waiting, plus an optional note. A milestone is shown as verified only when its check is seen on the page; without a check it shows as "reported". It never limits what you may do.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['set', 'update'] },
      milestones: {
        type: 'array', maxItems: MAX_MILESTONES,
        items: { type: 'object', properties: { id: { type: 'string', maxLength: 24 }, title: { type: 'string', maxLength: 120 }, check: { type: 'object', properties: { text: { type: 'string', maxLength: 200 }, url: { type: 'string', maxLength: 200 } } } }, required: ['id', 'title'] },
      },
      id: { type: 'string', maxLength: 24 },
      status: { type: 'string', enum: ['pending', 'working', 'done', 'blocked', 'waiting'] },
      note: { type: 'string', maxLength: 200 },
    },
    required: ['action'],
    additionalProperties: false,
  },
};
