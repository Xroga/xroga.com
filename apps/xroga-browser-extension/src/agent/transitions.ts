// Video transitions as pixel rules: for a moment `progress` (0 to 1) of a transition, the colour at (u, v) is worked out from the outgoing picture and the incoming one.
// The set follows the kinds of transition editly offers through the gl-transitions library (MIT; fades, wipes, slides, circles, zooms, pixelise, swirl, ripple, window slices,
// warps and more); each rule is written fresh as plain functions so it runs on the CPU in the offscreen document and is tested without a browser or a graphics card.
export type Rgba = [number, number, number, number];
/** The picture at (u, v), both from 0 to 1 with (0, 0) at the top left. */
export type Sampler = (u: number, v: number) => Rgba;

export interface TransitionContext {
  progress: number;
  /** Width over height of the picture. */
  ratio: number;
  from: Sampler;
  to: Sampler;
}
type Rule = (u: number, v: number, c: TransitionContext) => Rgba;

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const mix = (a: Rgba, b: Rgba, t: number): Rgba => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a || 1e-9));
  return t * t * (3 - 2 * t);
};
const hash = (x: number, y: number) => {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
};
const luma = (c: Rgba) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
const BLACK: Rgba = [0, 0, 0, 1];

const directional = (dx: number, dy: number): Rule => (u, v, c) => {
  // the incoming picture pushes the outgoing one out in the direction (dx, dy)
  const p = c.progress;
  const x = u + dx * p;
  const y = v + dy * p;
  const inside = x >= 0 && x <= 1 && y >= 0 && y <= 1;
  if (inside) return c.from(x, y);
  return c.to(((x % 1) + 1) % 1, ((y % 1) + 1) % 1);
};
const RULES: Record<string, Rule> = {
  fade: (u, v, c) => mix(c.from(u, v), c.to(u, v), c.progress),
  fadecolor: (u, v, c) => {
    const p = c.progress;
    return p < 0.5 ? mix(c.from(u, v), BLACK, p * 2) : mix(BLACK, c.to(u, v), (p - 0.5) * 2);
  },
  fadegrayscale: (u, v, c) => {
    const a = c.from(u, v);
    const b = c.to(u, v);
    const p = c.progress;
    const gray = (x: Rgba): Rgba => [luma(x), luma(x), luma(x), x[3]];
    return p < 0.5 ? mix(a, gray(a), p * 2) : mix(gray(b), b, (p - 0.5) * 2);
  },
  'directional-left': directional(1, 0),
  'directional-right': directional(-1, 0),
  'directional-up': directional(0, -1),
  'directional-down': directional(0, 1),
  wipeleft: (u, v, c) => (u > 1 - c.progress ? c.to(u, v) : c.from(u, v)),
  wiperight: (u, v, c) => (u < c.progress ? c.to(u, v) : c.from(u, v)),
  wipeup: (u, v, c) => (v > 1 - c.progress ? c.to(u, v) : c.from(u, v)),
  wipedown: (u, v, c) => (v < c.progress ? c.to(u, v) : c.from(u, v)),
  softwipe: (u, v, c) => {
    const edge = c.progress * 1.2 - 0.2;
    return mix(c.from(u, v), c.to(u, v), smooth(edge, edge + 0.2, 1 - u));
  },
  circleopen: (u, v, c) => {
    const d = Math.hypot((u - 0.5) * c.ratio, v - 0.5);
    const r = c.progress * Math.hypot(0.5 * c.ratio, 0.5);
    return d < r ? c.to(u, v) : c.from(u, v);
  },
  circleclose: (u, v, c) => {
    const d = Math.hypot((u - 0.5) * c.ratio, v - 0.5);
    const r = (1 - c.progress) * Math.hypot(0.5 * c.ratio, 0.5);
    return d < r ? c.from(u, v) : c.to(u, v);
  },
  radial: (u, v, c) => {
    const angle = Math.atan2(u - 0.5, 0.5 - v); // clockwise from the top
    const a = (angle + Math.PI) / (2 * Math.PI);
    return a < c.progress ? c.to(u, v) : c.from(u, v);
  },
  angular: (u, v, c) => {
    const a = (Math.atan2(v - 0.5, u - 0.5) + Math.PI) / (2 * Math.PI);
    return a < c.progress ? c.to(u, v) : c.from(u, v);
  },
  pixelize: (u, v, c) => {
    const p = c.progress;
    const steps = Math.max(2, Math.round(1 + 60 * (0.5 - Math.abs(p - 0.5)) * 2));
    const cell = 1 / steps;
    const pu = (Math.floor(u / cell) + 0.5) * cell;
    const pv = (Math.floor(v / (cell * c.ratio)) + 0.5) * cell * c.ratio;
    return mix(c.from(pu, clamp(pv)), c.to(pu, clamp(pv)), p);
  },
  squeeze: (u, v, c) => {
    const p = c.progress;
    const y = 0.5 + (v - 0.5) / (1 - p * 0.9 + 1e-6);
    return mix(c.from(u, clamp(y)), c.to(u, v), p);
  },
  squeezeh: (u, v, c) => {
    const p = c.progress;
    const x = 0.5 + (u - 0.5) / (1 - p * 0.9 + 1e-6);
    return mix(c.from(clamp(x), v), c.to(u, v), p);
  },
  simplezoom: (u, v, c) => {
    const p = c.progress;
    const z = 1 + p * 0.5;
    const a = c.from(0.5 + (u - 0.5) / z, 0.5 + (v - 0.5) / z);
    return mix(a, c.to(u, v), smooth(0.5, 1, p));
  },
  crosszoom: (u, v, c) => {
    const p = c.progress;
    const strength = Math.sin(p * Math.PI);
    // blur toward the centre, stronger in the middle of the transition
    let a: Rgba = [0, 0, 0, 0];
    let b: Rgba = [0, 0, 0, 0];
    const n = 8;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const k = 1 - strength * 0.5 * t;
      const x = 0.5 + (u - 0.5) * k;
      const y = 0.5 + (v - 0.5) * k;
      const f = c.from(clamp(x), clamp(y));
      const g = c.to(clamp(x), clamp(y));
      a = [a[0] + f[0] / n, a[1] + f[1] / n, a[2] + f[2] / n, a[3] + f[3] / n];
      b = [b[0] + g[0] / n, b[1] + g[1] / n, b[2] + g[2] / n, b[3] + g[3] / n];
    }
    return mix(a, b, smooth(0.3, 0.7, p));
  },
  dreamy: (u, v, c) => {
    const p = c.progress;
    const shift = 0.04 * Math.sin(v * 24 + p * 6) * Math.sin(p * Math.PI);
    return mix(c.from(clamp(u + shift), v), c.to(clamp(u - shift), v), p);
  },
  dreamyzoom: (u, v, c) => {
    const p = c.progress;
    const ph = p < 0.5 ? p * 2 : (1 - p) * 2;
    const scale = 1 + (p < 0.5 ? ph * 0.2 : 0);
    const rot = ph * 0.12 * (p < 0.5 ? 1 : -1);
    const x = u - 0.5;
    const y = v - 0.5;
    const cs = Math.cos(rot);
    const sn = Math.sin(rot);
    const ru = 0.5 + (x * cs - y * sn) / scale;
    const rv = 0.5 + (x * sn + y * cs) / scale;
    return mix(c.from(clamp(ru), clamp(rv)), c.to(u, v), smooth(0.35, 0.65, p));
  },
  swirl: (u, v, c) => {
    const p = c.progress;
    const x = u - 0.5;
    const y = v - 0.5;
    const d = Math.hypot(x, y);
    const strength = Math.sin(p * Math.PI) * 6 * Math.max(0, 0.7 - d);
    const cs = Math.cos(strength);
    const sn = Math.sin(strength);
    const su = clamp(0.5 + x * cs - y * sn);
    const sv = clamp(0.5 + x * sn + y * cs);
    return mix(c.from(su, sv), c.to(su, sv), smooth(0.3, 0.7, p));
  },
  windowslice: (u, v, c) => {
    const count = 10;
    const pr = smooth(-0.5, 0, u - c.progress * 1.5);
    return (u * count) % 1 >= pr ? c.to(u, v) : c.from(u, v);
  },
  doorway: (u, v, c) => {
    const p = c.progress;
    const open = p;
    const inside = Math.abs(u - 0.5) < open * 0.5;
    if (!inside) return c.from(u, v);
    const z = 0.7 + 0.3 * smooth(0, 1, p);
    return c.to(0.5 + (u - 0.5) / z, 0.5 + (v - 0.5) / z);
  },
  heart: (u, v, c) => {
    const x = (u - 0.5) * 3;
    const y = (0.45 - v) * 3;
    const r = c.progress * 1.6;
    const inside = (x * x + y * y - r * r * 0.5) ** 3 - x * x * y * y * y < 0;
    return inside ? c.to(u, v) : c.from(u, v);
  },
  crosswarp: (u, v, c) => {
    const p = smooth(0, 1, c.progress * 2 - u);
    return mix(c.from(clamp(0.5 + (u - 0.5) * (1 - p)), v), c.to(clamp(0.5 + (u - 0.5) * p), v), p);
  },
  directionalwarp: (u, v, c) => {
    // the picture is pulled along the diagonal (-1, 1) while the edge sweeps across
    const dx = -0.5;
    const dy = 0.5;
    const m = 1 - smooth(-0.5, 0, dx * (u - 0.5) + dy * (v - 0.5) - c.progress * 1.5);
    return mix(c.from(clamp(0.5 + (u - 0.5) * (1 - m)), clamp(0.5 + (v - 0.5) * (1 - m))), c.to(clamp(0.5 + (u - 0.5) * m), clamp(0.5 + (v - 0.5) * m)), m);
  },
  ripple: (u, v, c) => {
    const p = c.progress;
    const dx = u - 0.5;
    const dy = v - 0.5;
    const d = Math.hypot(dx, dy);
    const wave = Math.sin(d * 40 - p * 20) * 0.02 * Math.sin(p * Math.PI);
    const k = d > 0 ? wave / d : 0;
    const x = clamp(u + dx * k * 8);
    const y = clamp(v + dy * k * 8);
    return mix(c.from(x, y), c.to(x, y), p);
  },
  waterdrop: (u, v, c) => {
    const p = c.progress;
    const dx = u - 0.5;
    const dy = v - 0.5;
    const d = Math.hypot(dx, dy);
    const wave = d > 0 ? Math.sin(d * 30 - p * 30) * 0.03 * (1 - p) : 0;
    const x = clamp(u + (dx / (d || 1)) * wave);
    const y = clamp(v + (dy / (d || 1)) * wave);
    return mix(c.from(x, y), c.to(x, y), p);
  },
  bowtiehorizontal: (u, v, c) => {
    const edge = c.progress * 0.5;
    const inside = Math.abs(v - 0.5) < edge * (1 - Math.abs(u - 0.5) * 1.4) + (c.progress > 0.9 ? 1 : 0);
    return inside || c.progress >= 1 ? c.to(u, v) : c.from(u, v);
  },
  bowtievertical: (u, v, c) => {
    const edge = c.progress * 0.5;
    const inside = Math.abs(u - 0.5) < edge * (1 - Math.abs(v - 0.5) * 1.4) + (c.progress > 0.9 ? 1 : 0);
    return inside || c.progress >= 1 ? c.to(u, v) : c.from(u, v);
  },
  pinwheel: (u, v, c) => {
    const a = Math.atan2(v - 0.5, u - 0.5) + Math.PI;
    const arms = 4;
    const t = (a * arms) / (2 * Math.PI);
    const within = t - Math.floor(t);
    return within < c.progress ? c.to(u, v) : c.from(u, v);
  },
  mosaic: (u, v, c) => {
    const n = 12;
    const cu = Math.floor(u * n);
    const cv = Math.floor(v * n * (1 / c.ratio));
    const delay = hash(cu, cv) * 0.5;
    const t = clamp((c.progress - delay) / 0.5);
    return t > 0.5 ? c.to(u, v) : c.from(u, v);
  },
  hexagonalize: (u, v, c) => {
    const steps = Math.max(2, Math.round(2 + 40 * Math.sin(c.progress * Math.PI)));
    const size = 1 / steps;
    const pu = (Math.floor(u / size) + 0.5) * size;
    const pv = (Math.floor(v / (size * 0.866)) + 0.5) * size * 0.866;
    return mix(c.from(clamp(pu), clamp(pv)), c.to(clamp(pu), clamp(pv)), c.progress);
  },
  randomsquares: (u, v, c) => {
    const n = 10;
    const r = hash(Math.floor(u * n), Math.floor(v * n));
    return r < c.progress ? c.to(u, v) : c.from(u, v);
  },
  luminance: (u, v, c) => {
    const l = luma(c.to(u, v));
    return l < c.progress ? c.to(u, v) : c.from(u, v);
  },
};

export const TRANSITION_NAMES = Object.keys(RULES).concat(['dummy', 'cut']).sort();

/** The curve a transition runs on unless the description names another (editly: the directional ones ease out with a strong start, the rest are linear). */
export function defaultEasing(name: string): string {
  return name.startsWith('directional-') ? 'ease-out-expo' : 'linear';
}

export function hasRule(name: string): boolean {
  return name in RULES;
}

/** The colour at (u, v). A name with no rule is a plain cut half way (a "dummy" transition still lets the sound cross-fade). */
export function transitionColor(name: string, u: number, v: number, c: TransitionContext): Rgba {
  if (c.progress <= 0) return c.from(u, v);
  if (c.progress >= 1) return c.to(u, v);
  const rule = RULES[name];
  if (!rule) return c.progress > 0.5 ? c.to(u, v) : c.from(u, v);
  return rule(u, v, c);
}

