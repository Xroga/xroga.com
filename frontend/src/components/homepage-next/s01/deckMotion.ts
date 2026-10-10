/**
 * S01 deck motion: one pure function from section progress to every visible value.
 *
 * Nothing in the deck keeps its own clock. The stage reads `sectionProgress` (0 to 1 across the pinned track) and
 * `deckFrame` returns each card's pose, the flip angle, the vignette step and the heading state, so a fast scroll,
 * a reverse scroll or a direct jump (refresh, anchor) always lands on a valid, complete state.
 *
 * Chapter A (cards 01 to 04) owns progress 0 to 0.5 and chapter B (05 to 08) owns 0.5 to 1, each on a local 0 to 1
 * timeline `u`. They overlap through a short crossover (A recedes while B arrives), so there is no empty frame.
 */
import { CAPABILITIES } from './capabilities.data';

/** Extra scroll distance of the pinned stage, in viewport heights (two chapters of about 2.2 each). */
export const TRACK_VH = 4.4;
/** Chapter A owns [0, SPLIT), chapter B [SPLIT, 1]. */
export const SPLIT = 0.5;

/** Chapter-local schedule (fractions of a chapter). Starting targets from the brief, tuned on review. */
export const SCHEDULE = {
  stackRise: [0, 0.12],
  fan: [0.12, 0.32],
  flipStart: 0.32,
  flipStagger: 0.052,
  flipLength: 0.13,
  vignetteStart: 0.455,
  vignetteLength: 0.2,
  hold: [0.79, 0.885],
  gather: [0.885, 0.965],
  exit: [0.97, 1.08],
  enter: [-0.09, 0.08],
  heading: [0.1, 0.26],
} as const;

/** Chapter B turns 06 first, then 05, 07, 08; at rest it still reads 05, 06, 07, 08 from left to right. */
export const B_FLIP_ORDER = [1, 0, 2, 3] as const;

/** Final resting tilt of each slot: a physical row, never perfectly flat. */
const REST_RZ = [-1.1, 0.5, -0.5, 1.1];

export interface DeckLayout {
  /** viewport */
  vw: number;
  vh: number;
  /** card size */
  W: number;
  H: number;
  gap: number;
  /** distance from the stage top to the row centre */
  rowY: number;
  /** how far below its row position the deck waits during the intro */
  introDrop: number;
  /** top inset that keeps everything clear of the sticky site header */
  navInset: number;
}

export type DeckMode = 'deck' | 'carousel';

export const NAV_INSET = 92;
const CHAPTER_ROW = 40;
const BOTTOM = 28;
const RATIO = 1.55;
const MIN_H = 468;

/** Computed fit: card size from the viewport, never a transform-scaled layout. */
export function computeLayout(vw: number, vh: number): DeckLayout & { mode: DeckMode } {
  const gap = vw >= 1360 ? 22 : 16;
  const availW = Math.min(vw - 112, 1280);
  let W = Math.min(290, Math.floor((availW - 3 * gap) / 4));
  const availH = vh - NAV_INSET - CHAPTER_ROW - BOTTOM;
  // narrower cards may grow taller (up to MIN_H) so the demo window keeps room to read
  const H = Math.min(Math.max(Math.round(W * RATIO), MIN_H), availH);
  if (H < Math.round(W * RATIO)) W = Math.round(H / RATIO);
  const rowY = NAV_INSET + CHAPTER_ROW + availH / 2;
  const headingBottom = NAV_INSET + 152;
  const introDrop = clamp(headingBottom + 40 - (rowY - H / 2), 120, H * 0.62);
  const mode: DeckMode = vw >= 1100 && vh >= 620 && W >= 236 ? 'deck' : 'carousel';
  return { vw, vh, W, H, gap, rowY, introDrop, navInset: NAV_INSET, mode };
}

export interface CardPose {
  x: number;
  y: number;
  z: number;
  rx: number;
  /** rotateY of the card body, including the flip */
  ry: number;
  rz: number;
  s: number;
  o: number;
  /** 0 shows the patterned back, 1 the front */
  flip: number;
  /** 0 to 1, how far the card is lifted off the table (drives the contact shadow) */
  lift: number;
  /** vignette step: 0 setup still, 1 to 4 the four demo stages (4 holds the result) */
  step: number;
  /** front face fully turned and at rest: hover and focus effects are allowed */
  readable: boolean;
}

export interface DeckFrame {
  p: number;
  chapter: 'A' | 'B';
  /** 0 heading fully present, 1 heading gone (chapter row takes over) */
  heading: number;
  /** 0 chapter A label, 1 chapter B label */
  chapterMix: number;
  /** progress through the active chapter, for the chapter indicator */
  chapterProgress: number;
  cards: CardPose[];
}

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const seg = (u: number, a: number, b: number) => clamp((u - a) / (b - a));

/** cubic-bezier(x1, y1, x2, y2) as a function of x, solved with Newton steps and a bisection fallback. */
export function bezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    const X = clamp(x);
    let t = X;
    for (let n = 0; n < 6; n++) {
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= (sx(t) - X) / d;
    }
    if (t < 0 || t > 1 || Math.abs(sx(t) - X) > 1e-4) {
      let lo = 0, hi = 1;
      t = X;
      for (let n = 0; n < 30; n++) {
        if (sx(t) < X) lo = t; else hi = t;
        t = (lo + hi) / 2;
      }
    }
    return sy(t);
  };
}

/** Asymmetric travel: a firm start and a long, deliberate deceleration. No overshoot, no bounce. */
export const travel = bezier(0.55, 0, 0.16, 1);

/** Smooth in-out for flips: velocity is zero at both ends, so a card never snaps at edge-on. */
export const turn = (t: number) => {
  const x = clamp(t);
  return x * x * x * (x * (6 * x - 15) + 10);
};

type Pose = Omit<CardPose, 'flip' | 'lift' | 'step' | 'readable'>;
const mix = (a: Pose, b: Pose, t: number): Pose => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  z: lerp(a.z, b.z, t),
  rx: lerp(a.rx, b.rx, t),
  ry: lerp(a.ry, b.ry, t),
  rz: lerp(a.rz, b.rz, t),
  s: lerp(a.s, b.s, t),
  o: lerp(a.o, b.o, t),
});

function stepOf(vt: number): number {
  if (vt <= 0) return 0;
  if (vt < 0.22) return 1;
  if (vt < 0.45) return 2;
  if (vt < 0.7) return 3;
  return 4;
}

function restPose(i: number, L: DeckLayout): Pose {
  const c = i - 1.5;
  return { x: c * (L.W + L.gap), y: 0, z: -i * 0.5, rx: 2.5, ry: c * 2.4, rz: REST_RZ[i], s: 1, o: 1 };
}

/** Chapter A: a deck rises under the heading, fans with outer cards tilting out, turns 01 to 04 in order. */
function poseA(i: number, u: number, L: DeckLayout): CardPose {
  const c = i - 1.5;
  const S = SCHEDULE;
  const stack: Pose = { x: -33 + i * 22, y: L.introDrop - i * 7, z: -i * 14, rx: 4, ry: 0, rz: -5 + i * 3.4, s: 0.9, o: 1 };
  const risen: Pose = { ...stack, y: L.introDrop * 0.45 - i * 7 };
  const fan: Pose = { x: c * L.W * 0.94, y: c * c * 9 + 10, z: -Math.abs(c) * 16 - i * 2, rx: 3, ry: -c * 7, rz: c * 6.4, s: 0.9, o: 1 };
  const rest = restPose(i, L);

  let pose = mix(stack, risen, travel(seg(u, S.stackRise[0], S.stackRise[1])));
  // inner cards travel slightly later than the outer ones
  const innerDelay = Math.abs(c) < 1 ? 0.035 : 0;
  pose = mix(pose, fan, travel(seg(u, S.fan[0] + innerDelay, S.fan[1])));

  const fs = S.flipStart + i * S.flipStagger;
  const f = turn(seg(u, fs, fs + S.flipLength));
  const move = travel(seg(u, fs - 0.02, fs + S.flipLength + 0.03));
  pose = mix(pose, rest, move);
  pose.ry += 180 * f;
  pose.z += Math.sin(Math.PI * f) * 84;
  pose.rx += Math.sin(Math.PI * f) * 3;

  // collect: 04 first, back to the patterned side, then the gathered deck recedes upward into depth
  const g = travel(seg(u, S.gather[0] + (3 - i) * 0.012, S.gather[1] + (3 - i) * 0.012));
  const back = turn(seg(u, S.gather[0] + (3 - i) * 0.012, S.gather[1] + (3 - i) * 0.012));
  const gathered: Pose = { x: c * 16, y: -10 - i * 4, z: -i * 12, rx: 4, ry: 180 + 0, rz: -3 + i * 2, s: 0.94, o: 1 };
  const ryBefore = pose.ry;
  pose = mix(pose, gathered, g);
  pose.ry = lerp(ryBefore, 180, g) + 180 * back;
  pose.z += Math.sin(Math.PI * back) * 40;
  const e = travel(seg(u, S.exit[0], S.exit[1]));
  pose.y -= L.H * 0.55 * e;
  pose.z -= 320 * e;
  pose.rx += 14 * e;
  pose.s *= 1 - 0.18 * e;
  pose.o = 1 - seg(u, 0.99, S.exit[1]);

  const flip = clamp(f - back);
  const vs = S.vignetteStart + i * S.flipStagger;
  const vt = seg(u, vs, vs + S.vignetteLength);
  return {
    ...pose,
    flip,
    lift: clamp(Math.sin(Math.PI * f) + Math.sin(Math.PI * back) * 0.6 + (1 - travel(seg(u, S.fan[0], S.fan[1]))) * 0.15),
    step: back > 0 ? 4 : stepOf(vt),
    readable: f >= 1 && back <= 0,
  };
}

/** Chapter B: a deck arrives from the right, fans the other way with an upward arch, turns 06, 05, 07, 08. */
function poseB(i: number, v: number, L: DeckLayout): CardPose {
  const c = i - 1.5;
  const S = SCHEDULE;
  const k = B_FLIP_ORDER[i];
  const off: Pose = { x: L.vw / 2 + L.W * 0.9 + i * 18, y: L.H * 0.2, z: -i * 14, rx: 4, ry: 0, rz: 16, s: 0.92, o: 0 };
  const stack: Pose = { x: L.W * 0.4 + 30 - i * 20, y: 8 + i * 5, z: -i * 14, rx: 4, ry: 0, rz: 5 - i * 3.2, s: 0.92, o: 1 };
  const fan: Pose = { x: c * L.W * 0.94, y: -c * c * 8 - 4, z: -Math.abs(c) * 14 - i * 2, rx: 3, ry: c * 7, rz: -c * 5.6, s: 0.9, o: 1 };
  const rest = restPose(i, L);

  let pose = mix(off, stack, travel(seg(v, S.enter[0] + i * 0.012, S.enter[1])));
  pose.o = seg(v, S.enter[0] + i * 0.012, S.enter[0] + i * 0.012 + 0.05);
  // here the outer cards are the late ones, so the spread reads differently from chapter A
  const outerDelay = Math.abs(c) > 1 ? 0.03 : 0;
  pose = mix(pose, fan, travel(seg(v, 0.1 + outerDelay, 0.3)));

  const fs = 0.3 + k * S.flipStagger;
  const f = turn(seg(v, fs, fs + S.flipLength));
  const move = travel(seg(v, fs - 0.02, fs + S.flipLength + 0.03));
  pose = mix(pose, rest, move);
  pose.ry -= 180 * f; // the second chapter turns the other way
  pose.z += Math.sin(Math.PI * f) * 84;
  pose.rx += Math.sin(Math.PI * f) * 3;

  const vs = 0.435 + k * S.flipStagger;
  const vt = seg(v, vs, vs + S.vignetteLength);
  return {
    ...pose,
    flip: f,
    lift: clamp(Math.sin(Math.PI * f) + (1 - travel(seg(v, 0.1, 0.3))) * 0.15),
    step: stepOf(vt),
    readable: f >= 1,
  };
}

export function deckFrame(progress: number, L: DeckLayout): DeckFrame {
  const p = clamp(progress);
  const u = p / SPLIT;
  const v = (p - SPLIT) / (1 - SPLIT);
  const cards = CAPABILITIES.map((cap, idx) => (cap.chapter === 'A' ? poseA(idx, u, L) : poseB(idx - 4, v, L)));
  return {
    p,
    chapter: p < SPLIT ? 'A' : 'B',
    heading: turn(seg(u, SCHEDULE.heading[0], SCHEDULE.heading[1])),
    chapterMix: seg(p, SPLIT - 0.02, SPLIT + 0.03),
    chapterProgress: p < SPLIT ? clamp(u) : clamp(v),
    cards,
  };
}

/** Section progress at which a chapter rests readable (all four fronts turned, demos finished). */
export const restProgress = (chapter: 'A' | 'B') => (chapter === 'A' ? 0.84 * SPLIT : SPLIT + 0.94 * (1 - SPLIT));
