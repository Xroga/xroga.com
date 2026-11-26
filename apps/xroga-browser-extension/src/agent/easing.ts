// Easing curves for keyframes and transitions: the full family (sine, quad, cubic, quart, quint, expo, circ, back, elastic, bounce, each in, out and in-out) and springs. The set and the
// shapes follow the timing functions of motion-canvas (MIT); the springs are the closed-form motion of a damped oscillator. Written fresh and tested alone.
// A name is read leniently: "ease-in-out-cubic", "easeInOutCubic", "in-out-cubic" and "inoutcubic" are one.

type Fn = (t: number) => number;
const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

const FAMILIES: Record<string, Fn> = {
  sine: t => 1 - Math.cos((t * Math.PI) / 2),
  quad: t => t * t,
  cubic: t => t * t * t,
  quart: t => t ** 4,
  quint: t => t ** 5,
  expo: t => (t === 0 ? 0 : 2 ** (10 * t - 10)),
  circ: t => 1 - Math.sqrt(1 - t * t),
};

const mirrorOut = (fn: Fn): Fn => t => 1 - fn(1 - t);
const inOut = (fn: Fn): Fn => t => (t < 0.5 ? fn(t * 2) / 2 : 1 - fn((1 - t) * 2) / 2);

const BACK = 1.70158;
const backIn: Fn = t => (BACK + 1) * t * t * t - BACK * t * t;
const BACK_IO = BACK * 1.525;
const backInOut: Fn = t => (t < 0.5 ? ((2 * t) ** 2 * ((BACK_IO + 1) * 2 * t - BACK_IO)) / 2 : ((2 * t - 2) ** 2 * ((BACK_IO + 1) * (t * 2 - 2) + BACK_IO) + 2) / 2);

const elasticIn: Fn = t => (t === 0 ? 0 : t === 1 ? 1 : -(2 ** (10 * t - 10)) * Math.sin((t * 10 - 10.75) * ((2 * Math.PI) / 3)));
const elasticInOut: Fn = t => {
  if (t === 0 || t === 1) return t;
  const c = (2 * Math.PI) / 4.5;
  const s = Math.sin((20 * t - 11.125) * c);
  return t < 0.5 ? -(2 ** (20 * t - 10) * s) / 2 : (2 ** (-20 * t + 10) * s) / 2 + 1;
};

const bounceOut: Fn = t => {
  const n = 7.5625;
  const d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
};

/** Where a spring (mass 1, so stiffness and damping stand for what they do to a unit mass) is at time t of a run that lasts `settle` of its own seconds. */
export interface SpringShape {
  /** Oscillations before it settles: more is bouncier. */
  stiffness: number;
  /** 0 never settles, 1 does not overshoot. */
  damping: number;
}
export function springEase(shape: SpringShape): Fn {
  const zeta = Math.min(1.5, Math.max(0.05, shape.damping));
  const w0 = Math.max(1, shape.stiffness);
  const wd = w0 * Math.sqrt(Math.max(1e-6, 1 - zeta * zeta));
  const raw: Fn = t => {
    // the settle time scales so the motion has died away at t = 1
    const x = t * (6.9 / (zeta * w0));
    if (zeta < 1) return 1 - Math.exp(-zeta * w0 * x) * (Math.cos(wd * x) + ((zeta * w0) / wd) * Math.sin(wd * x));
    return 1 - Math.exp(-w0 * x) * (1 + w0 * x);
  };
  const end = raw(1);
  // the last stretch is pulled onto 1 so a run ends exactly where it should
  return t => (t >= 1 ? 1 : t <= 0 ? 0 : raw(t) + (1 - end) * t ** 8);
}

const SPRINGS: Record<string, SpringShape> = {
  spring: { stiffness: 12, damping: 0.45 },
  'spring-soft': { stiffness: 8, damping: 0.8 },
  'spring-bouncy': { stiffness: 16, damping: 0.22 },
  'spring-snappy': { stiffness: 22, damping: 0.6 },
};

const cache = new Map<string, Fn | null>();

/** The key a name is looked up under: lower case, with "ease", dashes, underscores and spaces taken out. */
function canonical(name: string): string {
  return name.toLowerCase().replace(/[\s_-]+/g, '').replace(/^ease(?=in|out)/, '').replace(/^ease$/, 'inout');
}

function build(key: string): Fn | null {
  if (key === 'linear' || key === '') return t => t;
  if (key === 'sin') return t => Math.sin((t * Math.PI) / 2);
  if (key === 'cos') return t => 1 - Math.cos((t * Math.PI) / 2);
  if (key === 'hold') return () => 0;
  for (const [name, shape] of Object.entries(SPRINGS)) if (name.replace(/-/g, '') === key) return springEase(shape);
  const m = /^(inout|in|out)([a-z]*)$/.exec(key);
  if (!m) return null;
  const dir = m[1]!;
  const kind = m[2]! || 'cubic';
  let base: Fn | undefined;
  let isInOut = false;
  if (FAMILIES[kind]) {
    const fn = FAMILIES[kind]!;
    base = dir === 'in' ? fn : dir === 'out' ? mirrorOut(fn) : inOut(fn);
    isInOut = dir === 'inout';
  } else if (kind === 'back') base = dir === 'in' ? backIn : dir === 'out' ? mirrorOut(backIn) : backInOut;
  else if (kind === 'elastic') base = dir === 'in' ? elasticIn : dir === 'out' ? mirrorOut(elasticIn) : elasticInOut;
  else if (kind === 'bounce') base = dir === 'in' ? (t => 1 - bounceOut(1 - t)) : dir === 'out' ? bounceOut : (t => (t < 0.5 ? (1 - bounceOut(1 - 2 * t)) / 2 : (1 + bounceOut(2 * t - 1)) / 2));
  if (!base) return null;
  const fn = base;
  void isInOut;
  return t => (t <= 0 ? 0 : t >= 1 ? 1 : fn(t));
}

/** The curve for a name, or undefined when it is not one. The result takes any number and clamps it to 0..1 first. */
export function resolveEasing(name: string): ((t: number) => number) | undefined {
  const key = canonical(name);
  let fn = cache.get(key);
  if (fn === undefined) {
    fn = build(key);
    cache.set(key, fn);
  }
  return fn ? (t: number) => fn!(clamp01(t)) : undefined;
}

export const isEasing = (name: string): boolean => resolveEasing(name) !== undefined;

/** Names worth telling a model: the family in its three directions, plus springs. */
export const EASING_NAMES: readonly string[] = [
  'linear',
  ...['sine', 'quad', 'cubic', 'quart', 'quint', 'expo', 'circ', 'back', 'elastic', 'bounce'].flatMap(k => [`ease-in-${k}`, `ease-out-${k}`, `ease-in-out-${k}`]),
  ...Object.keys(SPRINGS),
];
