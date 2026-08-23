import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

/**
 * Guards for the homepage hero headline.
 *
 * "The Agentic Way to Build & Ship" is one sentence carried by four typographic voices:
 * a small mono label, the mono display word, a mono tag on the accent, and the italic
 * serif payoff. Three things about that are easy to break.
 *
 * **It has to stay one sentence.** The four spans are flex items in a column, so with no
 * whitespace between them `textContent` reads "TheAgenticWay toBuild & Ship" — which is
 * what copy-paste and any text extraction get. Whitespace-only text in a flex container
 * is not rendered as an item, so the separators cost nothing visually.
 *
 * **It has to follow the theme.** The reference it came from is white-on-black. Any
 * literal ink here pins the composition to that one theme while the rest of the homepage
 * moves with the picker.
 *
 * **The tag is the exception.** Its label is white in all four themes, because it sits on
 * `--hc-blue`, which is dark on every theme including the Beige brown. That is a colour
 * chosen for a fill, not a colour someone forgot to tokenise.
 */

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const PAGE = read('../app/page.tsx');
const CSS = read('../styles/homepage-coding.css');

const PARTS = ['the', 'agentic', 'way', 'ship'] as const;

/** The declarations of one rule, bounded by its own closing brace. */
function ruleBody(selector: string): string {
  const at = CSS.indexOf(`${selector} {`);
  assert.notEqual(at, -1, `${selector} is missing from the sheet`);
  const open = CSS.indexOf('{', at);
  return CSS.slice(open + 1, CSS.indexOf('}', open));
}

test('the headline reads as one sentence', () => {
  const block = /<p className="xv-hc-headline">([\s\S]*?)<\/p>/.exec(PAGE);
  assert.ok(block, 'the headline paragraph is missing');

  const words = [...block[1].matchAll(/>([^<>{}]+)<\/span>/g)].map((m) => m[1].trim());
  assert.deepEqual(words, ['The', 'Agentic', 'Way to', 'Build &amp; Ship']);

  // Flex items with nothing between them concatenate in textContent.
  const separators = [...block[1].matchAll(/<\/span>\{' '\}/g)].length;
  assert.equal(
    separators,
    words.length - 1,
    'each pair of spans needs a whitespace separator or the sentence runs together',
  );
});

test('every part is styled', () => {
  for (const part of PARTS) {
    assert.ok(
      PAGE.includes(`xv-hc-headline__${part}`),
      `the ${part} span is missing from the markup`,
    );
    ruleBody(`.xv-home-coding .xv-hc-headline__${part}`);
  }
});

test('the composition uses the two display faces, not the UI sans', () => {
  for (const part of ['the', 'agentic', 'way'] as const) {
    const body = ruleBody(`.xv-home-coding .xv-hc-headline__${part}`);
    assert.match(
      body,
      /font-family:\s*var\(--hc-font-pixel\)/,
      `${part} must use the mono display face`,
    );
  }
  const ship = ruleBody('.xv-home-coding .xv-hc-headline__ship');
  assert.match(ship, /font-style:\s*italic/, 'the payoff is set in italic');
  assert.match(
    ship,
    /var\(--font-claude-serif\)/,
    'the payoff uses the high-contrast serif, not the UI sans',
  );
});

test('the tag is a parallelogram on the accent', () => {
  const body = ruleBody('.xv-home-coding .xv-hc-headline__way');
  assert.match(body, /background:\s*var\(--hc-blue\)/, 'the tag rides the theme accent');
  assert.match(body, /clip-path:\s*polygon/, 'the trailing edge is cut, not skewed');
  // A skew would lean the letters with the box; the clip leaves them upright.
  assert.ok(!/transform:\s*skew/.test(body), 'skewing the box would lean the label too');
});

test('nothing but the tag label pins itself to one theme', () => {
  for (const part of PARTS) {
    const body = ruleBody(`.xv-home-coding .xv-hc-headline__${part}`);
    const colour = /(?:^|;)\s*color:\s*([^;]+)/.exec(body)?.[1]?.trim();
    if (!colour) continue; // inherits from the block, which is what we want
    if (part === 'way') {
      assert.equal(colour, '#ffffff', 'the tag label sits on a dark fill in all four themes');
      continue;
    }
    assert.ok(
      colour.includes('var(--hc-'),
      `${part} sets "${colour}" instead of a theme token, so it cannot follow the picker`,
    );
  }
  const block = ruleBody('.xv-home-coding .xv-hc-headline');
  assert.match(block, /color:\s*var\(--hc-ink\)/, 'the block inherits the theme ink');
});

test('the replaced emphasis span is gone from markup and sheet', () => {
  // It was the old headline's only styled fragment; leaving the rules behind would let
  // a future edit reintroduce a span nothing renders.
  assert.ok(!PAGE.includes('xv-hc-headline-em'), 'the old emphasis span is still in the markup');
  assert.ok(!CSS.includes('xv-hc-headline-em'), 'dead rules for the old emphasis span remain');
});
