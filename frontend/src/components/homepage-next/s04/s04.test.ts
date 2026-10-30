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

test('each store has its own scene: beats in phase order, within a calm 11.5 to 14.5 second budget, all different', () => {
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
    assert.ok(end >= 11500 && end <= 14500, `${d} ends at ${end}`);
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

test('copy follows the brief: headline, short outcome line, no section action, no em or en dashes', () => {
  assert.equal(`${COPY.titleA} ${COPY.titleB}`, 'Build anywhere. Launch with Xroga.');
  assert.equal(COPY.lede, 'From working software to the App Store, Google Play, and Chrome Web Store.');
  assert.ok(!('cta' in COPY), 'the head has no section-level action; each store handoff keeps its own review action');
  assert.doesNotMatch(src('S04Publish.tsx'), /<Link\b|className=\{s\.cta\}/);
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
  // the first listing is completed in the dashboard (Chrome Web Store API docs)
  assert.match(STORY.chrome.handoff.yours.join(' '), /listing and privacy tabs/i);
  assert.match(src('stage/Handoff.tsx'), /Chrome developer dashboard/);
  for (const d of DESTS) assert.match(STORY[d].handoff.headline, new RegExp(`^${STORY[d].product} is ready for your ${STORY[d].storeName} review$`));
  assert.match(src('stage/Handoff.tsx'), /<Link href=\{href\}/);
  assert.match(src('stage/StageAndroid.tsx'), /not published/);
  assert.match(src('stage/StageChrome.tsx'), /not submitted/);
  assert.match(src('stage/StageChrome.tsx'), /<details/, 'technical detail is on request');
});

test('the work panel says what Xroga is accomplishing; tasks settle with the scene and specs stay quiet metadata', () => {
  for (const d of DESTS) {
    const W = STORY[d].work;
    assert.match(W.title, new RegExp(`^Preparing your ${STORY[d].storeName}`));
    assert.equal(W.tasks.length, 3, d);
    for (const t of W.tasks) {
      assert.ok(beatIndex(d, t.from) >= 0 && beatIndex(d, t.to) > beatIndex(d, t.from), `${d}: ${t.label} spans real beats`);
      assert.ok(beatIndex(d, t.to) <= beatIndex(d, 'ready'), `${d}: ${t.label} settles by the handoff`);
    }
    assert.ok(W.spec.length > 0 && W.spec.length < 80, `${d} spec stays short`);
  }
  assert.equal(STORY.ios.work.title, 'Preparing your App Store presentation');
  const card = src('stage/Xcard.tsx');
  assert.match(card, /className=\{s\.tasks\}/);
  assert.match(card, /className=\{s\.spec\}/);
});

test('the readiness list carries no Pause/Play or Replay controls; autoplay stays', () => {
  const main = src('S04Publish.tsx');
  assert.doesNotMatch(main, /sc\.togglePause|sc\.replay|aria-pressed=\{sc\.paused\}|Pause the walkthrough|Play the walkthrough/);
  assert.doesNotMatch(main, /COPY\.replay/);
  const clock = src('useScene.ts');
  assert.match(clock, /c\.playing && !c\.paused/, 'leaving the viewport never overrides a visitor pause');
});

test('frame cost: the render pass and stage changes never animate layout or repaint product copies per frame', () => {
  const kit = src('stage/kit.module.css');
  // the reveal is a transform wipe and the scan line moves with transform (measured: clip-path and top repainted each frame)
  assert.doesNotMatch(kit, /clip-path:\s*inset\(0 0 100% 0\)/);
  assert.match(kit, /@keyframes kitWipe \{/);
  const edge = kit.slice(kit.indexOf('@keyframes kitEdge'), kit.indexOf('@keyframes kitEdge') + 220);
  assert.doesNotMatch(edge, /\btop:/, 'the scan line moves with transform, not top');
  const stages = src('stage/Stages.module.css');
  // animated track widths made every scaled product copy re-measure, re-render and re-raster (measured ~1 s GPU raster)
  assert.doesNotMatch(stages, /transition:\s*grid-template-columns/);
  assert.match(stages, /\.shotDevice \{[^}]*contain: layout paint;/);
});

test('the App Store handoff never makes the studio taller than its settled size', () => {
  const stages = src('stage/Stages.module.css');
  // easing the cards' height while the handoff appeared at full size pushed the rail past the fold at 1280 × 800
  assert.doesNotMatch(stages, /transition:\s*height/);
  for (const rule of stages.match(/\.ios\[data-ready\] \.shot \{[^}]*\}/g) ?? []) assert.doesNotMatch(rule, /transition/);
});

test('App Store: two authentic iPhones lead the scene at a size set by the screen, both kept on every layout', () => {
  const ios = src('stage/StageIOS.tsx');
  const kitCss = src('stage/kit.module.css');
  const stages = src('stage/Stages.module.css');
  // both phones share one size and one iOS status bar (Dynamic Island, cellular, Wi-Fi, battery)
  assert.equal((ios.match(/maxH=\{phoneH\}/g) ?? []).length, 2);
  assert.match(ios, /<StatusBar className=\{s\.aspStatus\} \/>/);
  assert.match(src('apps/Arcset.tsx'), /export function StatusBar/);
  // the frame keeps the phone's proportions: border, band, corners and buttons scale with the device (--s)
  for (const m of ['border-radius: calc(40px * var(--s, 1))', 'inset: calc(-8.8px * var(--s, 1))', 'border: calc(2.6px * var(--s, 1)) solid transparent']) assert.ok(kitCss.includes(m), m);
  assert.match(src('stage/kit.tsx'), /const IPHONE_EDGE = 8\.8;/);
  // the phone columns are the phones' own width; the App Store page is never hidden (tablet shows both phones)
  assert.match(stages, /grid-template-columns: minmax\(0, var\(--phone-w, 280px\)\) minmax\(0, 1fr\) minmax\(0, var\(--phone-w, 280px\)\)/);
  assert.doesNotMatch(stages, /\.iosStore \{\s*display: none/);
  // the product page states no ratings, reviews or downloads
  assert.match(ios, /\{ k: 'Age'/);
  assert.doesNotMatch(ios, /\{ k: '(Ratings?|Reviews?|Downloads?|Chart)'/i);
});

test('Google Play: the Android phone leads at the App Store phone scale, in a proportional Pixel-class frame', () => {
  const an = src('stage/StageAndroid.tsx');
  const kitCss = src('stage/kit.module.css');
  const stages = src('stage/Stages.module.css');
  assert.match(an, /maxH=\{phoneH\}/);
  assert.match(an, /clamp\(420, vh - 336, 640\)/, 'same desktop sizing rule as the App Store phones');
  assert.match(src('stage/kit.tsx'), /const ANDROID_EDGE = 9;/);
  for (const m of ['border-radius: calc(28px * var(--s, 1))', 'inset: calc(-9px * var(--s, 1))', 'border: calc(2.4px * var(--s, 1)) solid transparent']) assert.ok(kitCss.includes(m), m);
  // the listing keeps at least its original width; on short screens the phone steps back at the handoff to fit one view
  assert.match(stages, /minmax\(0, max\(300px, var\(--phone-w, 300px\)\)\) minmax\(0, 1fr\)/);
  assert.match(stages, /\.android\[data-wide\] \.anDev \{[^}]*scale\(var\(--back, 1\)\)/);
});

test('head: one entrance, only when S04 arrives from below, never under reduced motion; a tall studio still starts', () => {
  const shell = src('S04Publish.tsx');
  assert.match(shell, /matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches\) return;/);
  assert.match(shell, /getBoundingClientRect\(\)\.top < window\.innerHeight \* 0\.85\) return;/);
  const css = src('S04.module.css');
  for (const k of ['s04Rise', 's04Light', 's04Studio']) assert.match(css, new RegExp(`@keyframes ${k} \{`));
  assert.match(css, /\.title\.title \{[^}]*white-space: nowrap;/);
  // on phones the studio is taller than the screen: filling half the screen counts as seen
  assert.match(src('useScene.ts'), /e\.intersectionRect\.height >= screenH \* 0\.5/);
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

test('phones: the iPhone, Xroga\'s work and the store page are one snapping swipe row, never three stacked screens', () => {
  const stages = src('stage/Stages.module.css');
  const phones = stages.slice(stages.indexOf('@media (max-width: 760px) {\n  .ios,'));
  const rule = phones.match(/\n  \.ios \{[^}]*\}/)?.[0] ?? '';
  assert.match(rule, /display: flex;/);
  assert.match(rule, /overflow-x: auto;/);
  assert.match(rule, /scroll-snap-type: x mandatory;/);
  // the row contains its own horizontal scrolling so a sideways swipe never drags the page
  assert.match(rule, /overscroll-behavior-x: contain;/);
  assert.match(phones, /\.iosStore \{\s*flex: 0 0 min\(82%, 300px\);/);
});
