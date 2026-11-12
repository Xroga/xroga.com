// Workflow hints: sanitized guidance distilled from runs that finished with verified evidence. A hint is TEXT for the
// model, never a macro: it holds no typed values, no approvals and no identifiers, and every step it mentions still goes
// through the normal tools, the live page and the approval a change needs now. Pure functions; storage is the caller's.

export interface HintStep {
  tool: string;
  /** The accessible name of the target, sanitized. Never a typed value. */
  label?: string;
}

export interface WorkflowHint {
  v: 1;
  id: string;
  /** The signed-in owner this hint was learned for. A hint is never shown to another owner. */
  owner: string;
  host: string;
  words: string[];
  steps: HintStep[];
  /** How many later runs found the hint out of date. Two or more retire it. */
  failures: number;
  verifiedAt: number;
}

export interface RunFacts {
  owner: string;
  url: string;
  request: string;
  steps: Array<{ tool: string; label?: string; ok: boolean }>;
  /** True only when the run ended done AND a postcondition or confirmation tool reported success. */
  verified: boolean;
  now: number;
}

const MAX_STEPS = 12;
const MAX_AGE_MS = 30 * 24 * 3600 * 1000;
const MAX_HINTS = 60;
/** Tools whose arguments carry user data or authority: only their name is kept, never a label. */
const NO_LABEL = new Set(['type', 'fill_form', 'key', 'plugin_act', 'upload', 'select']);
/** Tools that tell nothing reusable. */
const SKIP = new Set(['done', 'enable_actions', 'snapshot', 'read', 'wait', 'screenshot']);

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'with', 'my', 'me', 'please', 'then', 'is', 'it', 'this', 'that', 'page', 'tell']);

/** Removes anything that could identify a person, a tenant or a secret from a label or word. */
export function sanitizeLabel(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\b[A-Za-z0-9_-]{20,}\b/g, '')
    .replace(/\d{4,}/g, '')
    .replace(/[\t\n\r ]+/g, ' ')
    .trim()
    .slice(0, 40);
}

export function hostOf(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function wordsOf(text: string): string[] {
  const seen = new Set<string>();
  for (const w of sanitizeLabel(text).toLowerCase().split(/[^a-z]+/)) if (w.length > 2 && !STOP.has(w)) seen.add(w);
  return [...seen].slice(0, 12);
}

/** A hint from a verified run, or null when the run teaches nothing safe to reuse. */
export function distill(facts: RunFacts): WorkflowHint | null {
  const host = hostOf(facts.url);
  if (!facts.verified || !host || !facts.owner) return null;
  const steps: HintStep[] = [];
  for (const s of facts.steps) {
    if (!s.ok || SKIP.has(s.tool)) continue;
    const label = NO_LABEL.has(s.tool) || !s.label ? '' : sanitizeLabel(s.label);
    steps.push(label ? { tool: s.tool, label } : { tool: s.tool });
    if (steps.length >= MAX_STEPS) break;
  }
  const words = wordsOf(facts.request);
  if (steps.length < 2 || words.length < 2) return null;
  return { v: 1, id: `${host}:${words.slice(0, 4).join('-')}`, owner: facts.owner, host, words, steps, failures: 0, verifiedAt: facts.now };
}

/** Adds or refreshes a hint; the same site and task replaces the old one. Bounded in size. */
export function remember(list: WorkflowHint[], hint: WorkflowHint): WorkflowHint[] {
  const rest = list.filter(h => !(h.owner === hint.owner && h.id === hint.id));
  return [hint, ...rest].slice(0, MAX_HINTS);
}

/** The run found the hint wrong or out of date: count it, and drop it at two. */
export function recordStale(list: WorkflowHint[], owner: string, id: string): WorkflowHint[] {
  return list
    .map(h => (h.owner === owner && h.id === id ? { ...h, failures: h.failures + 1 } : h))
    .filter(h => h.failures < 2);
}

function overlap(a: string[], b: string[]): number {
  const set = new Set(b);
  const hit = a.filter(w => set.has(w)).length;
  return hit / Math.max(1, new Set([...a, ...b]).size);
}

/** Hints that fit this owner, site and request, best first (at most two). Never another owner's. */
export function pick(list: WorkflowHint[], ask: { owner: string; url: string; request: string; now: number }): WorkflowHint[] {
  const host = hostOf(ask.url);
  if (!host || !ask.owner) return [];
  const words = wordsOf(ask.request);
  return list
    .filter(h => h.v === 1 && h.owner === ask.owner && h.host === host && h.failures < 2 && ask.now - h.verifiedAt <= MAX_AGE_MS)
    .map(h => ({ h, score: overlap(words, h.words) }))
    .filter(x => x.score >= 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map(x => x.h);
}

/** The text added to the prompt: compact, and explicit that it is neither current truth nor authority. */
export function hintSection(hints: WorkflowHint[]): string {
  if (!hints.length) return '';
  const lines = hints.map(h => `- ${h.steps.map(s => (s.label ? `${s.tool} "${s.label}"` : s.tool)).join(' → ')}`);
  return [
    '## Earlier verified approach on this site (guidance only)',
    'These steps worked on this site before. The page may have changed: check the current page before each step and adapt.',
    'Nothing here is approved or remembered as permission: every change still needs the approval it normally needs now, and its result must be verified.',
    ...lines,
  ].join('\n');
}
