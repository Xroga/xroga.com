// `macro`: a flow the agent proved works (a batch whose result it verified) is saved under a name for this site and run again later with new values, for the cost of one
// call instead of the many it took to find the way (openbrowser's browser_macro, MIT, and the saved flows of agent-browser, Apache-2.0; written here). A routine holds
// steps with ${name} placeholders and never a secret: a step that types into a password, card or one-time-code field is refused at save time. A run goes through the same
// gates, approvals and checks as batch: nothing here grants anything, and the page is checked again by the agent after the run (a changed page can fail a saved flow).
export const MACROS_KEY = 'xroga_macros_v1';
const MAX_MACROS = 200;
const MAX_STEPS = 2_000;

export interface SavedMacro {
  origin: string;
  name: string;
  savedAt: number;
  /** Placeholder names the routine expects, in the order first used. */
  vars: string[];
  steps: unknown[];
  runs?: number;
}

export const MACRO_TOOL = {
  name: 'macro',
  source: 'agent' as const,
  group: 'acting' as const,
  description:
    'Keep a batch that worked as a named routine for this site and run it again later with new values. action save: name and steps (a batch\'s steps, with ${name} placeholders where the values change; never secrets). action run: name and vars ({name: value}). action list shows this site\'s routines; action delete removes one. A run is a batch: the same checks and approvals apply, and you verify the result after it.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['save', 'run', 'list', 'delete'] },
      name: { type: 'string', maxLength: 80 },
      steps: { type: 'array', maxItems: MAX_STEPS, items: { type: 'object' } },
      vars: { type: 'object', description: 'run: the values for the placeholders' },
    },
    required: ['action'],
    additionalProperties: false,
  },
};

const SECRET = /pass(?:word|code|phrase)?\b|\bpwd\b|\botp\b|one[- ]time|verification code|\bcvv\b|\bcvc\b|card number|security code|\bssn\b|\biban\b|\bpin\b/i;
const PLACEHOLDER = /\$\{([A-Za-z][A-Za-z0-9_]{0,40})\}/g;
/** Placeholders that belong to batch's own foreach: they stay as they are. */
const BATCH_OWN = new Set(['item', 'index']);

function walk(value: unknown, visit: (key: string, v: unknown) => void, key = ''): void {
  visit(key, value);
  if (Array.isArray(value)) value.forEach(v => walk(v, visit, key));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(v, visit, k);
}

/** The placeholder names a set of steps uses (except batch's own item and index), in first-use order. */
export function placeholdersOf(steps: unknown[]): string[] {
  const seen: string[] = [];
  walk(steps, (_k, v) => {
    if (typeof v !== 'string') return;
    for (const m of v.matchAll(PLACEHOLDER)) if (!BATCH_OWN.has(m[1]!) && !seen.includes(m[1]!)) seen.push(m[1]!);
  });
  return seen;
}

/** Why a set of steps cannot be kept, or null: nothing to run, too long, or a step that handles a secret. */
export function refusalFor(steps: unknown): string | null {
  if (!Array.isArray(steps) || !steps.length) return 'steps is a non-empty list, as for batch';
  if (steps.length > MAX_STEPS) return `a routine holds at most ${MAX_STEPS} steps`;
  let bad: string | null = null;
  walk(steps, (_k, v) => {
    if (bad || !v || typeof v !== 'object' || Array.isArray(v)) return;
    const o = v as Record<string, unknown>;
    const target = o.target as Record<string, unknown> | undefined;
    const label = `${typeof target?.name === 'string' ? target.name : ''} ${typeof target?.role === 'string' ? target.role : ''} ${typeof o.label === 'string' ? o.label : ''}`;
    if (SECRET.test(label) && ('value' in o || 'text' in o)) bad = `a step enters a value into a field called "${label.trim().slice(0, 40)}": secrets and codes are never kept in a routine; ask the person to enter them when the routine reaches that step`;
  });
  return bad;
}

/** The steps with each ${name} replaced by its value (JSON-safe); a name without a value is an error, so nothing runs half-filled. */
export function expandVars(steps: unknown[], vars: Record<string, unknown>): { ok: true; steps: unknown[] } | { ok: false; missing: string[] } {
  const missing = placeholdersOf(steps).filter(n => !(n in vars));
  if (missing.length) return { ok: false, missing };
  const json = JSON.stringify(steps).replace(PLACEHOLDER, (whole, name: string) => {
    if (BATCH_OWN.has(name)) return whole;
    return JSON.stringify(String(vars[name] ?? '')).slice(1, -1);
  });
  return { ok: true, steps: JSON.parse(json) as unknown[] };
}

async function load(): Promise<SavedMacro[]> {
  try {
    const v = (await chrome.storage.local.get(MACROS_KEY))[MACROS_KEY];
    return Array.isArray(v) ? (v as SavedMacro[]) : [];
  } catch {
    return [];
  }
}

export async function macrosFor(origin: string): Promise<SavedMacro[]> {
  return (await load()).filter(m => m.origin === origin);
}

export async function saveMacro(m: SavedMacro): Promise<void> {
  try {
    const list = (await load()).filter(x => !(x.origin === m.origin && x.name.toLowerCase() === m.name.toLowerCase()));
    list.unshift(m);
    await chrome.storage.local.set({ [MACROS_KEY]: list.slice(0, MAX_MACROS) });
  } catch {
    /* a routine that cannot be kept is still usable in this run through batch */
  }
}

export async function deleteMacro(origin: string, name: string): Promise<boolean> {
  const list = await load();
  const next = list.filter(x => !(x.origin === origin && x.name.toLowerCase() === name.toLowerCase()));
  if (next.length === list.length) return false;
  await chrome.storage.local.set({ [MACROS_KEY]: next });
  return true;
}

export async function countRun(origin: string, name: string): Promise<void> {
  const list = await load();
  const m = list.find(x => x.origin === origin && x.name.toLowerCase() === name.toLowerCase());
  if (!m) return;
  m.runs = (m.runs ?? 0) + 1;
  await chrome.storage.local.set({ [MACROS_KEY]: list }).catch(() => undefined);
}

export function describeMacro(m: SavedMacro): string {
  return `- "${m.name}" (${m.steps.length} steps${m.vars.length ? `; values: ${m.vars.join(', ')}` : ''}${m.runs ? `; run ${m.runs} time${m.runs === 1 ? '' : 's'}` : ''})`;
}
