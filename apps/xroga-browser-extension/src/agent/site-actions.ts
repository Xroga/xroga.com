// VerifiedSiteAction: a reviewed, versioned, origin-scoped operation for a known site, executed as DECLARATIVE steps through the run's own tools.
// Contract adapted from browsing-skills (https://github.com/browsing-skills/browsing-skills, MIT): per-action requirements, a read versus write class, an input
// schema, an output shape, and "never proceed past the user's explicit request". Deliberately NOT adopted: its action handlers are JavaScript that is eval'd
// inside the page. Here a step is data ({tool, args}); there is no page.evaluate and no downloaded code ever runs in a signed-in tab.
// Identity: the definition is hashed; a changed definition has a different hash and is a different action. A model can never grant approval: a consequential
// action is not executable through this path at all (the normal guarded tools show the approval card).
import { identify, matchSite, type SiteRule, validateRule } from './site-context';

export type ActionClass = 'read' | 'write_low' | 'write_consequential';

export interface InputProp { type: 'string' | 'number' | 'boolean'; enum?: Array<string | number>; maxLength?: number; minimum?: number; maximum?: number; description?: string }
export interface InputSchema { required?: string[]; properties: Record<string, InputProp> }

/** Allowed step tools: the page tools of the layer. Nothing that evaluates code, nothing that leaves the origin. */
export const STEP_TOOLS = new Set(['click', 'fill_form', 'type', 'press', 'wait', 'read', 'scroll', 'set']);

export interface ActionStep { tool: string; args: Record<string, unknown> }

export interface VerifiedSiteAction {
  id: string;
  version: string;
  name: string;
  description: string;
  rule: SiteRule;
  actionClass: ActionClass;
  inputSchema: InputSchema;
  /** Text that must be on the page before the steps run: if the application changed, the action refuses instead of clicking blind. */
  versionFingerprint: string;
  steps: ActionStep[];
  /** Text that must be on the page afterwards. Templated. If it is not there the result is "unverified", never "done". */
  postcondition: string;
  /** Input fields that together identify one logical write; the same key is never executed twice in a run. */
  idempotencyKey?: string[];
  source: { origin: string; repo?: string; commit?: string; licence?: string; reviewedBy: string; reviewedAt: string };
}

export type ActionStatus = 'done' | 'unverified' | 'refused' | 'version_mismatch' | 'duplicate' | 'needs_approval' | 'step_failed' | 'invalid_input';

export interface ActionReceipt { step: number; tool: string; ok: boolean; note: string }
export interface ActionResult { status: ActionStatus; message: string; receipts: ActionReceipt[]; output?: string; hash: string }

export type StepCall = (tool: string, input: Record<string, unknown>) => Promise<{ ok: boolean; text: string }>;

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v as object).sort().map(k => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

export async function actionHash(a: VerifiedSiteAction): Promise<string> {
  const bytes = new TextEncoder().encode(canonical(a));
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function validateAction(a: VerifiedSiteAction): string | null {
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(a.id)) return 'id is lower case words';
  const rule = validateRule(a.rule);
  if (rule) return `rule: ${rule}`;
  if (!a.steps.length) return 'an action needs steps';
  for (const s of a.steps) if (!STEP_TOOLS.has(s.tool)) return `step tool ${s.tool} is not allowed (no code evaluation, no navigation away)`;
  if (a.actionClass !== 'read' && !a.postcondition) return 'a write action needs a postcondition';
  if (!a.versionFingerprint) return 'a version fingerprint is required';
  if (!a.source.reviewedBy || !a.source.reviewedAt) return 'a reviewer and review date are required';
  return null;
}

export function validateInput(schema: InputSchema, input: Record<string, unknown>): string | null {
  for (const r of schema.required ?? []) if (input[r] === undefined || input[r] === '') return `${r} is required`;
  for (const k of Object.keys(input)) {
    const p = schema.properties[k];
    if (!p) return `${k} is not an input of this action`;
    const v = input[k];
    if (typeof v !== p.type) return `${k} must be a ${p.type}`;
    if (p.enum && !p.enum.includes(v as string | number)) return `${k} must be one of ${p.enum.join(', ')}`;
    if (typeof v === 'string' && v.length > (p.maxLength ?? 200)) return `${k} is too long`;
    if (typeof v === 'number' && ((p.minimum !== undefined && v < p.minimum) || (p.maximum !== undefined && v > p.maximum))) return `${k} is out of range`;
  }
  return null;
}

/** Fills {{input.name}} in every string of a template. Only declared inputs exist; nothing else is reachable. */
export function fillTemplate<T>(template: T, input: Record<string, unknown>): T {
  if (typeof template === 'string') return template.replace(/\{\{input\.([A-Za-z0-9_]+)\}\}/g, (_m, k: string) => String(input[k] ?? '')) as T;
  if (Array.isArray(template)) return template.map(t => fillTemplate(t, input)) as T;
  if (template && typeof template === 'object') return Object.fromEntries(Object.entries(template).map(([k, v]) => [k, fillTemplate(v, input)])) as T;
  return template;
}

export class ActionLedger {
  readonly #done = new Set<string>();
  has(key: string): boolean { return this.#done.has(key); }
  add(key: string): void { this.#done.add(key); }
}

export interface RunDeps { call: StepCall; url: string; ledger: ActionLedger }

export async function runSiteAction(action: VerifiedSiteAction, expectedHash: string, rawInput: Record<string, unknown>, deps: RunDeps): Promise<ActionResult> {
  const hash = await actionHash(action);
  const fail = (status: ActionStatus, message: string, receipts: ActionReceipt[] = []): ActionResult => ({ status, message, receipts, hash });
  if (hash !== expectedHash) return fail('refused', 'the action definition does not match its registered hash: it has been changed since review, so it is not run');
  const bad = validateAction(action);
  if (bad) return fail('refused', `the action is not valid: ${bad}`);
  const id = identify(deps.url);
  const site = id ? matchSite(action.rule, id) : { matched: false, reason: 'the page is not a web page' };
  if (!id || !site.matched) return fail('refused', `this action is for ${action.rule.host}${action.rule.pathPrefix ?? ''}, not for this page (${site.reason})`);
  const invalid = validateInput(action.inputSchema, rawInput);
  if (invalid) return fail('invalid_input', invalid);
  if (action.actionClass === 'write_consequential') {
    return fail('needs_approval', 'this is a consequential action (it spends, sends, publishes or deletes). It is not run from here: use the normal page tools so the user sees and approves the exact step.');
  }
  const input = rawInput;
  const key = action.idempotencyKey?.length ? `${action.id}:${action.idempotencyKey.map(k => String(input[k] ?? '')).join('|')}` : null;
  if (key && deps.ledger.has(key)) return fail('duplicate', 'this exact write was already done in this run; it is not repeated');
  const receipts: ActionReceipt[] = [];
  // The application may have changed since the action was reviewed: look for the reviewed marker before touching anything.
  const seen = await deps.call('wait', { text: fillTemplate(action.versionFingerprint, input), timeoutMs: 1500 });
  if (!seen.ok) return fail('version_mismatch', `the page no longer shows "${action.versionFingerprint}", which this action was reviewed against. Nothing was done. Observe the page again and use the general tools.`);
  let output: string | undefined;
  for (let i = 0; i < action.steps.length; i++) {
    const s = action.steps[i]!;
    const r = await deps.call(s.tool, fillTemplate(s.args, input));
    receipts.push({ step: i + 1, tool: s.tool, ok: r.ok, note: r.text.split('\n')[0]!.slice(0, 120) });
    if (!r.ok) return fail('step_failed', `step ${i + 1} (${s.tool}) failed: ${r.text.split('\n')[0]!.slice(0, 160)}. The steps before it ran; nothing after it did.`, receipts);
    if (s.tool === 'read') output = r.text.slice(0, 4000);
  }
  if (action.postcondition) {
    const post = await deps.call('wait', { text: fillTemplate(action.postcondition, input), timeoutMs: 2000 });
    if (!post.ok) return { status: 'unverified', message: `the steps ran but "${fillTemplate(action.postcondition, input)}" is not on the page, so the result is NOT confirmed. Read the page before claiming success.`, receipts, output, hash };
  }
  if (key) deps.ledger.add(key);
  return { status: 'done', message: `${action.name}: done and verified (${action.postcondition ? `"${fillTemplate(action.postcondition, input)}" is on the page` : 'read only'}).`, receipts, output, hash };
}

export class SiteActionRegistry {
  readonly #actions = new Map<string, { action: VerifiedSiteAction; hash: string }>();
  readonly #pending: Array<Promise<unknown>> = [];
  async register(action: VerifiedSiteAction): Promise<string> {
    const bad = validateAction(action);
    if (bad) throw new Error(`site action ${action.id}: ${bad}`);
    const work = actionHash(action).then(hash => { this.#actions.set(action.id, { action, hash }); return hash; });
    this.#pending.push(work.catch(() => undefined));
    return work;
  }
  /** Resolves when every registration so far has its hash. Lookups after this see every action. */
  async ready(): Promise<void> { await Promise.all(this.#pending); }
  get(id: string) { return this.#actions.get(id); }
  /** Actions whose rule matches this page. */
  forUrl(url: string): VerifiedSiteAction[] {
    const id = identify(url);
    if (!id) return [];
    return [...this.#actions.values()].map(x => x.action).filter(a => matchSite(a.rule, id).matched);
  }
}

export function describeAction(a: VerifiedSiteAction): string {
  const inputs = Object.entries(a.inputSchema.properties).map(([k, p]) => `${k}${a.inputSchema.required?.includes(k) ? '*' : ''}:${p.type}`).join(', ');
  return `- ${a.id} (${a.actionClass}, v${a.version}; inputs ${inputs || 'none'}): ${a.description}`;
}

export const SITE_ACTION_TOOL = {
  name: 'site_action',
  source: 'agent' as const,
  group: 'acting' as const,
  description:
    'Run a reviewed, verified action that exists for THIS site (find_skill lists them): fast, no guessing where to click. input is an object of the action inputs. It checks the page version first, verifies the result, and never repeats a write. ' +
    'If the site has no action for the task, or it refuses, carry on with the general browser tools: nothing is limited to listed actions.',
  parameters: {
    type: 'object',
    properties: { id: { type: 'string', maxLength: 80 }, input: { type: 'object' } },
    required: ['id'],
    additionalProperties: false,
  },
};
