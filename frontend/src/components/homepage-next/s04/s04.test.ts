import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { COPY, DESTS, NATURAL, PHASES, READINESS, SCENES, STORY, beatIndex, isPhase, itemState, lastBeat, phaseReached } from './publish';
import { STORE_MARKS_CLEARED } from './storeMarks';

const dir = fileURLToPath(new URL('./', import.meta.url));
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const sources = walk(dir)
  .filter((f) => /\.(tsx?|css)$/.test(f) && !f.endsWith('.test.ts'))
  .map((f) => [f.slice(dir.length), readFileSync(f, 'utf8')] as const);
const src = (name: string) => sources.find(([f]) => f.replace(/\\/g, '/') === name)![1];
const strings = JSON.stringify({ COPY: { ...COPY, note: '' }, STORY, READINESS });

test('each store has its own scene: beats in phase order, within a 9 to 11 second budget, all different', () => {
  const shapes = new Set<string>();
  for (const d of DESTS) {
    const { beats, end } = SCENES[d];
    assert.equal(beats[0].id, 'idle');
    assert.equal(beats[0].at, 0);
    for (let i = 1; i < beats.length; i++) {
      assert.ok(beats[i].at > beats[i - 1].at, `${d}: ${beats[i].id} after ${beats[i - 1].id}`);
      assert.ok(PHASES.indexOf(beats[i].phase) >= PHASES.indexOf(beats[i - 1].phase), `${d}: phases never go backwards`);
    }
    for (const p of PHASES) assert.ok(beats.some((b) => b.phase === p), `${d} visits ${p}`);
    assert.equal(lastBeat(d), 'ready');
    assert.ok(end >= 9000 && end <= 11000, `${d} ends at ${end}`);
    shapes.add(beats.map((b) => `${b.id}@${b.at}`).join());
  }
  assert.equal(shapes.size, DESTS.length);
  assert.ok(phaseReached('ready', 'produce') && !phaseReached('finding', 'compose'));
  assert.ok(isPhase('produce') && !isPhase('live'));
});

test('readiness: every item settles in order and owner items stay with the owner', () => {
  for (const d of DESTS) {
    const items = READINESS[d];
    assert.equal(items.length, 6, `${d} names six things a release needs`);
    assert.ok(items.filter((i) => i.owner).length >= 2, `${d} keeps at least two decisions with the owner`);
    for (const it of items) {
      assert.ok(beatIndex(d, it.starts) >= 0 && beatIndex(d, it.settles) >= 0, `${d}/${it.key} beats exist`);
      assert.ok(beatIndex(d, it.settles) >= beatIndex(d, it.starts));
      assert.equal(itemState(d, it, 'idle'), 'pending');
      assert.equal(itemState(d, it, 'ready'), it.owner ? 'owner' : 'done');
    }
  }
});

test('the three stages are different compositions with their own products', () => {
  assert.match(src('stage/StageIOS.tsx'), /kind="phone"/);
  assert.match(src('stage/StageAndroid.tsx'), /kind="android"/);
  assert.match(src('stage/StageChrome.tsx'), /kind="browser"/);
  assert.match(src('stage/StageIOS.tsx'), /AppStorePage/);
  assert.match(src('stage/StageAndroid.tsx'), /FernwayFeature/);
  assert.match(src('stage/StageAndroid.tsx'), /PlayListing/);
  assert.match(src('stage/StageChrome.tsx'), /CwsListing/);
  assert.match(src('stage/StageChrome.tsx'), /What MerchantLens can access/);
  assert.ok(NATURAL.chrome.w > NATURAL.chrome.h, 'the browser is landscape');
  // assets are rendered from the product itself (a scan pass), not flown across the page
  for (const f of ['stage/StageIOS.tsx', 'stage/StageAndroid.tsx', 'stage/StageChrome.tsx']) {
    assert.match(src(f), /<Render /, `${f} renders its assets`);
    assert.doesNotMatch(src(f), /\.animate\(/, `${f} does not fly elements across the page`);
  }
});

test('copy follows the brief: headline, one action, no em or en dashes', () => {
  assert.equal(`${COPY.titleA} ${COPY.titleB}`, 'Build anywhere. Publish with Xroga.');
  assert.equal(COPY.cta, 'Prepare a release');
  assert.deepEqual(DESTS.map((d) => STORY[d].storeName), ['App Store', 'Google Play', 'Chrome Web Store']);
  assert.deepEqual(DESTS.map((d) => STORY[d].product), ['Arcset', 'Fernway', 'MerchantLens']);
  assert.doesNotMatch(strings, /[–—]/);
  for (const [f, s] of sources) if (f.endsWith('.tsx')) assert.doesNotMatch(s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''), /[–—]/, f);
});

test('truth: nothing is shown as submitted, approved, live or paid, and Apple naming rules hold', () => {
  assert.doesNotMatch(strings, /\b(submitted|approved|is live|now live|published|paid|charged)\b/i);
  assert.doesNotMatch(strings, /available on|get it on|download on|Apple App Store|iPhone App Store|iTunes App Store/i);
  assert.match(COPY.note, /nothing is submitted/);
  assert.match(COPY.preview, /Illustrative/);
  for (const d of DESTS) assert.ok(STORY[d].owner.steps.length === 3);
  assert.match(STORY.chrome.owner.steps.join(' '), /Google reviews it/);
  assert.match(STORY.android.owner.steps.join(' '), /Play Console/);
});

test('every store ends on a named release handoff: what Xroga prepared, what the owner does, a real action', () => {
  const kinds = DESTS.map((d) => STORY[d].kind);
  assert.deepEqual(kinds, ['iPhone apps & games', 'Android apps & games', 'Browser extensions']);
  for (const d of DESTS) {
    const H = STORY[d].handoff;
    assert.match(H.title, new RegExp(`^${STORY[d].storeName} release prepared$`));
    assert.match(H.cta, new RegExp(`^Review ${STORY[d].storeName} release$`));
    assert.ok(H.prepared.length >= 3 && H.yours.length >= 2, d);
    assert.match(H.next, /review/i, `${d} names the store's own review`);
    assert.match(STORY[d].intro.title, /^Launch your /);
  }
  assert.match(STORY.chrome.handoff.yours.join(' '), /developer dashboard/i, 'first listing is created in the dashboard (Chrome Web Store API docs)');
  assert.match(src('stage/Handoff.tsx'), /<Link href=\{href\}/);
  assert.match(src('stage/StageAndroid.tsx'), /not published/);
  assert.match(src('stage/StageChrome.tsx'), /not submitted/);
  assert.match(src('stage/StageChrome.tsx'), /<details/, 'technical detail is on request');
});

test('store marks stay out until brand approval is recorded; no generic icon stands in for them', () => {
  assert.equal(STORE_MARKS_CLEARED, false);
  const mark = src('StoreMark.tsx');
  assert.match(mark, /if \(!STORE_MARKS_CLEARED\) return null/);
  for (const [f, s] of sources) assert.doesNotMatch(s, /from 'lucide-react'/, `${f} uses a generic icon library`);
});

test('no coding-tool brands and no "sample" wording', () => {
  for (const [f, s] of sources) {
    assert.doesNotMatch(s, /replit|bolt\.new|lovable|cursor\.(com|sh)|v0\.dev/i, f);
    assert.doesNotMatch(s.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, ''), /['">]\s*sample/i, f);
  }
});

test('one section, one h2, accessible tabs and controls, real routes, preview-only review hook', () => {
  const main = src('S04Publish.tsx');
  assert.equal(main.match(/<section\b/g)?.length, 1);
  assert.equal(main.match(/<h2\b/g)?.length, 1);
  assert.match(main, /role="tablist"/);
  assert.match(main, /role="tab"/);
  assert.match(main, /aria-selected=\{dest === d\}/);
  assert.match(main, /role="tabpanel"/);
  assert.match(main, /'\/dashboard\/publish' : '\/auth\/signup'/);
  assert.match(src('stage/Xcard.tsx'), /aria-live="polite"/);
  const clock = src('useScene.ts');
  assert.match(clock, /NODE_ENV !== 'production'/);
  assert.match(clock, /NEXT_PUBLIC_VERCEL_ENV !== 'production'/);
  // the products' own controls are real buttons with names
  assert.match(src('apps/Arcset.tsx'), /aria-label="Complete set 3"/);
  assert.match(src('apps/Fernway.tsx'), /aria-label="Save Cascade Loop for offline use"/);
  assert.match(src('apps/MerchantLens.tsx'), /aria-label="Open MerchantLens on this page"/);
});

test('motion is bounded: pauses offscreen, honours reduced motion, never loops, never moves the page', () => {
  const clock = src('useScene.ts');
  assert.match(clock, /IntersectionObserver/);
  assert.match(clock, /setHold\(true\)/);
  assert.match(clock, /prefers-reduced-motion: reduce/);
  assert.match(src('S04.module.css'), /\[data-hold\] \* \{\s*animation-play-state: paused !important;/);
  for (const [f, s] of sources) {
    if (!f.endsWith('.css')) continue;
    assert.doesNotMatch(s, /\binfinite\b/, `${f} has an endless animation`);
    assert.doesNotMatch(s, /backdrop-filter:\s*blur/, f);
    assert.match(s, /prefers-reduced-motion: reduce/, `${f} honours reduced motion`);
  }
  for (const [f, s] of sources) assert.doesNotMatch(s, /scrollIntoView|window\.scrollTo|scrollBy\(/, f);
});
