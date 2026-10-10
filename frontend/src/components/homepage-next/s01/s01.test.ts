import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { CAPABILITIES, PLATFORM, PLATFORM_TITLE, SECTION } from './capabilities.data';
import { B_FLIP_ORDER, computeLayout, deckFrame, restProgress, SPLIT, type DeckFrame } from './deckMotion';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
/** Source of one top-level function in a file (CRLF or LF). */
const fnBody = (src: string, name: string) => {
  const start = src.indexOf(`function ${name}(`);
  const end = src.slice(start).search(/\r?\n\}\r?\n/);
  assert.ok(start !== -1 && end !== -1, name);
  return src.slice(start, start + end);
};
const L = computeLayout(1440, 900);
const visible = (f: DeckFrame) => f.cards.map((c, i) => [c, i] as const).filter(([c]) => c.o > 0.001);


test('exactly eight unique capabilities with the approved titles, numbers and chapters', () => {
  assert.deepEqual(
    CAPABILITIES.map((c) => c.title),
    ['Build Software', 'Browser & Testing', 'Automate Work', 'Launch Anywhere', 'Research & Decide', 'Files & Data', 'Grow Your Business', 'Keep Work Running'],
  );
  assert.equal(new Set(CAPABILITIES.map((c) => c.id)).size, 8);
  assert.deepEqual(
    CAPABILITIES.map((c) => c.number),
    ['01 / CREATE', '02 / VERIFY', '03 / OPERATE', '04 / RELEASE', '05 / DISCOVER', '06 / ORGANIZE', '07 / GROW', '08 / CONTINUE'],
  );
  assert.deepEqual(CAPABILITIES.map((c) => c.chapter).join(''), 'AAAABBBB');
  for (const c of CAPABILITIES) {
    assert.equal(c.stages.length, 4, c.id);
    assert.equal(c.clusters.length, 4, c.id);
    assert.ok(c.details.length >= 5 && c.truth.length >= 2, c.id);
  }
  assert.equal(SECTION.title, 'What you can do with Xroga.');
  assert.equal(SECTION.intro, 'Build software, test products, automate work, research, manage data, launch, grow and keep things moving.');
  assert.deepEqual(
    CAPABILITIES.map((c) => c.benefit),
    [
      'Create real apps, portals and tools, or improve the software you already have.',
      'Check important user journeys, find problems and verify the fixes.',
      'Connect the steps behind your business and remove repetitive work.',
      'Prepare products for the web, browser extensions and mobile platforms.',
      'Search, compare evidence and turn information into clear next steps.',
      'Understand documents, clean records and organize information you can use.',
      'Find opportunities, improve campaigns and learn what works.',
      'Follow up, track progress and keep recurring work organized.',
    ],
  );
  assert.deepEqual(CAPABILITIES[0].stages, ['Structure', 'Logic', 'Test', 'Ready']);
  // every Try request asks for serious, multi-stage work (several clauses, not a one-line chatbot question)
  for (const c of CAPABILITIES) assert.ok(c.example.length >= 110 && /,/.test(c.example), `${c.id} example is multi-stage`);
  assert.equal(PLATFORM_TITLE, 'One workspace. More ways to work.');
  assert.equal(PLATFORM.length, 6);
});

const allCopy = () =>
  JSON.stringify({ CAPABILITIES, PLATFORM, PLATFORM_TITLE, SECTION }) +
  read('./Vignettes.tsx') +
  read('./CapabilityCard.tsx') +
  read('./CapabilityDetails.tsx') +
  read('./S01CapabilityDeck.tsx');

test('no em or en dash in any S01 copy', () => {
  assert.doesNotMatch(allCopy(), /[–—]/);
});

test('no unverified promises: no guaranteed outcomes, store approval, always-on workers or live connector counts', () => {
  const copy = allCopy();
  for (const bad of [/guaranteed (approval|growth|ranking|revenue)/i, /live in (the )?app store/i, /24\/7/, /fully autonomous/i, /1,603|1603|1,500\+/]) {
    assert.doesNotMatch(copy, bad, String(bad));
  }
  // the caveats that the brief requires are present in the expanded details
  const launch = CAPABILITIES.find((c) => c.id === 'launch')!;
  assert.ok(launch.details.some((d) => /never treats approval as automatic/.test(d)));
  const cont = CAPABILITIES.find((c) => c.id === 'continue')!;
  assert.ok(cont.truth.some((t) => t.status === 'planned' && /workers/.test(t.text)));
  const browser = CAPABILITIES.find((c) => c.id === 'browser')!;
  assert.ok(browser.truth.some((t) => t.status === 'planned' && /any website/.test(t.text)));
});

test('each vignette ends on its own result, paired with the right card', () => {
  const v = read('./Vignettes.tsx');
  const finals: Record<string, string> = {
    Build: 'Release-ready build',
    Browser: 'Flow verified',
    Automate: 'Records updated',
    Launch: 'Ready for release review',
    Research: 'Evidence-backed brief',
    Data: 'Changes ready for review',
    Grow: 'Experiment ready',
    Continue: 'Project context preserved',
  };
  for (const [fn, label] of Object.entries(finals)) {
    const body = fnBody(v, fn);
    assert.ok(body.includes(label), `${fn} shows "${label}"`);
  }
  assert.match(v, /build: Build,\s*browser: Browser,\s*automate: Automate,\s*launch: Launch,\s*research: Research,\s*data: Data,\s*grow: Grow,\s*continue: Continue,/);
  // the card exposes the stages and the result as text, so nothing depends on the illustration loading
  assert.match(read('./CapabilityCard.tsx'), /Result: \$\{cap\.result\}/);
});

test('provider marks appear only where the depicted task uses that service', () => {
  const v = read('./Vignettes.tsx');
  const marksIn = (fn: string) => {
    const body = fnBody(v, fn);
    return [...new Set([...body.matchAll(/<Mark id="(\w+)"/g)].map((m) => m[1]))].sort();
  };
  assert.deepEqual(marksIn('Automate'), ['gmail', 'googlecalendar', 'hubspot']);
  assert.deepEqual(marksIn('Grow'), ['mailchimp', 'posthog']);
  for (const fn of ['Build', 'Browser', 'Launch', 'Research', 'Data', 'Continue']) assert.deepEqual(marksIn(fn), [], fn);
});

test('chapter rest states: four readable fronts in order, no card lost or duplicated', () => {
  for (const ch of ['A', 'B'] as const) {
    const f = deckFrame(restProgress(ch), L);
    const shown = visible(f);
    assert.equal(shown.length, 4, `${ch} shows four cards`);
    const ids = shown.map(([, i]) => i);
    assert.deepEqual(ids, ch === 'A' ? [0, 1, 2, 3] : [4, 5, 6, 7]);
    for (const [c] of shown) {
      assert.equal(c.flip, 1);
      assert.ok(c.readable);
      assert.equal(c.step, 4, 'demo finished, result visible');
      assert.ok(Math.abs(c.rz) <= 3, 'settle tilt within 3 degrees');
    }
    const xs = shown.map(([c]) => c.x);
    assert.deepEqual([...xs].sort((a, b) => a - b), xs, 'left to right in semantic order');
    // the row fits inside the stage with margin
    assert.ok(xs[3] + L.W / 2 <= L.vw / 2 - 40 && xs[0] - L.W / 2 >= -L.vw / 2 + 40);
  }
});

test('every progress value renders a complete, valid state (no empty stage, no stray chapter)', () => {
  for (let p = 0; p <= 1.0001; p += 0.0025) {
    const f = deckFrame(p, L);
    const shown = visible(f);
    assert.ok(shown.length >= 4, `p=${p.toFixed(4)} has cards on stage`);
    for (const [c, i] of shown) {
      for (const k of ['x', 'y', 'z', 'rx', 'ry', 'rz', 's', 'o', 'flip', 'step'] as const) assert.ok(Number.isFinite(c[k]), `${k} at ${p}`);
      // a card of the other chapter is visible only during the crossover
      const own = CAPABILITIES[i].chapter === (p < SPLIT ? 'A' : 'B');
      if (!own) assert.ok(Math.abs(p - SPLIT) < 0.06, `card ${i} visible at ${p}`);
    }
  }
});

test('scroll state is deterministic: forward, reverse and direct jumps agree', () => {
  const ps = Array.from({ length: 401 }, (_, k) => k / 400);
  const forward = ps.map((p) => JSON.stringify(deckFrame(p, L)));
  const reverse = [...ps].reverse().map((p) => JSON.stringify(deckFrame(p, L))).reverse();
  assert.deepEqual(forward, reverse);
  // a jump straight to mid-chapter B (refresh, anchor, fast scroll) equals arriving there gradually
  assert.equal(JSON.stringify(deckFrame(0.7, L)), forward[280]);
});

test('flips are sequential: A turns 01 to 04, B turns 06, 05, 07, 08; vignettes only move forward', () => {
  const firstFront = (i: number) => {
    for (let p = 0; p <= 1; p += 0.001) if (deckFrame(p, L).cards[i].flip >= 1) return p;
    return 2;
  };
  const a = [0, 1, 2, 3].map(firstFront);
  assert.deepEqual([...a].sort((x, y) => x - y), a);
  const b = [4, 5, 6, 7].map(firstFront);
  const order = [...b.keys()].sort((x, y) => b[x] - b[y]);
  assert.deepEqual(order, [1, 0, 2, 3]);
  assert.deepEqual([...B_FLIP_ORDER], [1, 0, 2, 3]);
  for (let i = 0; i < 8; i++) {
    let last = 0;
    const [from, to] = i < 4 ? [0, restProgress('A')] : [SPLIT, 1];
    for (let p = from; p <= to; p += 0.002) {
      const st = deckFrame(p, L).cards[i].step;
      assert.ok(st >= last, `card ${i} step went back at ${p}`);
      last = st;
    }
    assert.equal(last, 4);
  }
});

test('responsive modes: four-up deck only where four readable cards fit; carousel elsewhere', () => {
  for (const [w, h] of [[1440, 900], [1280, 800], [1150, 666]]) {
    const l = computeLayout(w, h);
    assert.equal(l.mode, 'deck', `${w}x${h}`);
    assert.ok(4 * l.W + 3 * l.gap <= w - 96, `${w}: row fits with 48px margins`);
    assert.ok(l.W >= 236 && l.H >= 400, `${w}: card ${l.W}x${l.H} is readable`);
    assert.ok(l.rowY - l.H / 2 >= l.navInset + 40, `${w}: cards clear the sticky header and chapter row`);
    assert.ok(l.rowY + l.H / 2 <= h, `${w}: cards fit the viewport`);
  }
  assert.ok(computeLayout(1440, 900).W >= 272 && computeLayout(1440, 900).W <= 290);
  for (const [w, h] of [[1024, 768], [768, 1024], [430, 932], [390, 844], [360, 800]]) {
    assert.equal(computeLayout(w, h).mode, 'carousel', `${w}x${h}`);
  }
});

test('reduced motion: a static grid with every card readable, no pinned track, no 3D turn', () => {
  const deck = read('./S01CapabilityDeck.tsx');
  assert.match(deck, /const mode: Mode = reduce \? 'static' : L\.mode;/);
  assert.match(deck, /flat=\{mode === 'static'\}/);
  assert.match(deck, /CAPABILITIES\.map\(\(\) => \(mode === 'static' \? 4 : 0\)\)/, 'static cards show their finished demo');
  const card = read('./Card.module.css');
  assert.match(card, /\.card\[data-flat\] \.body,[\s\S]*?transform: none;/);
  assert.match(card, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(read('./Vignettes.module.css'), /@media \(prefers-reduced-motion: reduce\)/);
});

test('accessible contract: real buttons, one exposed face, modal dialog with Escape and focus return', () => {
  const card = read('./CapabilityCard.tsx');
  assert.doesNotMatch(card, /<div[^>]*onClick/);
  assert.match(card, /aria-hidden=\{flipped \|\| undefined\} ref=\{inertRef\(flipped\)\}/);
  assert.match(card, /aria-hidden=\{!flipped \|\| undefined\} ref=\{inertRef\(!flipped\)\}/);
  assert.match(card, /aria-haspopup="dialog"/);
  const det = read('./CapabilityDetails.tsx');
  assert.match(det, /el\.showModal\(\)/);
  assert.match(det, /onCancel=\{\(e\) => \{\s*e\.preventDefault\(\);\s*onClose\(\);/);
  assert.match(det, /aria-label="Close details"/);
  assert.match(det, /aria-labelledby="s01-details-title"/);
  const deck = read('./S01CapabilityDeck.tsx');
  assert.match(deck, /t\.focus\(\{ preventScroll: true \}\)/, 'focus returns to the trigger');
  assert.match(deck, /aria-label="Previous capability"/);
  assert.match(deck, /aria-label="Next capability"/);
  assert.match(read('./S01.module.css'), /\.controls button \{[\s\S]*?width: 48px;[\s\S]*?height: 48px;/, '44px+ touch targets');
});

test('try-in-Xroga uses the verified workspace hand-off, never a fake action', () => {
  const det = read('./CapabilityDetails.tsx');
  assert.match(det, /localStorage\.setItem\(PENDING_PROMPT_KEY, prompt\)/);
  assert.match(det, /submission\(cap\.example, signedIn\)/);
});

test('one timeline, no drift: the deck has no timers, listeners are removed, offscreen work stops', () => {
  const deck = read('./S01CapabilityDeck.tsx');
  const stage = deck.slice(deck.indexOf('function DeckStage('), deck.indexOf('function Gallery('));
  assert.doesNotMatch(stage, /setTimeout|setInterval/);
  assert.match(stage, /deckFrame\(clamp\(-r\.top \/ dist\), layout\)/);
  assert.match(stage, /new IntersectionObserver/);
  assert.match(stage, /window\.removeEventListener\('scroll', onScroll\)/);
  assert.match(stage, /cancelAnimationFrame\(raf\)/);
  assert.doesNotMatch(deck, /scrollIntoView/);
});

test('S01 styles stay inside S01 and the homepage composes it between the hero and browser employees', () => {
  for (const f of ['./S01.module.css', './Card.module.css', './Vignettes.module.css', './Details.module.css']) {
    const css = read(f);
    assert.doesNotMatch(css, /:global/, f);
    assert.doesNotMatch(css, /^(html|body|h[1-6]|header|nav|\.xv-)/m, f);
  }
  const page = read('../../homepage/HomepageClient.tsx');
  const hero = page.indexOf('<S00Hero />');
  const s01 = page.indexOf('<S01CapabilityDeck />');
  const next = page.indexOf('<HomepageBrowserEmployeesExact />');
  assert.ok(hero !== -1 && hero < s01 && s01 < next);
  assert.doesNotMatch(page, /<HomepageCapabilitiesMosaic \/>/);
});

test('Files & Data shows a real cleanup: preserved original, mapping with confidence, dedupe, normalization, held records', () => {
  const body = fnBody(read('./Vignettes.tsx'), 'Data');
  for (const must of ['Original kept', 'status <b>91%</b>', "kind: 'dup'", "kind: 'miss'", "kind: 'ref'", "kind: 'amb'", 'Merge rule: same email and account', '2 held']) {
    assert.ok(body.includes(must) || read('./Vignettes.tsx').includes(must), must);
  }
  const css = read('./Vignettes.module.css');
  assert.match(css, /\.data\[data-s4\] \.tr:is\(\[data-kind='ref'\], \[data-kind='amb'\]\)/, 'uncertain rows are held at review');
});

test('Launch never shows store approval as done, and Keep Work Running separates scheduled from running', () => {
  const v = read('./Vignettes.tsx');
  assert.match(v, /Needs Apple account/);
  assert.doesNotMatch(v, /Approved by (Apple|Google)|Live in (App|Play) Store/i);
  const body = fnBody(v, 'Continue');
  assert.match(body, /tone: 'plan'/);
  assert.match(body, /Scheduled Mon/);
  assert.match(body, /Waiting: approval/);
});

test('card backs are dark Obsidian Titanium, never white or pale', () => {
  const css = read('./Card.module.css');
  const start = css.search(/\.backInner \{\s*color/);
  const block = css.slice(start, css.indexOf('}', start));
  const hexes = [...block.matchAll(/#([0-9a-f]{6})/gi)].map((m) => m[1]);
  assert.ok(hexes.length >= 3);
  for (const h of hexes) {
    const [r, g, b] = [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16) / 255);
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    assert.ok(lum < 0.2, `#${h} is too light for the back`);
  }
  assert.match(css, /\.medal \{[\s\S]*?--m: calc\(var\(--cw, 290px\) \* 0\.23\)/, 'medallion about 23% of card width');
  assert.match(read('./CapabilityCard.tsx'), /\/brand\/xroga-orb-mark-v2\.webp/);
});

test('offstage cards are inert and the chapter meter offers keyboard navigation between chapters', () => {
  const deck = read('./S01CapabilityDeck.tsx');
  assert.match(deck, /const off = c\.o < 0\.5;\s*if \(el\.inert !== off\) el\.inert = off;/);
  assert.match(deck, /aria-label=\{`Show cards \$\{SECTION\.chapters\[k\]\.range\}: \$\{SECTION\.chapters\[k\]\.name\}`\}/);
  assert.match(deck, /onClick=\{\(\) => goToChapter\(k\)\}/);
  // no per-frame blur filters on the stage (shadows soften through opacity and scale only)
  assert.doesNotMatch(deck, /style\.filter/);
  assert.match(read('./S01.module.css'), /backdrop-filter: none !important;/, 'legacy homepage button blur is removed inside S01');
});
