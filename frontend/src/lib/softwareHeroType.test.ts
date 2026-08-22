import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

/**
 * Guards for the editorial serif in the `/software` hero.
 *
 * The failure this file exists to catch is a silent one. `font-family: var(--x)` where
 * `--x` resolves to nothing is not an error — the declaration becomes invalid at
 * computed-value time and the element quietly inherits the surrounding sans. The page
 * still renders, nothing warns, and the only symptom is that the type looks unchanged.
 *
 * That is exactly what happened here. `--font-claude` is declared on `:root`, but it is
 * built out of the next/font variables, and those are only defined on `<body>` and
 * below. On `html` the substitution finds nothing, the token is guaranteed-invalid, and
 * every descendant inherits the empty value. Measuring in a browser showed `.xsw-h1`
 * computing to `goga` while the weight and tracking from the same rule applied normally.
 *
 * So two things are checked, and neither is "the CSS mentions a serif":
 *
 * 1. The hero names the face variables that are actually defined at that level, not the
 *    `:root` token that is not.
 * 2. Each hero selector is declared exactly once. A second block later in the sheet
 *    would win on any property both set — which is how the lede's `font-size` was dead
 *    on arrival the first time this was written.
 */

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const CSS = read('../styles/software-landing.css');
const GLOBALS = read('../app/globals.css');
const FONTS = read('./fonts.ts');

/**
 * Every top-level rule body whose selector list is exactly `selector`.
 *
 * Nesting depth is tracked so that responsive overrides inside `@media` are skipped:
 * a narrow-viewport `font-size` is a deliberate override, not the duplication this
 * file is looking for. Only the base rules compete with each other.
 */
function bodies(css: string, selector: string): string[] {
  const found: string[] = [];
  const needle = `${selector} {`;
  let depth = 0;
  let cursor = 0;
  while (cursor < css.length) {
    const open = css.indexOf('{', cursor);
    const close = css.indexOf('}', cursor);
    if (open === -1 && close === -1) break;

    if (open !== -1 && (close === -1 || open < close)) {
      const prelude = css.slice(cursor, open + 1);
      if (depth === 0 && prelude.trimStart().startsWith('@')) {
        depth += 1; // an at-rule block; its contents are nested
        cursor = open + 1;
        continue;
      }
      if (depth === 0 && css.slice(0, open + 1).endsWith(needle)) {
        found.push(css.slice(open + 1, css.indexOf('}', open)));
      }
      depth += 1;
      cursor = open + 1;
    } else {
      depth = Math.max(0, depth - 1);
      cursor = close + 1;
    }
  }
  return found;
}

/** The one base rule body for `selector`, asserting there is exactly one. */
function only(css: string, selector: string): string {
  const all = bodies(css, selector);
  assert.equal(
    all.length,
    1,
    `${selector} has ${all.length} base rules; a later block would override the earlier one`,
  );
  return all[0];
}

const HERO_SELECTORS = ['.xsw-h1', '.xsw-hero__lede'];

test('the hero type is declared once per selector', () => {
  for (const selector of HERO_SELECTORS) only(CSS, selector);
});

test('the hero uses the serif face variables, not the empty :root token', () => {
  for (const selector of HERO_SELECTORS) {
    const body = only(CSS, selector);
    const family = /font-family:([^;]+);/.exec(body)?.[1];
    assert.ok(family, `${selector} must set font-family`);

    // The token that computes to nothing must not be what the face hangs on.
    assert.ok(
      !/var\(\s*--font-claude\s*[),]/.test(family),
      `${selector} must not resolve its face through --font-claude, which is declared on :root where the font variables do not exist`,
    );
    assert.ok(
      family.includes('var(--font-claude-serif)'),
      `${selector} must name --font-claude-serif, which is defined on <body>`,
    );
    // A bundled second serif, then real system serifs — never a bare `serif` alone,
    // and never an implicit fall back into the UI sans.
    assert.ok(
      family.includes('var(--font-source-serif)') && family.trimEnd().endsWith('serif'),
      `${selector} must fall back through --font-source-serif to a serif stack`,
    );
  }
});

test('the serif variables the hero names are actually produced', () => {
  // The guard above is only meaningful if something defines these. Both come from
  // next/font declarations that must stay in the root variable list.
  for (const variable of ['--font-claude-serif', '--font-source-serif']) {
    assert.ok(
      FONTS.includes(`variable: '${variable}'`),
      `${variable} must be declared by a next/font face in fonts.ts`,
    );
  }
  for (const face of ['claudeSerif.variable', 'sourceSerif.variable']) {
    assert.ok(
      FONTS.includes(face),
      `${face} must stay in rootFontVariables or the hero loses its face`,
    );
  }
});

test('the diagnosis this guard rests on still holds', () => {
  // If --font-claude is ever moved somewhere the font variables exist, the workaround
  // above stops being necessary and this test should be revisited rather than trusted.
  const rootBlock = /:root\s*\{([\s\S]*?)\}/.exec(GLOBALS)?.[1] ?? '';
  assert.ok(
    rootBlock.includes('--font-claude:'),
    '--font-claude is expected to be declared on :root; if it moved, re-check whether the hero can use the token directly',
  );
});

test('the hero keeps serif-appropriate weight and tracking', () => {
  const h1 = only(CSS, '.xsw-h1');
  const weight = Number(/font-weight:\s*(\d+)/.exec(h1)?.[1]);
  assert.ok(
    weight <= 500,
    `a serif headline at ${weight} reads heavy rather than confident; the sans-era 700 must not come back`,
  );
  const tracking = Number(/letter-spacing:\s*(-?[\d.]+)em/.exec(h1)?.[1]);
  assert.ok(
    tracking > -0.025,
    `${tracking}em is tight enough to jam a serif's thick-thin transitions`,
  );
});
