/**
 * S00 performance script (V9 six vignettes, V8 continuity, V7 motion rules). Pure data, no React.
 *
 * One stable stage. Each vignette reconfigures the command, the work object on the left, the six
 * tools on the right and the background as one event, with the orb mediating the change.
 *   Cycle A: production SaaS, browser QA and repair, dental clinic operations   (then a rest)
 *   Cycle B: cross-platform release, AI research product, growth after launch   (then a rest)
 * Tools act only when the work needs them (0 to 3 at once); every tool use lands a visible change.
 */
import type { ProviderId } from './providerMarks';
import { COMMANDS, SECONDARY, type PhraseKey } from './copy';

export type VignetteId = keyof typeof COMMANDS;
export type WorkKind = 'brief' | VignetteId;

/** What a micro-step needs (V12 §12). `native` and the browser are Xroga's own capabilities. */
export type Capability =
  | 'native'
  | 'source-control'
  | 'database'
  | 'auth'
  | 'payments'
  | 'deployment'
  | 'monitoring'
  | 'browser'
  | 'crm'
  | 'calendar'
  | 'email'
  | 'docs'
  | 'research'
  | 'analytics'
  | 'seo'
  | 'growth';

/**
 * A step inside a vignette: when it lands, what it needs and, only if an external tool does the work,
 * which provider. Without `tool` Xroga does the step itself and no provider is touched (V12 §14).
 */
export interface Step {
  at: number;
  fx: string;
  cap: Capability;
  tool?: ProviderId;
}

/**
 * The single action model (V12 §12). One object drives the provider highlight, the signal endpoint,
 * the route and the work-object change, so a light can never land on a provider the step does not use.
 */
export interface HeroAction {
  id: string;
  sceneId: VignetteId;
  capability: Capability;
  providerId: ProviderId | null;
  /** The work-object state this action produces (the step's effect key). */
  resultState: string;
  /** When the result lands on the work object (relative ms). */
  at: number;
}

export interface Vignette {
  id: VignetteId;
  len: number;
  /** Six readable tools for this job, most-used first (phones show 3, tablets 4). */
  set: readonly ProviderId[];
  /** When the request leaves the bar for Xroga (relative ms). */
  intentAt: number;
  /** When the object is formed by Xroga (absorb ends, creation starts). */
  createAt: number;
  verifyAt?: number;
  /** Browser-like vignettes move a cursor: [at, position]. */
  cursor?: readonly [number, string][];
  steps: readonly Step[];
}

/**
 * Signal grammar for one tool use (V10 §17), relative to the route start:
 *   0 to 550 ms     tool call: a packet leaves Xroga for the provider, which sharpens on arrival
 *   550 to 850 ms   the answer returns along the same path to Xroga
 *   850 to 1100 ms  result: a short pulse runs from Xroga to the work object
 *   1250 ms         the work object changes (150 ms after the pulse arrives)
 */
export const SIGNAL = { call: 550, back: 850, arrive: 1100, land: 1250, end: 1400 } as const;
const ROUTE_LEAD = SIGNAL.land;
const ROUTE_MS = SIGNAL.end;

export const VIGNETTES: readonly Vignette[] = [
  {
    id: 'saas',
    len: 9400,
    set: ['supabase', 'stripe', 'github', 'vercel', 'sentry', 'figma'],
    intentAt: 1500,
    createAt: 2200,
    verifyAt: 6900,
    cursor: [
      [6200, 'test'],
      [6700, 'press'],
      [7100, 'away'],
    ],
    steps: [
      { at: 2600, fx: 'shell', cap: 'native' },
      { at: 3600, fx: 'auth', cap: 'auth', tool: 'supabase' },
      { at: 4400, fx: 'billing', cap: 'payments', tool: 'stripe' },
      { at: 5000, fx: 'roles', cap: 'native' },
      { at: 5500, fx: 'analytics', cap: 'native' },
      { at: 6200, fx: 'repo', cap: 'source-control', tool: 'github' },
      { at: 6900, fx: 'tested', cap: 'browser' },
      { at: 7900, fx: 'monitored', cap: 'monitoring', tool: 'sentry' },
      { at: 9000, fx: 'live', cap: 'deployment', tool: 'vercel' },
    ],
  },
  {
    id: 'qa',
    len: 10600,
    set: ['sentry', 'github', 'stripe', 'vercel', 'supabase', 'posthog'],
    intentAt: 300,
    createAt: 1000,
    verifyAt: 9000,
    cursor: [
      [1400, 'email'],
      [2500, 'pay'],
      [3200, 'hover'],
      [3450, 'press'],
      [3700, 'rest'],
      [6300, 'pay'],
      [6650, 'hover'],
      [6900, 'press'],
      [7150, 'rest'],
      [7600, 'away'],
    ],
    steps: [
      { at: 1600, fx: 'start', cap: 'browser' },
      { at: 2200, fx: 'emailOk', cap: 'browser' },
      { at: 3600, fx: 'failed', cap: 'browser' },
      // tools are called only after the cause exists: diagnosis after the failure, payment after the re-press
      { at: 4900, fx: 'isolated', cap: 'monitoring', tool: 'sentry' },
      { at: 5500, fx: 'repaired', cap: 'native' },
      { at: 6300, fx: 'committed', cap: 'source-control', tool: 'github' },
      { at: 8200, fx: 'paid', cap: 'payments', tool: 'stripe' },
      { at: 8600, fx: 'onboarding', cap: 'browser' },
      { at: 9000, fx: 'verified', cap: 'browser' },
      { at: 10300, fx: 'released', cap: 'deployment', tool: 'vercel' },
    ],
  },
  {
    id: 'clinic',
    len: 10000,
    set: ['gmail', 'googlecalendar', 'hubspot', 'notion', 'airtable', 'intercom'],
    intentAt: 300,
    createAt: 1000,
    steps: [
      { at: 1500, fx: 'assigned', cap: 'native' },
      { at: 2600, fx: 'inquiry', cap: 'email', tool: 'gmail' },
      { at: 3200, fx: 'qualified', cap: 'native' },
      { at: 4100, fx: 'booked', cap: 'calendar', tool: 'googlecalendar' },
      { at: 5000, fx: 'crm', cap: 'crm', tool: 'hubspot' },
      { at: 5600, fx: 'pending', cap: 'native' },
      { at: 6500, fx: 'approved', cap: 'native' },
      { at: 7300, fx: 'followup', cap: 'email', tool: 'gmail' },
      { at: 8300, fx: 'report', cap: 'docs', tool: 'notion' },
      { at: 9200, fx: 'nextrun', cap: 'native' },
    ],
  },
  {
    id: 'platforms',
    len: 10000,
    set: ['supabase', 'github', 'sentry', 'vercel', 'figma', 'stripe'],
    intentAt: 300,
    createAt: 1000,
    verifyAt: 7200,
    steps: [
      { at: 1400, fx: 'inspected', cap: 'native' },
      { at: 2600, fx: 'core', cap: 'database', tool: 'supabase' },
      { at: 3200, fx: 'extension', cap: 'native' },
      { at: 3800, fx: 'ios', cap: 'native' },
      { at: 4400, fx: 'android', cap: 'native' },
      { at: 5000, fx: 'sync', cap: 'native' },
      { at: 6200, fx: 'built', cap: 'source-control', tool: 'github' },
      { at: 7200, fx: 'tested', cap: 'monitoring', tool: 'sentry' },
      { at: 8200, fx: 'destinations', cap: 'native' },
    ],
  },
  {
    id: 'research',
    len: 9000,
    // Native-first: Xroga's own model routing does most of this; only two tools are touched.
    set: ['googledrive', 'perplexity', 'openai', 'notion', 'dropbox', 'airtable'],
    intentAt: 300,
    createAt: 1000,
    steps: [
      { at: 2600, fx: 'files', cap: 'docs', tool: 'googledrive' },
      { at: 3300, fx: 'web', cap: 'research', tool: 'perplexity' },
      { at: 3800, fx: 'conflict', cap: 'native' },
      { at: 4400, fx: 'synthesis', cap: 'native' },
      { at: 5000, fx: 'memory', cap: 'native' },
      { at: 5700, fx: 'brief', cap: 'native' },
      { at: 6600, fx: 'product', cap: 'native' },
    ],
  },
  {
    id: 'growth',
    len: 10000,
    set: ['semrush', 'googleads', 'posthog', 'mailchimp', 'hubspot', 'reddit'],
    intentAt: 300,
    createAt: 1000,
    steps: [
      { at: 2600, fx: 'search', cap: 'seo', tool: 'semrush' },
      { at: 3300, fx: 'ads', cap: 'growth', tool: 'googleads' },
      { at: 4000, fx: 'funnel', cap: 'analytics', tool: 'posthog' },
      { at: 4500, fx: 'constraint', cap: 'native' },
      { at: 5200, fx: 'decision', cap: 'native' },
      { at: 6100, fx: 'launched', cap: 'email', tool: 'mailchimp' },
      { at: 7000, fx: 'measuring', cap: 'native' },
      { at: 8000, fx: 'nextreview', cap: 'native' },
    ],
  },
];

export const CYCLES: readonly VignetteId[][] = [
  ['saas', 'qa', 'clinic'],
  ['platforms', 'research', 'growth'],
];

export const LEAD = 1000; // headline holds before the first vignette (first pass only)
export const REST = 6000; // after each cycle
export const TURN_MS = 1100; // orb transition between vignettes
export const SWAP_AT = 450; // rack changes in the final part of the turn
export const SWAP_MS = 800;
export const INTENT_MS = 800;
const LEAVE_MS = 500;
/** Capability rotator (V12 §8–§9): a 600 ms mask change, then one sweep 350 ms after it settles. */
export const PHRASE_MS = 600;
export const SHINE_DELAY = 350;
export const SHINE_MS = 1300;
/** H1 sweeps on the first pass only: ~1 s after load, and one more 8 s later (V12 §5). */
export const TITLE_SHINES = [1000, 9000] as const;
/** Native steps: Xroga works inside the orb for this long before the object changes (V12 §14). */
const NATIVE_MS = 450;

const byId = Object.fromEntries(VIGNETTES.map((v) => [v.id, v])) as Record<VignetteId, Vignette>;
export const vignette = (id: VignetteId) => byId[id];

/** Global timeline of one loop: lead, cycle A, rest, cycle B, rest. */
type Seg = { kind: 'lead' } | { kind: 'vig'; v: Vignette; index: number } | { kind: 'rest'; after: Vignette; n: number };
const TIMELINE: { start: number; end: number; seg: Seg }[] = (() => {
  const out: { start: number; end: number; seg: Seg }[] = [{ start: 0, end: LEAD, seg: { kind: 'lead' } }];
  let t = LEAD;
  let index = 0;
  CYCLES.forEach((cycle, n) => {
    for (const id of cycle) {
      const v = byId[id];
      out.push({ start: t, end: t + v.len, seg: { kind: 'vig', v, index: index++ } });
      t += v.len;
    }
    out.push({ start: t, end: t + REST, seg: { kind: 'rest', after: byId[cycle[cycle.length - 1]], n } });
    t += REST;
  });
  return out;
})();
export const LOOP = TIMELINE[TIMELINE.length - 1].end;
const ORDER: VignetteId[] = CYCLES.flat();

/** The single frame used for reduced motion and as the poster (V7 §57, V8 §57): browser QA, verified and release-ready. */
export const STATIC_AT = TIMELINE.find((x) => x.seg.kind === 'vig' && x.seg.v.id === 'qa')!.start + 10500;

export function perfTime(clock: number): { t: number; firstPass: boolean; pass: number } {
  if (clock < LOOP) return { t: clock, firstPass: true, pass: 0 };
  const span = LOOP - LEAD;
  return { t: LEAD + ((clock - LOOP) % span), firstPass: false, pass: 1 + Math.floor((clock - LOOP) / span) };
}

/** Every step of a vignette as a HeroAction, in order. The only source for providers, routes and results. */
export const heroActions = (v: Vignette): HeroAction[] =>
  v.steps.map((s) => ({ id: `${v.id}-${s.fx}`, sceneId: v.id, capability: s.cap, providerId: s.tool ?? null, resultState: s.fx, at: s.at }));

/** Provider-assisted actions with their route window. Native actions (providerId null) never route. */
export const toolRoutes = (v: Vignette) =>
  heroActions(v)
    .filter((a): a is HeroAction & { providerId: ProviderId } => a.providerId !== null)
    .map((a) => ({ id: a.id, action: a, tool: a.providerId, start: a.at - ROUTE_LEAD, at: a.at }));
export const allEffects = (v: Vignette) => v.steps.map((s) => s.fx);

export type OrbBeat = 'idle' | 'absorb' | 'create' | 'connect' | 'verify' | 'native';
export type BgBeat = 'calm' | 'compress' | 'create' | 'wave' | 'verify' | 'publish';

export interface Route {
  /** The HeroAction this route carries: highlight, endpoint and result all read from it. */
  id: string;
  tool: ProviderId;
  result: string;
  /** ms since this route started (not part of the frame key; used to count visible paths). */
  age: number;
}

export interface Frame {
  t: number;
  firstPass: boolean;
  barIn: boolean;
  vignette: VignetteId | null;
  /** ms inside the current vignette (or rest). */
  local: number;
  prompt: string | null;
  /** Key of the intent light in flight from the bar into Xroga (null when none). */
  intent: string | null;
  /** Key of the orb's transition turn, and its direction. */
  turn: { key: string; dir: 1 | -1 } | null;
  orb: OrbBeat;
  bg: BgBeat;
  work: WorkKind | null;
  /** Previous work object folding back into Xroga. */
  leaving: WorkKind | null;
  leavingFx: string[];
  /** The brief has gone into Xroga with the request. */
  briefSent: boolean;
  effects: string[];
  cursor: string | null;
  createLine: boolean;
  set: readonly ProviderId[];
  prevSet: readonly ProviderId[] | null;
  /** Tools already used in this job: they stay quietly lit. */
  used: ProviderId[];
  /** Tools a call has reached and whose answer is still returning: they sharpen and lift. */
  active: ProviderId[];
  routes: Route[];
  settled: boolean;
  /** Capability phrase after the fixed lead (V12 §7), and the one it replaces while the mask runs. */
  phrase: PhraseKey;
  prevPhrase: PhraseKey | null;
  /** The single text-light event in flight (V12 §5, §9): never the H1 and the phrase together. */
  shine: 'title' | 'phrase' | null;
}

const within = (t: number, a: number, b: number) => t >= a && t < b;
const phraseOf = (seg: Seg): PhraseKey => (seg.kind === 'lead' ? ORDER[0] : seg.kind === 'rest' ? 'rest' : seg.v.id);

function workAt(v: Vignette, local: number): WorkKind {
  return v.id === 'saas' && local < v.createAt ? 'brief' : v.id;
}

export function frameAt(clock: number): Frame {
  const { t, firstPass, pass } = perfTime(clock);
  let segIndex = TIMELINE.findIndex((x) => t >= x.start && t < x.end);
  if (segIndex < 0) segIndex = TIMELINE.length - 1;
  const seg = TIMELINE[segIndex];
  const local = t - seg.start;
  const base: Frame = {
    t,
    firstPass,
    barIn: !firstPass || t >= 300,
    vignette: null,
    local,
    prompt: null,
    intent: null,
    turn: null,
    orb: 'idle',
    bg: 'calm',
    work: null,
    leaving: null,
    leavingFx: [],
    briefSent: false,
    effects: [],
    cursor: null,
    createLine: false,
    set: byId[ORDER[0]].set,
    prevSet: null,
    used: [],
    active: [],
    routes: [],
    settled: false,
    phrase: phraseOf(seg.seg),
    prevPhrase: null,
    shine: null,
  };
  // capability phrase: changes with the scene, under a short mask, then catches one sweep of light
  const prevSeg = segIndex > 0 ? TIMELINE[segIndex - 1].seg : firstPass ? null : TIMELINE[TIMELINE.length - 1].seg;
  const prevKey = prevSeg ? phraseOf(prevSeg) : null;
  const changed = prevKey !== null && prevKey !== base.phrase;
  if (changed && local < PHRASE_MS) base.prevPhrase = prevKey;
  if (firstPass && TITLE_SHINES.some((at) => within(t, at, at + SHINE_MS))) base.shine = 'title';
  else if (changed && within(local, PHRASE_MS + SHINE_DELAY, PHRASE_MS + SHINE_DELAY + SHINE_MS)) base.shine = 'phrase';

  if (seg.seg.kind === 'lead') {
    // later passes never come back here; on the first pass the stage waits under the headline
    return { ...base, work: null, set: byId[ORDER[0]].set };
  }

  if (seg.seg.kind === 'rest') {
    const v = seg.seg.after;
    return {
      ...base,
      vignette: null,
      prompt: SECONDARY[(seg.seg.n + pass * 2) % SECONDARY.length],
      bg: 'calm',
      work: v.id,
      effects: allEffects(v),
      set: v.set,
      used: toolRoutes(v).map((r) => r.tool),
      settled: true,
    };
  }

  const { v, index } = seg.seg;
  const prev = byId[ORDER[(index + ORDER.length - 1) % ORDER.length]];
  const hasPrev = !(firstPass && index === 0);

  const effects = v.steps.filter((s) => local >= s.at).map((s) => s.fx);
  const live = toolRoutes(v).filter((r) => within(local, r.start, r.start + ROUTE_MS));
  const routes = live.map((r) => ({ id: r.id, tool: r.tool, result: r.action.resultState, age: local - r.start }));
  // the provider is selected (active) before the call leaves Xroga and stays lit until the answer is back;
  // it comes from the same action as the route, so the highlight and the endpoint cannot disagree
  const active = live.filter((r) => local - r.start < SIGNAL.back + 150).map((r) => r.tool);
  // a tool counts as used once the call has reached it
  const used = toolRoutes(v)
    .filter((r) => local >= r.start + SIGNAL.call - 50)
    .map((r) => r.tool);

  // the previous object folds into Xroga as the new one forms; the brief folds as the SaaS forms
  let leaving: WorkKind | null = null;
  let leavingFx: string[] = [];
  if (local < LEAVE_MS && hasPrev) {
    leaving = prev.id;
    leavingFx = allEffects(prev);
  } else if (v.id === 'saas' && within(local, v.createAt, v.createAt + LEAVE_MS)) {
    leaving = 'brief';
  }
  const work: WorkKind | null = local < LEAVE_MS && v.id !== 'saas' ? null : workAt(v, local);

  const intent = within(local, v.intentAt, v.intentAt + INTENT_MS) ? `${v.id}-${pass}` : null;
  const turn = local < TURN_MS && hasPrev ? { key: `${v.id}-${pass}`, dir: (index % 2 ? -1 : 1) as 1 | -1 } : null;

  let orb: OrbBeat = 'idle';
  if (within(local, v.intentAt + INTENT_MS - 100, v.createAt)) orb = 'absorb';
  else if (within(local, v.createAt, v.createAt + 900)) orb = 'create';
  else if (v.verifyAt !== undefined && within(local, v.verifyAt - 200, v.verifyAt + 600)) orb = 'verify';
  else if (toolRoutes(v).some((r) => within(local, r.start, r.start + 300) || within(local, r.start + SIGNAL.back - 150, r.start + SIGNAL.back + 150))) orb = 'connect';
  // native steps stay inside Xroga: a short inner beat, no provider and no route
  else if (heroActions(v).some((a) => a.providerId === null && within(local, a.at - NATIVE_MS, a.at))) orb = 'native';

  const cursorStep = v.cursor?.filter(([at]) => local >= at).pop();
  const cursor = cursorStep && cursorStep[1] !== 'away' ? cursorStep[1] : null;

  const lastAt = v.steps[v.steps.length - 1].at;
  // one background event at a time, always derived from the same clock (V10 §13, §41)
  let bg: BgBeat = 'calm';
  if (within(local, v.intentAt, v.createAt)) bg = 'compress';
  else if (within(local, v.createAt, v.createAt + 1300)) bg = 'create';
  else if (local >= lastAt - 200 && local < lastAt + 900 && /live|released|destinations/.test(v.steps[v.steps.length - 1].fx)) bg = 'publish';
  else if (v.verifyAt !== undefined && within(local, v.verifyAt - 100, v.verifyAt + 800)) bg = 'verify';
  else if (routes.some((r) => r.age < SIGNAL.back) || (hasPrev && within(local, SWAP_AT, SWAP_AT + SWAP_MS))) bg = 'wave';

  const swapping = hasPrev && within(local, SWAP_AT, SWAP_AT + SWAP_MS) && prev.set.join() !== v.set.join();
  return {
    ...base,
    vignette: v.id,
    prompt: COMMANDS[v.id],
    intent,
    turn,
    orb,
    bg,
    work,
    leaving,
    leavingFx,
    briefSent: v.id === 'saas' && local >= v.intentAt + 100,
    effects,
    cursor,
    createLine: within(local, v.createAt, v.createAt + 1000) || (v.verifyAt !== undefined && within(local, v.verifyAt, v.verifyAt + 700)),
    // the rack keeps the previous job's tools until the final part of the turn
    set: hasPrev && local < SWAP_AT ? prev.set : v.set,
    prevSet: swapping ? prev.set : null,
    used: local < SWAP_AT ? [] : used,
    active,
    routes,
    settled: false,
  };
}

/** Discrete key so React re-renders only when something visible changes. */
export function frameKey(f: Frame): string {
  return [
    f.firstPass,
    f.barIn,
    f.vignette,
    f.prompt,
    f.intent,
    f.turn?.key,
    f.orb,
    f.bg,
    f.work,
    f.leaving,
    f.briefSent,
    f.effects.join(),
    f.cursor,
    f.createLine,
    f.set.join(),
    f.prevSet?.join(),
    f.used.join(),
    f.active.join(),
    f.routes.map((r) => r.id).join(),
    f.settled,
    f.phrase,
    f.prevPhrase,
    f.shine,
  ].join('|');
}
