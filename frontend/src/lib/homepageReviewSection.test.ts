import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

/**
 * Guards for the "Built for real review" section.
 *
 * It used to be an absolutely-positioned stage: four concept chips floated around
 * the infinity graphic, four capability cards pinned to the bottom, and a fixed
 * `min-height` holding the panel open because nothing inside it was in flow. The
 * compact version pairs each signal with the capability it buys, puts the heading
 * beside the graphic instead of above it, and lets the panel size to its contents.
 *
 * Three things are worth pinning down.
 *
 * **The old rules must actually be gone.** They sat later in the sheet than the
 * layout they were overriding, so any that survive win on shared properties and
 * quietly re-impose the old geometry on the new markup — a fixed `min-height`
 * being the one that shows up as a slab of empty panel under the cards.
 *
 * **The stage paints its own dark ground on every theme.** Copy on it is therefore
 * fixed light rather than theme ink, which would compute near-black on the light
 * themes and disappear.
 *
 * **One qualifier is load-bearing.** The reference this was built from shortened
 * the last card to "validate → publish". Xroga does not publish unattended, so the
 * "when authorised" clause stays: it is a claim about behaviour, not decoration.
 */

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const TSX = read('../components/homepage/HomepageEnterpriseProof.tsx');
const CSS = read('../styles/homepage-coding.css');

/** CSS with comments stripped, so prose about a rule cannot satisfy a search for it. */
const code = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

test('the two lists are merged into one row of four', () => {
  assert.match(TSX, /const SIGNALS = \[/, 'the merged list is missing');
  assert.ok(!/const CONCEPTS =|const CAPABILITIES =/.test(TSX), 'the two old lists are still separate');

  const entries = [...TSX.matchAll(/code: '(\d\d) \/ [A-Z]+ SIGNAL'/g)].map((m) => m[1]);
  assert.deepEqual(entries, ['01', '02', '03', '04'], 'four signals, numbered in order');

  // Each card carries both halves, which is what collapsed two rows into one.
  assert.equal((TSX.match(/capTitle:/g) ?? []).length, 4, 'every signal needs its capability');
  assert.match(TSX, /className="xv-er-signal-cap"/, 'the capability half is not rendered');
});

test('the heading shares a row with the graphic', () => {
  assert.match(TSX, /<div className="xv-er-top">/, 'the two-column row is missing');
  const top = TSX.slice(TSX.indexOf('xv-er-top'), TSX.indexOf('</div>\n\n          <ol'));
  assert.ok(top.includes('xv-er-heading') && top.includes('<InfinitySystem />'), 'both belong in the row');

  const at = code.indexOf('.xv-home-coding .xv-er-top {');
  assert.notEqual(at, -1, 'the row has no styles');
  const body = code.slice(code.indexOf('{', at) + 1, code.indexOf('}', at));
  assert.match(body, /grid-template-columns:\s*minmax/, 'the row should be a two-column grid');
});

test('nothing holds the panel open any more', () => {
  // The floor existed only because the old contents could not size the stage.
  assert.ok(
    !/\.xv-er-stage\s*\{[^}]*min-height/.test(code),
    'the stage has a min-height again, which shows up as empty panel below the cards',
  );
  for (const dead of ['xv-er-concepts', 'xv-er-concept', 'xv-er-capabilities']) {
    assert.ok(!code.includes(dead), `${dead} rules survive and will fight the new layout`);
    assert.ok(!TSX.includes(dead), `${dead} is still in the markup`);
  }
});

test('the four cards read as one system', () => {
  // They were four different hues before — blue, violet, cyan, indigo — which made
  // four views of one run look like four unrelated products.
  const tones = [...code.matchAll(/--cap-tone:\s*(#[0-9a-f]{3,6})/gi)].map((m) => m[1].toLowerCase());
  assert.ok(tones.length > 0, 'the card tone is gone entirely');
  assert.equal(new Set(tones).size, 1, `cards carry ${new Set(tones).size} tones; they should share one`);
});

test('copy on the stage does not follow the theme ink', () => {
  // The stage is dark on all four themes, so theme ink would go near-black on White
  // and Beige and vanish.
  const at = code.indexOf('body .xv-home-coding .xv-er-stage .xv-er-signals h3');
  assert.notEqual(at, -1, 'the stage no longer pins its heading colour');
  assert.match(code.slice(at, at + 160), /color:\s*#fff/, 'signal headings must stay light on the dark stage');
});

test('the authorisation qualifier survives the shortening', () => {
  // Every other line was trimmed for the compact card. This one describes what the
  // product will not do on its own, so it is not a candidate for trimming.
  assert.match(
    TSX,
    /validate → publish when authorised/,
    'the workflow line must not claim unattended publishing',
  );
});
