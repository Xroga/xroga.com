import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { CAPABILITIES, SECTION } from './capabilities.data';
import { B_FLIP_ORDER, COPY_CLEARANCE, computeLayout, deckFrame, introDropFor, restProgress, SCHEDULE, SPLIT, withHeading, type DeckFrame } from './deckMotion';

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
    assert.equal(c.groups.length, 4, c.id);
    assert.ok(c.details.length >= 5 && c.truth.length >= 2, c.id);
  }
  assert.equal(SECTION.identifier, "EXPLORE XROGA'S CAPABILITIES");
  assert.deepEqual(SECTION.title, { lead: 'Artificial Intelligence was the beginning.', main: 'Super Intelligence is the vision.' });
  assert.equal(SECTION.statement, 'One workspace. A world of possibilities.');
  assert.equal(
    SECTION.intro,
    "Xroga is being built to bring powerful capabilities together, taking work beyond a single prompt, tool or specialty. Explore what it can accomplish today and the intelligence we're working toward.",
  );

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
});

const allCopy = () =>
  JSON.stringify({ CAPABILITIES, SECTION }) +
  read('./Vignettes.tsx') +
  read('./CapabilityCard.tsx') +
  read('./CapabilityFocus.tsx') +
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
    Browser: 'Access flow verified',
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
  assert.match(deck, /reduced=\{!!reduce \|\| view\.mode === 'static'\}/, 'Explore opens without the turn');
  const card = read('./Card.module.css');
  assert.match(card, /\.card\[data-flat\] \.body \{[\s\S]*?transform: none;/);
  assert.match(card, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.tracer,\s*\.sweep \{\s*display: none;/);
  assert.match(read('./Vignettes.module.css'), /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(read('./CapabilityFocus.tsx'), /if \(reduced\) \{\s*done\(\);/);
});

test('Explore: one click lifts that card, turns it and shows its details on the reverse; no drawer', () => {
  const card = read('./CapabilityCard.tsx');
  assert.doesNotMatch(card, /<div[^>]*onClick/);
  assert.match(card, /aria-haspopup="dialog"/);
  // the click never reaches deck, drag or scroll handlers, and the back face is never interactive
  assert.match(card, /onPointerDown=\{\(e\) => e\.stopPropagation\(\)\}/);
  assert.match(card, /data-face="back" aria-hidden>/);
  assert.equal([...fnBody(card, 'CapabilityCard').matchAll(/data-face="back"[\s\S]*?<\/div>\s*<\/div>/g)][0][0].includes('<button'), false);
  const focus = read('./CapabilityFocus.tsx');
  assert.match(focus, /dialog\.showModal\(\)/);
  assert.match(focus, /onCancel=\{\(e\) => \{\s*e\.preventDefault\(\);\s*close\(\);/, 'Escape turns the card back');
  assert.match(focus, /aria-label="Back to cards"/);
  assert.match(focus, /rotateY\(180deg\)/);
  assert.match(focus, /request\.source\.style\.visibility = 'hidden'/, 'the same physical card leaves the deck');
  assert.match(focus, /request\?\.trigger\.focus\(\{ preventScroll: true \}\)/, 'focus returns to Explore');
  assert.ok(Number(focus.match(/FOCUS_OPEN_MS = (\d+)/)![1]) >= 500 && Number(focus.match(/FOCUS_OPEN_MS = (\d+)/)![1]) <= 800);
  // a filter on the flying card would flatten preserve-3d and mirror the faces
  const css = read('./Focus.module.css');
  const fly = css.slice(css.indexOf('.fly {'), css.indexOf('}', css.indexOf('.fly {')));
  assert.doesNotMatch(fly, /filter/);
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /\.fly[^{]*\{[^}]*filter:/);
  assert.match(css, /backface-visibility: hidden/);
  assert.match(css, /\.scroll \{[\s\S]*?overflow-y: auto;[\s\S]*?overscroll-behavior: contain;/, 'details scroll inside the card');
  // one card at a time
  const deck = read('./S01CapabilityDeck.tsx');
  assert.match(deck, /if \(focusRef\.current\) return;/);
  assert.doesNotMatch(deck, /CapabilityDetails/);
  assert.match(deck, /aria-label="Previous capability"/);
  assert.match(deck, /aria-label="Next capability"/);
  assert.match(read('./S01.module.css'), /\.controls button \{[\s\S]*?width: 48px;[\s\S]*?height: 48px;/, '44px+ touch targets');
});

test('every drawer detail survives on the reverse: each detail sentence is placed in exactly one group', () => {
  for (const c of CAPABILITIES) {
    const placed = c.groups.flatMap((g) => g.points).sort((a, b) => a - b);
    assert.deepEqual(placed, c.details.map((_, i) => i), `${c.id} places every detail once`);
    for (const g of c.groups) assert.ok(g.examples.length >= 2 && g.examples.length <= 5 && g.text.length > 10, `${c.id} ${g.label}`);
    assert.ok(c.outcome.length > 30 && c.how.length === 4, c.id);
    assert.ok(c.truth.length >= 2 && c.chips.length >= 4, c.id);
  }
  const focus = read('./CapabilityFocus.tsx');
  for (const field of ['cap.benefit', 'cap.chips', 'cap.outcome', 'cap.how', 'cap.groups', 'cap.details[n]', 'cap.truth', 'cap.example', 'cap.reverseTitle']) {
    assert.ok(focus.includes(field), `focus card shows ${field}`);
  }
});

test('copy: the old section strings are gone and superintelligence is an aspiration only', () => {
  const copy = allCopy();
  assert.doesNotMatch(copy, /01 \/ CAPABILITIES|What you can do with Xroga|Beyond answers. Into real work|What can Xroga take on/);
  assert.doesNotMatch(copy, /\b(is|are|first|achieved|world's) superintelligen|\bAGI\b/i);
  assert.match(SECTION.title.main, /is the vision\.$/, 'Super Intelligence is presented as the vision, not an achievement');
  // the heading is the section H2; the page keeps a single H1 in the hero
  assert.match(read('./S01CapabilityDeck.tsx'), /<h2 id="s01-title"/);
  assert.doesNotMatch(read('./S01CapabilityDeck.tsx') + read('./CapabilityCard.tsx') + read('./CapabilityFocus.tsx'), /<h1/);
});

test('copy clearance: the intro stack never rises into the heading, and the heading leaves before the stack rises', () => {
  for (const [w, h, head] of [[1440, 900, 300], [1440, 690, 300], [1280, 800, 300], [1150, 666, 300]]) {
    const L = withHeading(computeLayout(w, h), head);
    for (let p = 0; p <= SCHEDULE.fan[1] * SPLIT; p += 0.002) {
      const f = deckFrame(p, L);
      const top = Math.min(...f.cards.filter((c) => c.o > 0.001).map((c) => L.rowY + c.y - c.s * (L.H / 2) - Math.abs(Math.sin((c.rz * Math.PI) / 180)) * (L.W / 2)));
      // while the copy is still visible, every card top stays below it with the clearance
      if (f.heading < 0.98) assert.ok(top >= head + COPY_CLEARANCE - 1, `${w}x${h} p=${p.toFixed(3)}: card top ${top.toFixed(0)} under copy ${head}`);
    }
  }
  assert.ok(SCHEDULE.heading[1] <= SCHEDULE.stackRise[0], 'the heading is gone before the stack rises');
  assert.ok(introDropFor(500, 450, 290, 300) > 0);
});

test('Launch Anywhere surfaces have plausible, distinct proportions', () => {
  const css = read('./Vignettes.module.css');
  assert.match(css, /grid-template-columns: 1\.6fr 1fr 0\.78fr 0\.78fr;/, 'a wide browser, a medium popup, two phones');
  assert.match(css, /\.surface\[data-k='web'\] \.device \{[\s\S]*?aspect-ratio: 16 \/ 10;/);
  assert.match(css, /\.surface\[data-k='ext'\] \.device \{[\s\S]*?aspect-ratio: 4 \/ 5;/);
  assert.match(css, /\.surface\[data-k='ios'\] \.device,\s*\.surface\[data-k='and'\] \.device \{[\s\S]*?aspect-ratio: 9 \/ 17;/);
});

test('edge tracer: event-driven, masked to the rim, never on a loop, off for reduced motion', () => {
  const css = read('./Card.module.css');
  const tracer = css.slice(css.indexOf('.tracer {'), css.indexOf('}', css.indexOf('.tracer {')));
  assert.match(tracer, /pointer-events: none;/);
  assert.match(css, /\.tracer::before,\s*\.tracer::after \{[\s\S]*?height: 1\.5px;/, 'hairlines on the rim only');
  assert.doesNotMatch(css, /tracer[AB] [^;]*infinite/);
  const ms = [...css.matchAll(/animation: tracer[AB] (\d+)ms/g)].map((m) => Number(m[1]));
  assert.ok(ms.length >= 2 && ms.every((v) => v >= 450 && v <= 900), `tracer lasts ${ms}`);
  assert.match(read('./S01CapabilityDeck.tsx'), /card\.dataset\.trace = card\.dataset\.trace === 'a' \? 'b' : 'a'/);
});

test('try-in-Xroga uses the verified workspace hand-off, never a fake action', () => {
  const focus = read('./CapabilityFocus.tsx');
  assert.match(focus, /localStorage\.setItem\(PENDING_PROMPT_KEY, prompt\)/);
  assert.match(focus, /submission\(cap\.example, signedIn\)/);
  assert.match(focus, /catch \{\s*\/\/ no auth client available[^\n]*\n\s*go\(false\);/, 'falls back to sign-up');
});

test('one timeline, no drift: the deck has no timers, listeners are removed, offscreen work stops', () => {
  const deck = read('./S01CapabilityDeck.tsx');
  const stage = deck.slice(deck.indexOf('function DeckStage('), deck.indexOf('function Gallery('));
  // the only timer replays one card's demo on request; card poses never depend on it
  assert.equal((stage.match(/setTimeout|setInterval/g) ?? []).length, 1, 'one replay timer');
  assert.match(stage, /return \(\) => window\.clearTimeout\(id\);/, 'and it is cleaned up');
  assert.match(stage, /deckFrame\(clamp\(-r\.top \/ dist\), layout\)/);
  assert.match(stage, /new IntersectionObserver/);
  assert.match(stage, /window\.removeEventListener\('scroll', onScroll\)/);
  assert.match(stage, /cancelAnimationFrame\(raf\)/);
  assert.doesNotMatch(deck, /scrollIntoView/);
});

test('S01 styles stay inside S01 and the homepage composes it between the hero and browser employees', () => {
  for (const f of ['./S01.module.css', './Card.module.css', './Vignettes.module.css', './Focus.module.css']) {
    const css = read(f);
    assert.doesNotMatch(css, /:global/, f);
    assert.doesNotMatch(css, /^(html|body|h[1-6]|header|nav|\.xv-)/m, f);
  }
  const page = read('../../homepage/HomepageClient.tsx');
  const hero = page.indexOf('<S00Hero />');
  const s01 = page.indexOf('<S01CapabilityDeck />');
  // Main's S02 replaces this section name; preserve the same strict ordering
  // assertion against either actual composition, not an obsolete literal.
  const next = page.indexOf('<S02Work ') >= 0 ? page.indexOf('<S02Work ') : page.indexOf('<HomepageBrowserEmployeesExact />');
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

test('chapter labels swap in sequence and never overlap', () => {
  const css = read('./S01.module.css');
  assert.match(css, /\.chapterName\[data-ch='A'\] \{\s*opacity: clamp\(0, 1 - var\(--mix, 0\) \* 2, 1\);/);
  assert.match(css, /\.chapterName\[data-ch='B'\] \{\s*opacity: clamp\(0, var\(--mix, 0\) \* 2 - 1, 1\);/);
});

test('Explore hit testing: only the visible front face takes the pointer, never the 3D containers', () => {
  // root cause of the founder's dead Explore button: the preserve-3d slot captured pointerup/click when the
  // tilted face dropped behind its plane
  const deck = read('./S01.module.css');
  assert.match(deck, /\.slot \{[\s\S]*?pointer-events: none;/);
  const card = read('./Card.module.css');
  assert.match(card, /\.front \{[\s\S]*?pointer-events: auto;/);
  assert.match(card, /\.card,\s*\.body,\s*\.back,\s*\.edge \{\s*pointer-events: none;/);
});

test('Browser & Testing is a portal access flow: navigate, detect, diagnose, fix, retest, verify', () => {
  const body = fnBody(read('./Vignettes.tsx'), 'Browser');
  assert.doesNotMatch(body, /Order confirmed|checkout|Pay \$/i);
  for (const s of ['403', 'No access to Dashboard', 'Cause', 'fix', 'Retested: 4/4 steps passed', 'Access flow verified']) assert.ok(body.includes(s), s);
  assert.match(read('./Vignettes.tsx'), /const ACCESS_STEPS = \['Invite', 'Accept', 'Sign in', 'Dashboard'\];/);
});

test('face sweep: a clipped band across the card face, transform only, event-driven, staggered and directional', () => {
  const css = read('./Card.module.css');
  assert.match(css, /\.sweep \{[\s\S]*?overflow: hidden;[\s\S]*?pointer-events: none;/);
  for (const k of ['sweepDownA', 'sweepDownB', 'sweepUpA', 'sweepUpB']) assert.ok(css.slice(css.indexOf(`@keyframes ${k} {`)).split('}\n}')[0].includes('translate3d'), k);
  const ms = [...css.matchAll(/animation: sweep\w+ (\d+)ms/g)].map((m) => Number(m[1]));
  assert.ok(ms.length >= 2 && ms.every((v) => v >= 650 && v <= 950), `sweep ${ms}`);
  assert.doesNotMatch(css, /sweep\w+ [^;]*infinite/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.sweep \{\s*display: none;/);
  assert.match(read('./S01CapabilityDeck.tsx'), /card\.dataset\.dir = i % 2 \? 'up' : 'down';/);
});

test('heading: two-line H2 with the vision line dominant; the detail card has a single Back to cards control', () => {
  const css = read('./S01.module.css');
  assert.match(css, /\.titleLead \{[\s\S]*?font-size: 0\.6em;/, 'the first line is smaller than the vision line');
  assert.match(read('./S01CapabilityDeck.tsx'), /<span className=\{s\.titleLead\}>\{SECTION\.title\.lead\}<\/span> <span className=\{s\.titleMain\} data-text=\{SECTION\.title\.main\}>\s*\{SECTION\.title\.main\}\s*<\/span>/);
  const focus = read('./CapabilityFocus.tsx');
  assert.equal((focus.match(/Back to cards/g) ?? []).length, 2, 'one button: its aria-label and its visible text');
  assert.match(focus, /<header className=\{f\.head\}>[\s\S]*?aria-label="Back to cards"/);
  assert.doesNotMatch(read('./Focus.module.css'), /\.secondary/);
});

test('no readable face ever passes over another: face-up cards never overlap anywhere in the scroll', () => {
  for (const [w, h] of [[1894, 896], [1440, 900], [1440, 690], [1280, 800], [1150, 666]]) {
    const L = withHeading(computeLayout(w, h), 300);
    for (let p = 0; p <= 1; p += 0.001) {
      const up = deckFrame(p, L).cards
        .filter((c) => c.o > 0.5 && c.flip > 0.5)
        .map((c) => { const half = (L.W / 2) * Math.abs(Math.cos((c.ry * Math.PI) / 180)) * c.s; return [c.x - half, c.x + half]; })
        .sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < up.length; i++) assert.ok(up[i - 1][1] - up[i][0] <= 1, `${w}x${h} p=${p.toFixed(3)} faces overlap`);
    }
  }
});

test('Super Intelligence shine: an overlay band over full-strength text, one pass then a long rest, only on screen', () => {
  const css = read('./S01.module.css');
  const after = css.slice(css.indexOf('.titleMain::after {'), css.indexOf('}', css.indexOf('.titleMain::after {')));
  assert.match(after, /content: attr\(data-text\) \/ '';/, 'the copy is not read twice by screen readers');
  assert.match(after, /pointer-events: none;/);
  assert.match(after, /animation-play-state: paused;/);
  assert.match(css, /\.section\[data-shine\] \.titleMain::after \{\s*animation-play-state: running;/);
  const [, cycle] = css.match(/animation: visionShine ([\d.]+)s/)!;
  const [, passPct] = css.match(/@keyframes visionShine \{\s*0% \{[^}]*\}\s*([\d.]+)%, 100%/)!;
  const pass = (Number(passPct) / 100) * Number(cycle);
  assert.ok(pass >= 1 && pass <= 1.4, `pass ${pass}s`);
  assert.ok(Number(cycle) - pass >= 7 && Number(cycle) - pass <= 11, `rest ${Number(cycle) - pass}s`);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.titleMain::after \{\s*display: none;/);
  // the resting text keeps its full colour (no transparent fill on the line itself)
  const main = css.slice(css.indexOf('.titleMain {'), css.indexOf('}', css.indexOf('.titleMain {')));
  assert.doesNotMatch(main, /transparent|opacity/);
});

test('one S01 narrative: no separate six-item strip or footer disclaimer; its useful points live in card details', () => {
  const deck = read('./S01CapabilityDeck.tsx');
  assert.doesNotMatch(deck, /PlatformStrip|One workspace\. More ways to work|SECTION\.note/);
  assert.doesNotMatch(read('./S01.module.css'), /\.platform/);
  const all = CAPABILITIES.flatMap((c) => c.details).join(' ');
  for (const idea of [/ordinary words, typed or by voice/, /custom MCP servers when a job needs them/, /desktop, laptop or phone browser/, /models and tools/]) {
    assert.match(all, idea);
  }
  assert.equal(CAPABILITIES.length, 8);
});

test('Galaxy field: budgeted, behind the cards, never takes the pointer, released on unmount', () => {
  const g = read('./GalaxyField.tsx');
  assert.match(g, /GALAXY_SCALE = 0\.5;/);
  assert.match(g, /GALAXY_FRAME_MS = 1000 \/ 30;/);
  assert.match(g, /new IntersectionObserver/);
  assert.match(g, /document\.hidden/);
  assert.match(g, /if \(reduced\) \{\s*draw\(4000\);/, 'reduced motion: one static frame');
  assert.match(g, /GALAXY_PROBE_LIMIT_MS/);
  assert.match(g, /loseContext\(\)/);
  assert.doesNotMatch(g, /mousemove|addEventListener\('mouse/);
  assert.match(g, /saturation: 0\.12,/);
  const css = read('./S01.module.css');
  assert.match(css, /\.galaxy \{[\s\S]*?pointer-events: none;[\s\S]*?mask-image/);
  const deck = read('./S01CapabilityDeck.tsx');
  assert.match(deck, /dynamic\(\(\) => import\('\.\/GalaxyField'\)[\s\S]*?ssr: false/);
  const stage = deck.slice(deck.indexOf('function DeckStage('), deck.indexOf('function Gallery('));
  assert.ok(stage.indexOf('<GalaxyField') < stage.indexOf('<ol className={s.deck}'), 'the field is behind the cards');
  assert.doesNotMatch(deck.slice(deck.indexOf('function Gallery(')), /<GalaxyField/, 'no WebGL field on phones and tablets');
});
