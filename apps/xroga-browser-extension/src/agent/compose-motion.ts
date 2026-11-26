// Motion of a layer over its own run: keyframes on position, scale, rotation and opacity, and entrance and exit presets (fade, slide, zoom, pop). Pure functions over numbers.
// Both follow what cutline does (MIT: keyframed properties with easings, and entrance and exit presets evaluated from the time inside the clip rather than baked into keyframes, so
// they stay attached to the edges of the clip); the code is written fresh and tested alone.
export type MotionProp = 'x' | 'y' | 'scale' | 'rotation' | 'opacity';
export const MOTION_PROPS: readonly MotionProp[] = ['x', 'y', 'scale', 'rotation', 'opacity'];
export type KeyEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'hold';
export interface Keyframe {
  /** Seconds into the layer's run. */
  time: number;
  value: number;
  /** The curve from this keyframe to the next. */
  easing: KeyEasing;
}
export type Keyframes = Partial<Record<MotionProp, Keyframe[]>>;

export const PRESETS = ['fade', 'slide-left', 'slide-right', 'slide-up', 'slide-down', 'zoom', 'pop'] as const;
export type Preset = (typeof PRESETS)[number];
export interface PresetUse {
  preset: Preset;
  duration: number;
}

/** What a layer is moved by, on top of where it sits: shifts as fractions of the frame, a scale factor, degrees, and an opacity factor. */
export interface Motion {
  dx: number;
  dy: number;
  scale: number;
  rotation: number;
  opacity: number;
}
export const NO_MOTION: Readonly<Motion> = Object.freeze({ dx: 0, dy: 0, scale: 1, rotation: 0, opacity: 1 });

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));

export function keyEase(easing: KeyEasing, p: number): number {
  switch (easing) {
    case 'linear':
      return p;
    case 'ease-in':
      return p * p;
    case 'ease-out':
      return 1 - (1 - p) * (1 - p);
    case 'ease-in-out':
      return p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p);
    case 'hold':
      return 0;
  }
}

/** The value of one property at `t`, from keyframes sorted by time. Before the first it is the first value, after the last the last. */
export function evaluateKeyframes(list: readonly Keyframe[], t: number): number {
  const first = list[0];
  if (!first) throw new RangeError('keyframes need at least one entry');
  if (t <= first.time) return first.value;
  for (let i = 0; i < list.length - 1; i++) {
    const a = list[i]!;
    const b = list[i + 1]!;
    if (t < b.time) return a.value + (b.value - a.value) * keyEase(a.easing, (t - a.time) / (b.time - a.time));
  }
  return list[list.length - 1]!.value;
}

/** easeOutBack: overshoots 1 by about 7% and settles. */
export function backOut(p: number): number {
  const c1 = 1.70158;
  const q = p - 1;
  return 1 + (c1 + 1) * q * q * q + c1 * q * q;
}

/** How far a slide travels, as a fraction of the frame; where a zoom and a pop start from. */
export const SLIDE_DISTANCE = 0.25;
export const ZOOM_FROM = 0.5;
export const POP_FROM = 0.3;

const SLIDE: Partial<Record<Preset, [number, number]>> = { 'slide-left': [1, 0], 'slide-right': [-1, 0], 'slide-up': [0, 1], 'slide-down': [0, -1] };

/** Pose of one preset at visibility `p` (0 off, 1 at rest). `edge` picks the side of a slide: coming in from the preset's side, leaving the other way. */
export function presetPose(preset: Preset, p: number, edge: 'in' | 'out'): Motion {
  const v = clamp(p);
  const e = keyEase('ease-out', v);
  const pose: Motion = { ...NO_MOTION, opacity: e };
  const dir = SLIDE[preset];
  if (dir) {
    const sign = edge === 'in' ? 1 : -1;
    pose.dx = sign * dir[0] * (1 - e) * SLIDE_DISTANCE;
    pose.dy = sign * dir[1] * (1 - e) * SLIDE_DISTANCE;
  } else if (preset === 'zoom') pose.scale = ZOOM_FROM + (1 - ZOOM_FROM) * e;
  else if (preset === 'pop') pose.scale = POP_FROM + (1 - POP_FROM) * backOut(v);
  return pose;
}

/** The motion of a layer at `local` seconds into a run of `span` seconds: keyframes, then the entrance and the exit combined (shifts add, scale and opacity multiply). */
export function motionAt(layer: { keyframes?: Keyframes; animIn?: PresetUse; animOut?: PresetUse }, local: number, span: number): Motion {
  const t = clamp(local, 0, span);
  const out: Motion = { ...NO_MOTION };
  const k = layer.keyframes;
  if (k) {
    const get = (prop: MotionProp, base: number) => (k[prop]?.length ? evaluateKeyframes(k[prop]!, t) : base);
    out.dx = get('x', 0);
    out.dy = get('y', 0);
    out.scale = get('scale', 1);
    out.rotation = get('rotation', 0);
    out.opacity = get('opacity', 1);
  }
  const parts: Motion[] = [];
  if (layer.animIn && t < layer.animIn.duration) parts.push(presetPose(layer.animIn.preset, t / layer.animIn.duration, 'in'));
  if (layer.animOut && span - t < layer.animOut.duration) parts.push(presetPose(layer.animOut.preset, (span - t) / layer.animOut.duration, 'out'));
  for (const p of parts) {
    out.dx += p.dx;
    out.dy += p.dy;
    out.scale *= p.scale;
    out.rotation += p.rotation;
    out.opacity *= p.opacity;
  }
  return out;
}

/** Keyframes from the description's friendly form: a list of { at, x?, y?, scale?, rotation?, opacity?, easing? }, one property list each, sorted by time. Anything else is ignored. */
export function keyframesFromList(raw: unknown, span: number): Keyframes | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: Keyframes = {};
  const easings: KeyEasing[] = ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'hold'];
  for (const item of raw.slice(0, 40)) {
    const e = (item ?? {}) as Record<string, unknown>;
    const at = typeof e.at === 'number' && Number.isFinite(e.at) ? clamp(e.at, 0, Math.max(span, 0.001) * 1000) : undefined;
    if (at === undefined) continue;
    const easing = easings.includes(e.easing as KeyEasing) ? (e.easing as KeyEasing) : 'ease-in-out';
    for (const prop of MOTION_PROPS) {
      const v = e[prop];
      if (typeof v === 'number' && Number.isFinite(v)) (out[prop] ??= []).push({ time: at, value: clamp(v, -10, prop === 'rotation' ? 3600 : 10), easing });
    }
  }
  let any = false;
  for (const prop of MOTION_PROPS) {
    const list = out[prop];
    if (list?.length) {
      list.sort((a, b) => a.time - b.time);
      any = true;
    }
  }
  return any ? out : undefined;
}

export interface ClickPoint {
  /** Seconds into the layer (the recording). */
  t: number;
  /** Where in the picture, as fractions of its width and height (0 to 1). */
  x: number;
  y: number;
}
export interface ZoomOptions {
  /** How far to zoom in. Default 1.8. */
  scale?: number;
  /** Seconds to zoom in before the click. Default 0.5. */
  lead?: number;
  /** Seconds to stay zoomed after the click. Default 1.2. */
  hold?: number;
  /** Seconds to zoom back out. Default 0.5. */
  out?: number;
  /** Clicks closer together than this share one zoom. Default 1.5 s. */
  merge?: number;
}

/**
 * Keyframes that zoom in on each click of a recording and back out afterwards (the idea of Panoptik, AGPL, to centre a zoom on the recorded mouse clicks: concept only, written fresh).
 * Clicks close in time share one zoom that moves from point to point; the shift keeps the clicked point in the middle of the frame as far as the zoom allows.
 */
export function zoomKeyframes(clicks: readonly ClickPoint[], options: ZoomOptions = {}): Keyframes | undefined {
  const scale = clamp(options.scale ?? 1.8, 1.05, 4);
  const lead = Math.max(0.05, options.lead ?? 0.5);
  const hold = Math.max(0.1, options.hold ?? 1.2);
  const out = Math.max(0.1, options.out ?? 0.5);
  const merge = options.merge ?? 1.5;
  const sorted = [...clicks].filter(c => Number.isFinite(c.t) && c.t >= 0).sort((a, b) => a.t - b.t);
  if (!sorted.length) return undefined;
  // groups of clicks that follow each other closely
  const groups: ClickPoint[][] = [];
  for (const c of sorted) {
    const last = groups[groups.length - 1];
    if (last && c.t - last[last.length - 1]!.t <= merge) last.push(c);
    else groups.push([c]);
  }
  const shift = (c: ClickPoint) => {
    // the layer turns about its middle: to bring the point to the middle, move by (0.5 - p) times the scale, but never so far that an edge shows
    const limit = (scale - 1) / 2;
    return { dx: clamp((0.5 - c.x) * scale, -limit, limit), dy: clamp((0.5 - c.y) * scale, -limit, limit) };
  };
  const sc: Keyframe[] = [];
  const x: Keyframe[] = [];
  const y: Keyframe[] = [];
  const push = (time: number, s: number, dx: number, dy: number, easing: KeyEasing = 'ease-in-out') => {
    for (const [list, v] of [[sc, s], [x, dx], [y, dy]] as const) {
      const prev = list[list.length - 1];
      if (prev && time <= prev.time + 1e-6) list[list.length - 1] = { time: prev.time, value: v, easing };
      else list.push({ time, value: v, easing });
    }
  };
  for (const g of groups) {
    const first = g[0]!;
    const start = Math.max(0, first.t - lead);
    const a = shift(first);
    push(start, 1, 0, 0);
    push(first.t, scale, a.dx, a.dy);
    for (const c of g.slice(1)) {
      const s = shift(c);
      push(Math.max(c.t - 0.35, first.t + 1e-3), scale, s.dx, s.dy);
      push(c.t, scale, s.dx, s.dy);
    }
    const lastClick = g[g.length - 1]!;
    const lastShift = shift(lastClick);
    push(lastClick.t + hold, scale, lastShift.dx, lastShift.dy);
    push(lastClick.t + hold + out, 1, 0, 0);
  }
  return { scale: sc, x, y };
}
