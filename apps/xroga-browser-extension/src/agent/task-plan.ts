// The run's visible plan: a few milestones with a REAL state. The model proposes and revises them; it can never mark one verified by saying so.
// "Verified" means a page condition the milestone declared (a text that must be on the page, or a URL part) was observed true when the model reported it done.
// Without a declared condition a finished milestone shows as "reported" (the model says it is done, nothing independent confirms it). The loop moves a
// working milestone to "recovering" when a tool fails and back to "working" when the next one succeeds, so progress follows observed results.

export type MilestoneStatus = 'pending' | 'working' | 'verified' | 'reported' | 'recovering' | 'waiting' | 'blocked';
export interface Check { text?: string; url?: string }
/** Where a milestone comes from: the user asked for it, a professional step the user did not list, or something only the user can decide or do (publishing, sending, spending, a code, a fact the agent lacks). */
export type Basis = 'asked' | 'inferred' | 'user';
export interface Milestone { id: string; title: string; status: MilestoneStatus; check?: Check; note?: string; basis?: Basis }
export type LedgerStatus = 'pending' | 'saved' | 'verified' | 'failed' | 'skipped';
/** One item of a batch job (a draft, a row, a record). `savedAt` is the page-load count when it was marked saved: verified needs a later load. */
export interface LedgerItem { key: string; status: LedgerStatus; note?: string; savedAt?: number }
export interface PlanSnapshot { revision: number; milestones: Milestone[]; ledger?: LedgerItem[] }

export const MAX_LEDGER = 300;
const LEDGER_SETTABLE = new Set<string>(['saved', 'verified', 'failed', 'skipped', 'pending']);

export const MAX_MILESTONES = 12;
const ID = /^[a-z0-9][a-z0-9_-]{0,23}$/;
const SETTABLE = new Set(['pending', 'working', 'done', 'blocked', 'waiting']);

export interface MilestoneInput { id?: unknown; title?: unknown; check?: unknown; basis?: unknown }

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
  #ledger: LedgerItem[] = [];

  static restore(snapshot: PlanSnapshot | undefined): TaskPlan {
    const p = new TaskPlan();
    if (snapshot && Array.isArray(snapshot.milestones)) {
      p.#revision = Number.isSafeInteger(snapshot.revision) ? snapshot.revision : 0;
      p.#milestones = snapshot.milestones.filter(m => m && ID.test(m.id) && typeof m.title === 'string').slice(0, MAX_MILESTONES).map(m => ({ ...m }));
    }
    if (snapshot && Array.isArray(snapshot.ledger)) {
      p.#ledger = snapshot.ledger.filter(i => i && typeof i.key === 'string' && LEDGER_SETTABLE.has(i.status)).slice(0, MAX_LEDGER).map(i => ({ ...i }));
    }
    return p;
  }

  get active(): boolean { return this.#milestones.length > 0; }
  get hasLedger(): boolean { return this.#ledger.length > 0; }
  snapshot(): PlanSnapshot {
    return { revision: this.#revision, milestones: this.#milestones.map(m => ({ ...m })), ...(this.#ledger.length ? { ledger: this.#ledger.map(i => ({ ...i })) } : {}) };
  }

  /** Sets the batch job's items (a short, unique name each: a recipient, a record id). An item that keeps its key keeps its state. */
  setItems(keys: unknown): string | null {
    if (!Array.isArray(keys) || keys.length === 0) return 'keys is a non-empty list of short item names';
    if (keys.length > MAX_LEDGER) return `at most ${MAX_LEDGER} items`;
    const seen = new Set<string>();
    const next: LedgerItem[] = [];
    for (const k of keys) {
      const key = typeof k === 'string' ? k.trim().slice(0, 80) : '';
      if (!key) return 'every item name must be a non-empty string';
      if (seen.has(key)) return `item "${key}" is listed twice (a duplicate is exactly what this list prevents)`;
      seen.add(key);
      next.push(this.#ledger.find(i => i.key === key) ?? { key, status: 'pending' });
    }
    this.#ledger = next;
    this.#revision++;
    return null;
  }

  /**
   * Marks items. `saved` records the page-load count; `verified` is refused for an item that has not been saved, or that has not seen a page load since
   * (a draft that is still only on the screen has not been shown to persist). Returns an error text or null.
   */
  markItems(keys: unknown, status: unknown, loads: number, note?: string, dryRun = false): string | null {
    if (!this.#ledger.length) return 'there is no item list yet: call plan with action "items" first';
    if (!Array.isArray(keys) || keys.length === 0) return 'keys is a non-empty list of item names';
    if (typeof status !== 'string' || !LEDGER_SETTABLE.has(status)) return 'status is saved, verified, failed or skipped';
    const items: LedgerItem[] = [];
    const unknown: string[] = [];
    for (const k of keys) {
      const it = this.#ledger.find(i => i.key === (typeof k === 'string' ? k.trim() : ''));
      if (it) items.push(it);
      else unknown.push(String(k));
    }
    if (unknown.length) return `not in the list: ${unknown.slice(0, 5).join(', ')}`;
    if (status === 'verified') {
      const notSaved = items.filter(i => i.status !== 'saved' && i.status !== 'verified');
      if (notSaved.length) return `cannot verify ${notSaved.slice(0, 5).map(i => i.key).join(', ')}: mark an item saved first (it is ${notSaved[0]!.status})`;
      const sameLoad = items.filter(i => i.status === 'saved' && (i.savedAt === undefined || loads <= i.savedAt));
      if (sameLoad.length) return `cannot verify ${sameLoad.slice(0, 5).map(i => i.key).join(', ')} yet: no page has loaded since it was saved. Reload or reopen it, check it is still there, then verify.`;
    }
    if (dryRun) return null;
    for (const it of items) {
      it.status = status as LedgerStatus;
      if (status === 'saved') it.savedAt = loads;
      if (note) it.note = note.slice(0, 120);
      else delete it.note;
    }
    this.#revision++;
    return null;
  }

  /** Items that are not done: pending, saved without a verification, or failed. */
  ledgerOpen(): LedgerItem[] {
    return this.#ledger.filter(i => i.status === 'pending' || i.status === 'saved' || i.status === 'failed');
  }

  ledgerSummary(): string {
    if (!this.#ledger.length) return '';
    const n = (s: LedgerStatus) => this.#ledger.filter(i => i.status === s).length;
    const open = this.ledgerOpen();
    return `list: ${n('verified')} of ${this.#ledger.length} verified` +
      `${n('saved') ? `, ${n('saved')} saved but not yet verified after a reload` : ''}${n('failed') ? `, ${n('failed')} failed` : ''}${n('skipped') ? `, ${n('skipped')} skipped` : ''}${n('pending') ? `, ${n('pending')} not started` : ''}` +
      `${open.length ? `. Not done: ${open.slice(0, 12).map(i => i.key).join(', ')}${open.length > 12 ? ` and ${open.length - 12} more` : ''}` : ''}`;
  }

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
      const basis = m.basis === 'asked' || m.basis === 'inferred' || m.basis === 'user' ? m.basis : undefined;
      next.push({ id, title, status: old && old.status === 'verified' ? 'verified' : 'pending', ...(cleanCheck(m.check) ? { check: cleanCheck(m.check) } : {}), ...(basis ? { basis } : {}) });
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
    // A step only the user can decide or take is never finished by the agent: it waits, and the user is told.
    if (status === 'done' && this.get(id)!.basis === 'user') return `milestone ${id} needs the user (a decision, an approval, a code or a fact only they have), so it cannot be marked done: set it to waiting and say in your answer exactly what you need from them.`;
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
    const lines = this.#milestones.map(m => `${mark[m.status]} ${m.id}: ${m.title} (${m.status}${m.basis === 'inferred' ? ', inferred' : m.basis === 'user' ? ', needs you' : ''}${m.check ? ', verifiable' : ''}${m.note ? `; ${m.note}` : ''})`);
    if (this.#ledger.length) lines.push(this.ledgerSummary());
    return lines.join('\n');
  }
}

export const PLAN_TOOL = {
  name: 'plan',
  source: 'agent' as const,
  group: 'acting' as const,
  description:
    'Show the user a short plan for a substantial task (about four or more dependent steps, several applications, or a professional deliverable). Do NOT use it for a simple question or a few clicks. ' +
    'action "set": milestones is a list of {id, title, check?}: a title names a deliverable (not a click), check {text} or {url} is something observable on the page when the milestone is truly done. Call set again to revise the plan when you find a better method. ' +
    'action "update": id and status working, done, blocked or waiting, plus an optional note. A milestone is shown as verified only when its check is seen on the page; without a check it shows as "reported". It never limits what you may do. ' +
    'For a batch of many items (drafts, rows, records): action "items" with keys (a short unique name each, no duplicates) keeps the list and survives an interruption; action "mark" with keys and status saved, failed or skipped. ' +
    '"verified" is accepted only for an item already marked saved, after a page load since (reload or reopen it), with check {text} visible on the page. Report only verified items as done.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['set', 'update', 'items', 'mark'] },
      keys: { type: 'array', maxItems: MAX_LEDGER, items: { type: 'string', maxLength: 80 } },
      check: { type: 'object', properties: { text: { type: 'string', maxLength: 200 } } },
      milestones: {
        type: 'array', maxItems: MAX_MILESTONES,
        items: { type: 'object', properties: { id: { type: 'string', maxLength: 24 }, title: { type: 'string', maxLength: 120 }, basis: { type: 'string', enum: ['asked', 'inferred', 'user'] }, check: { type: 'object', properties: { text: { type: 'string', maxLength: 200 }, url: { type: 'string', maxLength: 200 } } } }, required: ['id', 'title'] },
      },
      id: { type: 'string', maxLength: 24 },
      status: { type: 'string', enum: ['pending', 'working', 'done', 'blocked', 'waiting', 'saved', 'verified', 'failed', 'skipped'] },
      note: { type: 'string', maxLength: 200 },
    },
    required: ['action'],
    additionalProperties: false,
  },
};
