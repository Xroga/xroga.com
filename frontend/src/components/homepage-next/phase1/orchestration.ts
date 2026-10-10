/**
 * S00 performance script. Pure data, no React.
 *
 * One stable stage. Each scene reconfigures the command, the work object on the left, the right-side
 * context and the background as one event, with the orb mediating the change. Seven scenes run as one
 * continuous loop with no rest:
 *   SaaS, browser QA, dental operations, native research, cross-platform, native cleanup, growth.
 * The right side has three modes in the same place: TOOLS FOR THIS JOB (external tools, used only when
 * the step needs them), RESEARCH SOURCES (evidence Xroga reads and then synthesises itself) and CLEANUP
 * PLAN (Xroga's own data work, no provider at all).
 */
import type { ProviderId } from './providerMarks';
import { COMMANDS, type PhraseKey } from './copy';

export type VignetteId = keyof typeof COMMANDS;
export type WorkKind = 'brief' | VignetteId;

/** The three meanings of the right side of the stage. */
export type RightMode = 'tools' | 'sources' | 'plan';
/** Public evidence sources for native research. They are read, never "connected". */
export type SourceId = 'x' | 'reddit' | 'google' | 'web';
export const SOURCE_SET: readonly SourceId[] = ['x', 'reddit', 'google', 'web'];

/** What a micro-step needs. `native` and the browser are Xroga's own capabilities. */
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
 * A step inside a scene: when it lands, what it needs and, only if something outside Xroga is touched,
 * which provider (`tool`) or which public source (`source`). With neither, Xroga does the step itself:
 * no provider is lit and no route is drawn. `hop` draws Xroga handing its own result to the work object.
 */
export interface Step {
  at: number;
  fx: string;
  cap: Capability;
  tool?: ProviderId;
  source?: SourceId;
  hop?: boolean;
}

/**
 * The single action model. One object drives the highlight, the signal endpoint, the route and the
 * work-object change, so a light can never land on a provider or source the step does not use.
 */
export interface HeroAction {
  id: string;
  sceneId: VignetteId;
  capability: Capability;
  providerId: ProviderId | null;
  sourceId: SourceId | null;
  /** The work-object state this action produces (the step's effect key). */
  resultState: string;
  /** When the result lands on the work object (relative ms). */
  at: number;
}

export interface Vignette {
  id: VignetteId;
  len: number;
  mode: RightMode;
  /**
   * Six readable tools for this job (phones show 3, tablets 4). Tools mode only. The tools a step really calls come
   * first; the remaining slots show other relevant integrations from Xroga's catalog. Those are display only: they are
   * never called, never wired and never lit, they only show how wide the tool universe is.
   */
  set: readonly ProviderId[];
  /** When the request leaves the bar for Xroga (relative ms). */
  intentAt: number;
  /** When Xroga forms the object (absorb ends, creation starts). The object is never shown before this. */
  createAt: number;
  verifyAt?: number;
  /** Browser-like scenes move a cursor: [at, position]. */
  cursor?: readonly [number, string][];
  steps: readonly Step[];
}

/**
 * Signal grammar for one external call, relative to the route start:
 *   0 to 550 ms     call: a packet leaves Xroga for the provider or source, which sharpens on arrival
 *   550 to 850 ms   the answer returns along the same path into Xroga (the orb reacts)
 *   850 to 1100 ms  result: a short pulse runs from Xroga to the work object
 *   1250 ms         the work object changes (150 ms after the pulse arrives)
 */
export const SIGNAL = { call: 550, back: 850, arrive: 1100, land: 1250, end: 1400 } as const;
const ROUTE_LEAD = SIGNAL.land;
const ROUTE_MS = SIGNAL.end;
/** Native hand-off: Xroga's own result travels to the work object just before it changes. */
export const HOP = { before: 450, after: 150 } as const;

const INTENT = 200;
const CREATE = 1150;
const FIRST = 1250; // the first visible state lands as the object unfolds: never an empty panel

export const VIGNETTES: readonly Vignette[] = [
  {
    id: 'saas',
    len: 6100,
    mode: 'tools',
    set: ['supabase', 'stripe', 'github', 'vercel', 'linear', 'cloudflare'],
    intentAt: INTENT,
    createAt: CREATE,
    steps: [
      { at: FIRST, fx: 'shell', cap: 'native' },
      { at: 2500, fx: 'auth', cap: 'auth', tool: 'supabase' },
      { at: 3400, fx: 'billing', cap: 'payments', tool: 'stripe' },
      { at: 4300, fx: 'repo', cap: 'source-control', tool: 'github' },
      { at: 5200, fx: 'live', cap: 'deployment', tool: 'vercel' },
    ],
  },
  {
    id: 'qa',
    len: 8450,
    mode: 'tools',
    set: ['sentry', 'github', 'stripe', 'vercel', 'zendesk', 'mixpanel'],
    intentAt: INTENT,
    createAt: CREATE,
    verifyAt: 6900,
    cursor: [
      [1300, 'email'],
      [1450, 'pay'],
      [1550, 'hover'],
      [1700, 'press'],
      [1900, 'rest'],
      [4950, 'pay'],
      [5050, 'hover'],
      [5200, 'press'],
      [5400, 'rest'],
      [5850, 'away'],
    ],
    steps: [
      { at: FIRST, fx: 'start', cap: 'browser' },
      { at: 1900, fx: 'failed', cap: 'browser' },
      // each tool is called only once its cause exists: Sentry once the browser has seen the failure, GitHub once
      // Xroga has repaired the code itself (the commit call leaves as the repair lands), Stripe after the re-press
      { at: 3150, fx: 'isolated', cap: 'monitoring', tool: 'sentry' },
      { at: 3800, fx: 'repaired', cap: 'native', hop: true },
      { at: 5050, fx: 'committed', cap: 'source-control', tool: 'github' },
      { at: 6450, fx: 'paid', cap: 'payments', tool: 'stripe' },
      { at: 6900, fx: 'verified', cap: 'browser' },
      { at: 7550, fx: 'released', cap: 'deployment', tool: 'vercel' },
    ],
  },
  {
    id: 'clinic',
    len: 5350,
    mode: 'tools',
    set: ['googlecalendar', 'hubspot', 'gmail', 'calendly', 'intercom', 'asana'],
    intentAt: INTENT,
    createAt: CREATE,
    steps: [
      { at: FIRST, fx: 'inquiry', cap: 'native' },
      { at: 1950, fx: 'qualified', cap: 'native' },
      { at: 2650, fx: 'booked', cap: 'calendar', tool: 'googlecalendar' },
      { at: 3550, fx: 'crm', cap: 'crm', tool: 'hubspot' },
      { at: 4450, fx: 'followup', cap: 'email', tool: 'gmail' },
    ],
  },
  {
    id: 'research',
    len: 6600,
    mode: 'sources',
    set: [],
    intentAt: INTENT,
    createAt: CREATE,
    steps: [
      { at: FIRST, fx: 'plan', cap: 'native' },
      { at: 2500, fx: 'x', cap: 'research', source: 'x' },
      { at: 3400, fx: 'reddit', cap: 'research', source: 'reddit' },
      { at: 4300, fx: 'google', cap: 'research', source: 'google' },
      { at: 4950, fx: 'compare', cap: 'native', hop: true },
      { at: 5650, fx: 'rank', cap: 'native', hop: true },
    ],
  },
  {
    id: 'platforms',
    len: 5600,
    mode: 'tools',
    set: ['supabase', 'github', 'figma', 'neon', 'railway', 'openai'],
    intentAt: INTENT,
    createAt: CREATE,
    steps: [
      { at: FIRST, fx: 'inspected', cap: 'native' },
      { at: 2500, fx: 'core', cap: 'database', tool: 'supabase' },
      { at: 3200, fx: 'variants', cap: 'native', hop: true },
      { at: 3900, fx: 'built', cap: 'source-control', tool: 'github' },
      { at: 4600, fx: 'destinations', cap: 'native' },
    ],
  },
  {
    id: 'cleanup',
    len: 6500,
    mode: 'plan',
    set: [],
    intentAt: INTENT,
    createAt: CREATE,
    steps: [
      // scan, find, then four transformations Xroga hands to the table, then a validation pass over the result
      { at: FIRST, fx: 'scanned', cap: 'native' },
      { at: 1950, fx: 'found', cap: 'native' },
      { at: 2650, fx: 'merged', cap: 'native', hop: true },
      { at: 3300, fx: 'fixed', cap: 'native', hop: true },
      { at: 3950, fx: 'normalized', cap: 'native', hop: true },
      { at: 4600, fx: 'held', cap: 'native', hop: true },
      { at: 5300, fx: 'validated', cap: 'native' },
    ],
  },
  {
    id: 'growth',
    len: 5700,
    mode: 'tools',
    set: ['semrush', 'posthog', 'mailchimp', 'googleads', 'instagram', 'youtube'],
    intentAt: INTENT,
    createAt: CREATE,
    steps: [
      { at: FIRST, fx: 'audit', cap: 'native' },
      { at: 2500, fx: 'search', cap: 'seo', tool: 'semrush' },
      { at: 3400, fx: 'funnel', cap: 'analytics', tool: 'posthog' },
      { at: 4100, fx: 'constraint', cap: 'native', hop: true },
      { at: 4800, fx: 'launched', cap: 'email', tool: 'mailchimp' },
    ],
  },
];

/** The final scene order. One loop, no separate rest scene. */
export const ORDER: readonly VignetteId[] = ['saas', 'qa', 'clinic', 'research', 'platforms', 'cleanup', 'growth'];

export const LEAD = 1000; // headline holds before the first scene (first pass only)
export const TURN_MS = 1100; // orb transition between scenes
export const SWAP_AT = 450; // the right side changes in the final part of the turn
export const SWAP_MS = 800;
export const INTENT_MS = 750;
const LEAVE_MS = 500;
/** Capability rotator: a 600 ms mask change. */
export const PHRASE_MS = 600;
/** Orb wave: one restrained ring per event. */
export const WAVE_MS = 900;

const byId = Object.fromEntries(VIGNETTES.map((v) => [v.id, v])) as Record<VignetteId, Vignette>;
export const vignette = (id: VignetteId) => byId[id];

/** Global timeline of one loop: the lead (first pass only), then the seven scenes back to back. */
type Seg = { kind: 'lead' } | { kind: 'vig'; v: Vignette; index: number };
const TIMELINE: { start: number; end: number; seg: Seg }[] = (() => {
  const out: { start: number; end: number; seg: Seg }[] = [{ start: 0, end: LEAD, seg: { kind: 'lead' } }];
  let t = LEAD;
  ORDER.forEach((id, index) => {
    const v = byId[id];
    out.push({ start: t, end: t + v.len, seg: { kind: 'vig', v, index } });
    t += v.len;
  });
  return out;
})();
export const LOOP = TIMELINE[TIMELINE.length - 1].end;
/** Start of a scene on the first pass. */
export const sceneStart = (id: VignetteId) => TIMELINE.find((x) => x.seg.kind === 'vig' && x.seg.v.id === id)!.start;

/** The single frame used for reduced motion and as the poster: browser QA, verified and release-ready. */
export const STATIC_AT = sceneStart('qa') + vignette('qa').len - 100;

export function perfTime(clock: number): { t: number; firstPass: boolean; pass: number } {
  if (clock < LOOP) return { t: clock, firstPass: true, pass: 0 };
  const span = LOOP - LEAD;
  return { t: LEAD + ((clock - LOOP) % span), firstPass: false, pass: 1 + Math.floor((clock - LOOP) / span) };
}

/** Every step of a scene as a HeroAction, in order. The only source for providers, sources, routes and results. */
export const heroActions = (v: Vignette): HeroAction[] =>
  v.steps.map((s) => ({
    id: `${v.id}-${s.fx}`,
    sceneId: v.id,
    capability: s.cap,
    providerId: s.tool ?? null,
    sourceId: s.source ?? null,
    resultState: s.fx,
    at: s.at,
  }));

export interface RouteDef {
  id: string;
  action: HeroAction;
  kind: 'tool' | 'source';
  /** Provider id (tools) or source id (research): the one element this route may end on. */
  target: string;
  start: number;
  at: number;
}

/** External calls with their route window. Native actions (no provider, no source) never route. */
export const routesOf = (v: Vignette): RouteDef[] =>
  heroActions(v)
    .filter((a) => a.providerId !== null || a.sourceId !== null)
    .map((a) => ({
      id: a.id,
      action: a,
      kind: a.providerId !== null ? ('tool' as const) : ('source' as const),
      target: (a.providerId ?? a.sourceId) as string,
      start: a.at - ROUTE_LEAD,
      at: a.at,
    }));
/** Provider-assisted actions only. */
export const toolRoutes = (v: Vignette) => routesOf(v).filter((r) => r.kind === 'tool');
export const allEffects = (v: Vignette) => v.steps.map((s) => s.fx);

export type OrbBeat = 'idle' | 'absorb' | 'create' | 'connect' | 'verify' | 'native';
export type BgBeat = 'calm' | 'compress' | 'create' | 'wave' | 'verify' | 'publish';
export type WaveKind = 'in' | 'back' | 'done';

export interface Route {
  /** The HeroAction this route carries: highlight, endpoint and result all read from it. */
  id: string;
  kind: 'tool' | 'source';
  target: string;
  result: string;
  /** ms since this route started (not part of the frame key; used to count visible paths). */
  age: number;
  /** A newer call has started: this route only finishes its fade, it is no longer the selected target. */
  superseded: boolean;
}

export interface Frame {
  t: number;
  firstPass: boolean;
  pass: number;
  barIn: boolean;
  vignette: VignetteId | null;
  /** ms inside the current scene. */
  local: number;
  prompt: string | null;
  /** Key of the intent light in flight from the bar into Xroga (null when none). */
  intent: string | null;
  /** Key of the orb's transition turn, and its direction. */
  turn: { key: string; dir: 1 | -1 } | null;
  orb: OrbBeat;
  /** One restrained ring from the orb: intent arrives, an answer returns, the work completes. */
  wave: { key: string; kind: WaveKind } | null;
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
  /** Native hand-off in flight: Xroga gives its own result to the work object (action id). */
  hop: string | null;
  /** Right side: its mode, and the mode it replaces while the swap runs. */
  mode: RightMode;
  prevMode: RightMode | null;
  set: readonly ProviderId[];
  prevSet: readonly ProviderId[] | null;
  /** Tools already used in this job: they stay quietly lit. */
  used: ProviderId[];
  /** Tools a call has reached and whose answer is still returning: they sharpen and lift. */
  active: ProviderId[];
  /** Research sources already read, and the ones a call is reading now. */
  found: SourceId[];
  reading: SourceId[];
  routes: Route[];
  /** Capability phrase after the fixed lead, and the one it replaces while the mask runs. */
  phrase: PhraseKey;
  prevPhrase: PhraseKey | null;
}

const within = (t: number, a: number, b: number) => t >= a && t < b;

export function frameAt(clock: number): Frame {
  const { t, firstPass, pass } = perfTime(clock);
  let segIndex = TIMELINE.findIndex((x) => t >= x.start && t < x.end);
  if (segIndex < 0) segIndex = TIMELINE.length - 1;
  const seg = TIMELINE[segIndex];
  const local = t - seg.start;
  const first = byId[ORDER[0]];
  const base: Frame = {
    t,
    firstPass,
    pass,
    barIn: !firstPass || t >= 300,
    vignette: null,
    local,
    prompt: null,
    intent: null,
    turn: null,
    orb: 'idle',
    wave: null,
    bg: 'calm',
    work: null,
    leaving: null,
    leavingFx: [],
    briefSent: false,
    effects: [],
    cursor: null,
    createLine: false,
    hop: null,
    mode: first.mode,
    prevMode: null,
    set: first.set,
    prevSet: null,
    used: [],
    active: [],
    found: [],
    reading: [],
    routes: [],
    phrase: ORDER[0],
    prevPhrase: null,
  };

  // the stage waits under the headline on the first pass only; later passes never come back here
  if (seg.seg.kind === 'lead') return base;

  const { v, index } = seg.seg;
  const prev = byId[ORDER[(index + ORDER.length - 1) % ORDER.length]];
  const hasPrev = !(firstPass && index === 0);
  const key = `${v.id}-${pass}`;

  // capability phrase: one per scene, changing under a short mask exactly as the scene changes
  const phrase: PhraseKey = v.id;
  const prevPhrase = hasPrev && local < PHRASE_MS && prev.id !== v.id ? prev.id : null;

  const effects = v.steps.filter((s) => local >= s.at).map((s) => s.fx);
  const all = routesOf(v);
  const live = all.filter((r) => within(local, r.start, r.start + ROUTE_MS));
  // only the newest call is the selected target; an older call that is still fading is superseded at once
  const newest = live.length ? Math.max(...live.map((r) => r.start)) : -1;
  const routes: Route[] = live.map((r) => ({
    id: r.id,
    kind: r.kind,
    target: r.target,
    result: r.action.resultState,
    age: local - r.start,
    superseded: r.start !== newest,
  }));
  // the target is selected (lit) as the call leaves Xroga and stays lit until the answer is back; it comes from
  // the same action as the route, so the highlight and the endpoint cannot disagree
  const lit = live.filter((r) => r.start === newest && local - r.start < SIGNAL.back + 150);
  const reached = all.filter((r) => local >= r.start + SIGNAL.call - 50);
  const active = lit.filter((r) => r.kind === 'tool').map((r) => r.target as ProviderId);
  const reading = lit.filter((r) => r.kind === 'source').map((r) => r.target as SourceId);
  const used = reached.filter((r) => r.kind === 'tool').map((r) => r.target as ProviderId);
  const found = reached.filter((r) => r.kind === 'source').map((r) => r.target as SourceId);

  // the previous object folds into Xroga; the new one unfolds out of Xroga once Xroga has formed it
  let leaving: WorkKind | null = null;
  let leavingFx: string[] = [];
  if (local < LEAVE_MS && hasPrev) {
    leaving = prev.id;
    leavingFx = allEffects(prev);
  } else if (v.id === 'saas' && within(local, v.createAt, v.createAt + LEAVE_MS)) {
    leaving = 'brief';
  }
  let work: WorkKind | null = null;
  if (v.id === 'saas' && local < v.createAt) work = local >= LEAVE_MS || !hasPrev ? 'brief' : null;
  else if (local >= v.createAt) work = v.id;

  const intent = within(local, v.intentAt, v.intentAt + INTENT_MS) ? key : null;
  const turn = local < TURN_MS && hasPrev ? { key, dir: (index % 2 ? -1 : 1) as 1 | -1 } : null;
  const arrive = v.intentAt + INTENT_MS;

  const natives = heroActions(v).filter((a) => a.providerId === null && a.sourceId === null);
  let orb: OrbBeat = 'idle';
  if (within(local, arrive - 100, v.createAt)) orb = 'absorb';
  else if (within(local, v.createAt, v.createAt + 700)) orb = 'create';
  else if (v.verifyAt !== undefined && within(local, v.verifyAt - 200, v.verifyAt + 600)) orb = 'verify';
  else if (all.some((r) => within(local, r.start, r.start + 300) || within(local, r.start + SIGNAL.back - 150, r.start + SIGNAL.back + 150))) orb = 'connect';
  // native steps stay inside Xroga: a short inner beat, no provider and no route
  else if (natives.some((a) => within(local, a.at - 450, a.at))) orb = 'native';

  // three rings per scene at most, never a pulse: the intent arriving, the first external answer coming back
  // (later answers get the orb's connect beat instead) and the work completing
  const lastAt = v.steps[v.steps.length - 1].at;
  const firstBack = all[0] ? all[0].start + SIGNAL.back - 50 : null;
  let wave: Frame['wave'] = null;
  if (within(local, lastAt, lastAt + WAVE_MS)) wave = { key: `${key}-done`, kind: 'done' };
  else if (firstBack !== null && within(local, firstBack, firstBack + WAVE_MS)) wave = { key: `${key}-${all[0].id}`, kind: 'back' };
  else if (within(local, arrive - 50, arrive - 50 + WAVE_MS)) wave = { key: `${key}-in`, kind: 'in' };

  const hopAction = v.steps.find((s) => s.hop && within(local, s.at - HOP.before, s.at + HOP.after));

  const cursorStep = v.cursor?.filter(([at]) => local >= at).pop();
  const cursor = cursorStep && cursorStep[1] !== 'away' ? cursorStep[1] : null;

  // one background event at a time, always derived from the same clock
  let bg: BgBeat = 'calm';
  if (within(local, v.intentAt, v.createAt)) bg = 'compress';
  else if (within(local, v.createAt, v.createAt + 1000)) bg = 'create';
  else if (within(local, lastAt - 200, lastAt + 900) && /live|released|destinations/.test(v.steps[v.steps.length - 1].fx)) bg = 'publish';
  else if (v.verifyAt !== undefined && within(local, v.verifyAt - 100, v.verifyAt + 800)) bg = 'verify';
  else if (within(local, lastAt - 100, lastAt + 900)) bg = 'verify';
  else if (routes.some((r) => r.age < SIGNAL.back) || (hasPrev && within(local, SWAP_AT, SWAP_AT + SWAP_MS))) bg = 'wave';

  const swapWindow = hasPrev && within(local, SWAP_AT, SWAP_AT + SWAP_MS);
  const before = hasPrev && local < SWAP_AT;
  const mode = before ? prev.mode : v.mode;
  return {
    ...base,
    vignette: v.id,
    prompt: COMMANDS[v.id],
    intent,
    turn,
    orb,
    wave,
    bg,
    work,
    leaving,
    leavingFx,
    briefSent: v.id === 'saas' && local >= v.intentAt + 100,
    effects,
    cursor,
    createLine: within(local, v.createAt, v.createAt + 700) || (v.verifyAt !== undefined && within(local, v.verifyAt, v.verifyAt + 700)),
    hop: hopAction ? `${v.id}-${hopAction.fx}` : null,
    // the right side keeps the previous job's context until the final part of the turn
    mode,
    prevMode: swapWindow && prev.mode !== v.mode ? prev.mode : null,
    set: before ? prev.set : v.set,
    // the tools leaving during the swap: per slot when the next job also uses tools, as one layer when the mode changes
    prevSet: swapWindow && prev.mode === 'tools' && (v.mode !== 'tools' || prev.set.join() !== v.set.join()) ? prev.set : null,
    used: before ? [] : used,
    active,
    found: before ? [] : found,
    reading,
    routes,
    phrase,
    prevPhrase,
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
    f.wave?.key,
    f.bg,
    f.work,
    f.leaving,
    f.briefSent,
    f.effects.join(),
    f.cursor,
    f.createLine,
    f.hop,
    f.mode,
    f.prevMode,
    f.set.join(),
    f.prevSet?.join(),
    f.used.join(),
    f.active.join(),
    f.found.join(),
    f.reading.join(),
    f.routes.map((r) => `${r.id}${r.superseded ? '~' : ''}`).join(),
    f.phrase,
    f.prevPhrase,
  ].join('|');
}
