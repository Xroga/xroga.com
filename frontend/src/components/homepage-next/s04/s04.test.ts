import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { BEATS, CAPTURE_MS, COPY, DESTS, PHASES, RELEASE, SECOND_CAPTURE_DELAY, STEPS, STORY, isPhase, reached, stepIndex } from './publish';
import { CROP, NATURAL, PANEL } from './publish';
import { STORE_MARKS_CLEARED } from './storeMarks';

const dir = new URL('./', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, dir), 'utf8');
const sources = readdirSync(dir)
  .filter((f) => /\.(tsx?|css)$/.test(f) && !f.endsWith('.test.ts'))
  .map((f) => [f, read(f)] as const);
// the disclaimer is the one place these words appear, and only negated
const strings = JSON.stringify({ COPY: { ...COPY, note: '' }, STORY, RELEASE });
const main = read('S04Publish.tsx');

test('each destination has its own scene: every phase in order, inside a 8 to 11 second budget', () => {
  const order = PHASES.filter((p) => p !== 'idle') as Exclude<(typeof PHASES)[number], 'idle'>[];
  const shapes = new Set<string>();
  for (const d of DESTS) {
    const B = BEATS[d];
    for (let i = 1; i < order.length; i++) assert.ok(B[order[i]] > B[order[i - 1]], `${d}: ${order[i]} after ${order[i - 1]}`);
    assert.ok(B.end > B.ready);
    assert.ok(B.end >= 8000 && B.end <= 11000, `${d} ends at ${B.end}`);
    // the capture lands well before the listing starts composing around it
    assert.ok(B.compose - B.extract >= CAPTURE_MS + 300, `${d}: capture has room to land`);
    shapes.add(order.map((p) => B[p]).join(','));
  }
  assert.equal(shapes.size, DESTS.length, 'no two destinations share a timeline');
  // MerchantLens's second capture (panel → promo tile) also lands before composition
  assert.ok(BEATS.chrome.extract + SECOND_CAPTURE_DELAY + CAPTURE_MS < BEATS.chrome.compose);
  assert.ok(reached('ready', 'extract') && !reached('inspect', 'compose'));
  assert.ok(isPhase('package') && !isPhase('live'));
});

test('the step map covers use, test, verify, capture, package and review, in order', () => {
  assert.deepEqual(
    STEPS.map((s) => s.label),
    ['Use', 'Test', 'Verify', 'Capture', 'Package', 'Review'],
  );
  assert.equal(stepIndex('idle'), -1);
  assert.equal(stepIndex('ready'), STEPS.length - 1);
  for (let i = 1; i < STEPS.length; i++) assert.ok(PHASES.indexOf(STEPS[i].phase) > PHASES.indexOf(STEPS[i - 1].phase));
});

test('captured regions sit inside each product and match the store aspect ratio', () => {
  const aspect = { ios: 1320 / 2868, android: 1024 / 500 } as const;
  for (const d of DESTS) {
    const C = CROP[d];
    const N = NATURAL[d];
    assert.ok(C.x >= 0 && C.y >= 0 && C.x + C.w <= N.w && C.y + C.h <= N.h, `${d} crop inside the product`);
  }
  for (const d of ['ios', 'android'] as const) assert.ok(Math.abs(CROP[d].w / CROP[d].h - aspect[d]) < 0.02, `${d} crop aspect`);
  assert.ok(PANEL.x + PANEL.w <= NATURAL.chrome.w && PANEL.y + PANEL.h <= NATURAL.chrome.h);
});

test('copy follows the brief, with no em or en dashes', () => {
  assert.equal(COPY.title, 'Build anywhere. Publish with Xroga.');
  assert.equal(COPY.cta, 'Prepare a release in Xroga');
  assert.deepEqual(DESTS.map((d) => STORY[d].storeName), ['App Store', 'Google Play', 'Chrome Web Store']);
  assert.deepEqual(DESTS.map((d) => STORY[d].product), ['Arcset', 'Ridgeline', 'MerchantLens']);
  assert.doesNotMatch(strings, /[–—]/);
});

test('nothing is shown as submitted, approved, live, published or paid, and no price is invented', () => {
  assert.doesNotMatch(strings, /\b(submitted|approved|is live|now live|published|paid|charged \$|\$\d)/i);
  assert.match(COPY.note, /nothing is submitted or charged/);
  assert.equal(RELEASE.price, 'Price shown before payment');
  assert.doesNotMatch(strings, /available on|get it on|download on/i);
});

test('the store step stays with the owner; Google Play uploads are theirs', () => {
  for (const d of DESTS) assert.match(STORY[d].owner.step, /\byou\b/i);
  assert.match(STORY.android.owner.step, /You upload the bundle/);
  assert.equal(RELEASE.owner, 'Owner action required');
});

test('store marks stay neutral until brand approval is recorded', () => {
  assert.equal(STORE_MARKS_CLEARED, false);
});

test('no coding-tool brands and no "sample" wording', () => {
  for (const [f, src] of sources) {
    assert.doesNotMatch(src, /replit|bolt\.new|lovable|cursor\.(com|sh)|v0\.dev/i, f);
    assert.doesNotMatch(src.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, ''), /['">]\s*sample/i, f);
  }
});

test('one section, one h2, accessible tabs, review hook gated away from production', () => {
  assert.equal(main.match(/<section\b/g)?.length, 1);
  assert.equal(main.match(/<h2\b/g)?.length, 1);
  assert.match(main, /role="tablist"/);
  assert.match(main, /role="tab"/);
  assert.match(main, /aria-selected=\{dest === d\}/);
  assert.match(main, /role="tabpanel"/);
  assert.match(main, /aria-live="polite"/);
  assert.match(main, /NODE_ENV !== 'production'/);
  assert.match(main, /NEXT_PUBLIC_VERCEL_ENV !== 'production'/);
  for (const [f, src] of sources) assert.doesNotMatch(src, /s04Comp|ConceptA|ConceptB/, f);
});

test('motion is bounded: the clock pauses offscreen, reduced motion settles, nothing loops forever', () => {
  assert.match(main, /IntersectionObserver/);
  assert.match(main, /a\.pause\(\)/);
  assert.match(main, /if \(reduced\) seek\('ready'\)/);
  for (const [f, src] of sources) {
    if (!f.endsWith('.css')) continue;
    assert.doesNotMatch(src, /\binfinite\b/, `${f} has an endless animation`);
    assert.doesNotMatch(src, /backdrop-filter:\s*blur/, f);
    assert.match(src, /prefers-reduced-motion: reduce/, `${f} honours reduced motion`);
  }
  // no scroll hijacking
  for (const [f, src] of sources) assert.doesNotMatch(src, /scrollIntoView|window\.scrollTo|preventDefault\(\);\s*\/\/\s*wheel/, f);
});
