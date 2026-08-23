import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

/**
 * Guards for the homepage build strip, and for what it replaced.
 *
 * The strip carries the ten things Xroga can build, laid out flat below the composer.
 * That content used to cycle one word at a time in the hero, which meant nine of the ten
 * were invisible at any moment. The rotator, its timer and the standalone XROGA wordmark
 * are all gone with it.
 *
 * Three things are easy to get wrong on the way back:
 *
 * 1. **Losing the h1.** The wordmark was the page's only `h1`. Deleting it without
 *    promoting the headline leaves the homepage with no top-level heading at all.
 * 2. **Leaving the rotator's machinery behind.** A `setInterval` with no consumer keeps
 *    firing; dead state keeps re-rendering. None of it shows up as a visual defect.
 * 3. **Reproducing third-party marks.** The reference draws the Apple, Chrome and
 *    Android logos. Those are trademarks, and Apple's guidelines do not permit others to
 *    reproduce theirs. The platform names in the labels carry the same information and
 *    are fair to use; the glyphs stay neutral.
 */

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const PAGE = read('../app/page.tsx');
const STRIP = read('../components/homepage/HomepageBuildStrip.tsx');
const CSS = read('../styles/homepage-coding.css');

/** The ten build targets, as the strip lists them. */
const TARGETS = [
  'Dashboards', 'Desktop', 'Landing', 'Mobile', 'iOS',
  'Chrome', 'Android', 'Debug', 'Website', 'SaaS',
];

test('the strip renders below the composer', () => {
  assert.ok(PAGE.includes('<HomepageBuildStrip />'), 'the strip must be rendered');
  const chat = PAGE.indexOf('<HomepageChatBar />');
  const strip = PAGE.indexOf('<HomepageBuildStrip />');
  assert.ok(chat !== -1 && strip > chat, 'the strip belongs after the composer, not before it');
});

test('every build target is listed', () => {
  for (const target of TARGETS) {
    assert.ok(STRIP.includes(target), `${target} is missing from the strip`);
  }
  assert.ok(/Build\. Launch\./.test(STRIP), 'the motto is missing');
  assert.ok(/And<br \/>More/.test(STRIP), 'the end cap is missing');
});

test('the rotator and its machinery are gone', () => {
  for (const trace of ['HERO_BUILD_WORDS', 'buildWordIdx', 'activeBuildWord', 'xv-hc-target-stage']) {
    assert.ok(!PAGE.includes(trace), `${trace} is still in the page`);
  }
  // A timer with no consumer keeps firing and shows up as nothing at all.
  assert.ok(
    !/setInterval[\s\S]{0,120}BuildWord/.test(PAGE),
    'the rotator interval is still scheduled',
  );
});

test('removing the wordmark did not cost the page its heading', () => {
  assert.ok(!PAGE.includes('xv-hc-brand'), 'the standalone XROGA wordmark should be gone');
  const headings = [...PAGE.matchAll(/<h1[\s>]/g)].length;
  assert.equal(headings, 1, 'the homepage needs exactly one h1');
  assert.ok(
    /<h1 className="xv-hc-headline">/.test(PAGE),
    'the hero headline should carry the h1 the wordmark used to',
  );
});

test('no third-party logo is reproduced', () => {
  // The platform is named in the label; the glyph beside it is a generic one.
  assert.ok(
    !/simpleicons|\bAppleIcon\b|\bChromeIcon\b|\bAndroidIcon\b|apple-logo|<path[^>]*apple/i.test(STRIP),
    'the strip must not reproduce a third-party brand mark',
  );
  // The names themselves are the informative part and must stay.
  for (const platform of ['iOS', 'Chrome', 'Android']) {
    assert.ok(STRIP.includes(platform), `${platform} should still be named in a label`);
  }
});

test('the strip stays compact and self-contained', () => {
  const at = CSS.indexOf('.xv-home-coding .xv-hc-strip {');
  assert.notEqual(at, -1, 'the strip has no styles');
  const body = CSS.slice(CSS.indexOf('{', at) + 1, CSS.indexOf('}', at));

  // Its own blue on every theme: the panel is a device, not a page surface, so its
  // text must never inherit the theme ink and end up dark on dark blue.
  assert.ok(/background:\s*linear-gradient/.test(body), 'the panel paints its own ground');
  assert.ok(!/var\(--hc-ink\)/.test(body), 'the panel must not inherit the theme ink onto its own blue');

  // Padding is what decides whether "compact" survives a later edit.
  const padding = /padding:\s*([\d.]+)rem/.exec(body)?.[1];
  assert.ok(padding && Number(padding) <= 0.6, `the strip padding is ${padding}rem; it is meant to be a thin bar`);
});

test('the hero badge is gone', () => {
  assert.ok(!PAGE.includes('xv-hc-badge'), 'the XROGA AI CODING AGENT badge should be removed');
});

test('twenty languages ship with their own marks', () => {
  const LANGS = read('./codingLanguages.ts');

  // From the package, not its CDN: the marks belong in the bundle rather than behind a
  // runtime dependency on a third-party host, and an unknown slug becomes a build error
  // instead of a broken image nobody sees until production.
  assert.ok(LANGS.includes("from 'simple-icons'"), 'the marks come from the package');
  assert.ok(!/cdn\.simpleicons\.org/.test(LANGS + STRIP), 'no runtime CDN dependency');

  const imported = [...LANGS.matchAll(/^\s{2}(si[A-Z]\w*),$/gm)].map((m) => m[1]);
  assert.equal(imported.length, 20, `expected 20 language marks, found ${imported.length}`);
  assert.equal(new Set(imported).size, 20, 'each language appears once');

  // Names come from the icon itself, so a mark can never be shown under another
  // project's name — the reason Java and C# are not in this list at all.
  assert.ok(LANGS.includes('title: icon.title'), 'the label must come from the mark');
  assert.ok(!/'Java'|"Java"|'C#'|"C#"/.test(LANGS), 'no mark may be relabelled as one it is not');

  assert.ok(STRIP.includes('CODING_LANGUAGES'), 'the strip renders the language lane');
  assert.ok(/<path d=\{lang\.path\}/.test(STRIP), 'each logo draws its own official path');
});

test('the strip wraps so each lane gets its own row', () => {
  const at = CSS.indexOf('.xv-home-coding .xv-hc-strip {');
  const body = CSS.slice(CSS.indexOf('{', at) + 1, CSS.indexOf('}', at));
  // Without this the lane is a flex item on the build-target row and squeezes five of
  // the ten out of view, with the end cap landing mid-row.
  assert.match(body, /flex-wrap:\s*wrap/, 'the strip must wrap or the two lanes fight for one row');

  const laneAt = CSS.indexOf('.xv-home-coding .xv-hc-strip__langs {');
  assert.notEqual(laneAt, -1, 'the language lane has no styles');
  const lane = CSS.slice(CSS.indexOf('{', laneAt) + 1, CSS.indexOf('}', laneAt));
  assert.match(lane, /flex:\s*1 1 100%/, 'the lane takes a full row of its own');
});

test('the narrow layout scrolls the list rather than crushing it', () => {
  // Ten cells will not fit a phone. They keep their size and the row scrolls.
  const at = CSS.indexOf('.xv-home-coding .xv-hc-strip__item {');
  const body = CSS.slice(CSS.indexOf('{', at) + 1, CSS.indexOf('}', at));
  assert.match(body, /min-width:\s*\d+px/, 'each cell needs a floor so labels do not wrap to nothing');
  const listAt = CSS.indexOf('.xv-home-coding .xv-hc-strip__list {');
  const listBody = CSS.slice(CSS.indexOf('{', listAt) + 1, CSS.indexOf('}', listAt));
  assert.match(listBody, /overflow-x:\s*auto/, 'the list must scroll when it cannot fit');
});
