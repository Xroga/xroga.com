/**
 * Geometry for the leaf preloader.
 *
 * Kept out of the component so the shape maths is testable and so the numbers have
 * one home. Everything is expressed in a 24×24 user-space box with the centre at
 * (12, 12), which is the same box every other icon on the chatbar uses — that is
 * what lets the loader swap in for the send glyph without the button resizing.
 */

/** Petal count. Eight reads as a ring at 16px and still resolves at 24px. */
export const LEAF_COUNT = 8;

/** The icon box. Square, centred, matching the send glyph. */
export const VIEW_BOX = 24;
export const CENTER = VIEW_BOX / 2;

/**
 * One leaf, in local coordinates: base at the origin, tip outward along -Y.
 *
 * Asymmetric on purpose. The leading edge (+X) bulges further than the trailing
 * edge and the tip lands off-axis, so once the petal is rotated into place that
 * lean follows the tangent — every leaf sweeps into the direction of travel rather
 * than standing up radially like a clock hand.
 *
 * The control points are named numbers rather than a hand-written path string.
 * Both the shape and its tests read the same values, so a tweak cannot silently
 * disagree with what the tests believe the shape is, and no one has to parse SVG
 * path syntax to assert on the geometry.
 *
 * Cubic curves rather than an ellipse or a rounded rect: a leaf needs a point at
 * one end and a taper at the other, which no primitive gives you.
 */
export const LEAF = {
  /** Leading edge control points, base → tip. */
  lead: [
    { x: 1.9, y: -1.2 },
    { x: 2.2, y: -4.3 },
  ],
  /** The tip. `x > 0` is what makes the petal lean clockwise. */
  tip: { x: 0.7, y: -6.2 },
  /** Trailing edge control points, tip → base. */
  trail: [
    { x: -1.0, y: -4.3 },
    { x: -1.6, y: -1.2 },
  ],
} as const;

export const LEAF_PATH = [
  'M0 0',
  `C${LEAF.lead[0].x} ${LEAF.lead[0].y} ${LEAF.lead[1].x} ${LEAF.lead[1].y} ${LEAF.tip.x} ${LEAF.tip.y}`,
  `C${LEAF.trail[0].x} ${LEAF.trail[0].y} ${LEAF.trail[1].x} ${LEAF.trail[1].y} 0 0`,
  'Z',
].join('');

/**
 * Distance from the centre to a leaf's base.
 *
 * Tuned against the rendered result, not picked on paper. At a small inset the
 * eight bases converge and the loader reads as a filled asterisk instead of a ring
 * of leaves — the individual petals stop being legible below about 20px. Holding
 * the bases off the centre opens a gap in the middle and puts clear air between
 * neighbouring petals, which is what keeps the shape readable down to 16px.
 */
export const LEAF_INSET = 3.4;

export type LeafTransform = {
  /** 0-based petal index, in clockwise order from twelve o'clock. */
  readonly index: number;
  /** Degrees clockwise from twelve o'clock. */
  readonly angle: number;
  /** Ready-to-use SVG transform for the petal. */
  readonly transform: string;
  /** Resting opacity, forming the trail that makes rotation legible. */
  readonly opacity: number;
};

/**
 * The opacity ramp.
 *
 * The leading petal is opaque and the trail fades to `MIN_OPACITY`. This is a
 * *static* ramp on a rotating group rather than eight staggered animations: with
 * eight independently pulsing petals the loop has a seam every time the phases
 * realign, and it costs eight animations instead of one. A fixed ramp under a
 * linear rotation is seamless by construction — after 45° the picture is
 * identical, so there is nothing to jump.
 */
const MIN_OPACITY = 0.22;
const MAX_OPACITY = 1;

export function leafOpacity(index: number, count: number = LEAF_COUNT): number {
  if (count <= 1) return MAX_OPACITY;
  const t = index / (count - 1);
  return Number((MAX_OPACITY - (MAX_OPACITY - MIN_OPACITY) * t).toFixed(3));
}

/**
 * Places every petal around the ring.
 *
 * Rotation is applied about the box centre and the petal is then pushed outward,
 * so a single path definition serves all eight — no per-petal path strings, and
 * the browser rasterises one shape at any DPI. That is also why the loader stays
 * crisp on a high-DPI display: it is vector geometry, not a scaled bitmap.
 */
export function leafTransforms(count: number = LEAF_COUNT): readonly LeafTransform[] {
  const petals: LeafTransform[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = (360 / count) * index;
    petals.push({
      index,
      angle,
      transform: `rotate(${angle} ${CENTER} ${CENTER}) translate(${CENTER} ${CENTER - LEAF_INSET})`,
      opacity: leafOpacity(index, count),
    });
  }
  return petals;
}
