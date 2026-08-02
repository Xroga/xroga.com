import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CENTER,
  LEAF,
  LEAF_COUNT,
  LEAF_PATH,
  VIEW_BOX,
  leafOpacity,
  leafTransforms,
} from './leafLoader';

test('eight petals ring the circle', () => {
  const petals = leafTransforms();
  assert.equal(petals.length, LEAF_COUNT);
  assert.equal(petals.length, 8);
});

test('petals are spaced evenly, with no duplicate or wrapped angle', () => {
  const angles = leafTransforms().map((p) => p.angle);
  assert.deepEqual(angles, [0, 45, 90, 135, 180, 225, 270, 315]);
  // A petal at 360 would sit on top of the one at 0 and dim the ring unevenly.
  assert.ok(angles.every((a) => a >= 0 && a < 360));
  assert.equal(new Set(angles).size, angles.length);
});

test('every petal rotates about the icon centre', () => {
  for (const petal of leafTransforms()) {
    assert.match(petal.transform, new RegExp(`rotate\\(${petal.angle} ${CENTER} ${CENTER}\\)`));
  }
});

test('the box is square and the centre is its midpoint', () => {
  assert.equal(CENTER, VIEW_BOX / 2);
  assert.equal(VIEW_BOX, 24);
});

test('the opacity ramp runs from full to faint, monotonically', () => {
  const values = leafTransforms().map((p) => p.opacity);
  assert.equal(values[0], 1);
  assert.ok(values[values.length - 1] < 0.3);
  for (let i = 1; i < values.length; i += 1) {
    assert.ok(values[i] < values[i - 1], `petal ${i} should be fainter than ${i - 1}`);
  }
});

test('opacity never leaves the legal range', () => {
  for (const count of [1, 2, 8, 16]) {
    for (let i = 0; i < count; i += 1) {
      const o = leafOpacity(i, count);
      assert.ok(o > 0 && o <= 1, `count ${count}, index ${i} produced ${o}`);
    }
  }
});

test('a single petal is fully opaque rather than dividing by zero', () => {
  assert.equal(leafOpacity(0, 1), 1);
});

test('the leaf is a closed path, so it fills rather than strokes', () => {
  assert.ok(LEAF_PATH.trim().endsWith('Z'));
  assert.ok(LEAF_PATH.startsWith('M0 0'));
});

test('the leaf tip leans clockwise, which is what points it along the rotation', () => {
  // A symmetric leaf would put the tip at x=0 and read as a radial spoke rather
  // than a swept petal.
  assert.ok(LEAF.tip.x > 0, 'the tip should lean clockwise, matching the rotation direction');
  assert.ok(LEAF.tip.y < 0, 'the tip should point outward from the centre');
});

test('the leading edge bulges further than the trailing edge', () => {
  // This asymmetry is the whole reason the shape reads as organic rather than as
  // a symmetric petal; if it were ever flattened the loader would look generic.
  const lead = Math.max(...LEAF.lead.map((p) => Math.abs(p.x)));
  const trail = Math.max(...LEAF.trail.map((p) => Math.abs(p.x)));
  assert.ok(lead > trail, `leading ${lead} should exceed trailing ${trail}`);
});

test('the built path matches the named control points', () => {
  // Guards against the path string and the numbers drifting apart.
  assert.ok(LEAF_PATH.includes(`${LEAF.tip.x} ${LEAF.tip.y}`));
  assert.ok(LEAF_PATH.includes(`${LEAF.lead[0].x} ${LEAF.lead[0].y}`));
});

test('the geometry is pure, so server and client render identical markup', () => {
  // Hydration safety: two calls must be deep-equal. Anything time- or
  // random-derived in here would mismatch on every load.
  assert.deepEqual(leafTransforms(), leafTransforms());
});

test('petal count is configurable without breaking the spacing invariant', () => {
  const six = leafTransforms(6);
  assert.equal(six.length, 6);
  assert.deepEqual(six.map((p) => p.angle), [0, 60, 120, 180, 240, 300]);
});
