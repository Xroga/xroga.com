import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

/**
 * Guards for the sidebar's chrome and its interaction states.
 *
 * Two changes here, and each has a way of quietly coming undone.
 *
 * **The rule above the nav.** The brand block carried a `border-b`, which drew a
 * hairline directly above the Workspace row. It is gone, and the thing most likely
 * to bring it back is someone re-adding a border to the same block while restyling
 * the header.
 *
 * **The interaction treatment.** Hover was a flat fill swap. It is now a wash, a
 * leading-edge rail and a small shift, built entirely from the theme's own ink so
 * one rule lands correctly on all four themes. The failure mode is subtle: a
 * literal colour looks right in whichever theme the author happened to be viewing
 * and wrong in the other three, and nothing about that shows up as an error.
 */

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const SIDEBAR = read('../components/layout/Sidebar.tsx');
const CSS = read('../styles/uiverse.css');

/**
 * The declarations of the rule this selector belongs to.
 *
 * These rules are written as grouped selector lists — the link, the button and the
 * tip-wrapped link all share one body — so a selector is usually followed by a
 * comma rather than by its brace. Matching only `selector {` finds none of them.
 */
function ruleBody(selector: string): string {
  const match = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[,{]`).exec(CSS);
  assert.ok(match, `${selector} is missing from the sheet`);
  const open = CSS.indexOf('{', match.index);
  return CSS.slice(open + 1, CSS.indexOf('}', open));
}

test('no rule is drawn above the first nav row', () => {
  const at = SIDEBAR.indexOf("'xv-sidebar-brand");
  assert.notEqual(at, -1, 'the brand block has been renamed');
  const classes = SIDEBAR.slice(at, SIDEBAR.indexOf(',', at));
  assert.ok(
    !/border-b/.test(classes),
    'the brand block draws a hairline above the Workspace row again',
  );
});

test('hover is more than a colour change', () => {
  const hover = ruleBody('.xv-sidebar-menu a:hover');
  // The row moves, and the fill it used to swap is now carried by the wash layer.
  assert.match(hover, /transform:\s*translateX/, 'the row should shift on hover');
  assert.ok(!/background:\s*var\(--surface-inset\)/.test(hover), 'the flat fill swap is back');

  const wash = ruleBody('.xv-sidebar-menu a::before');
  assert.match(wash, /opacity:\s*0/, 'the wash starts hidden');
  assert.match(wash, /transform:\s*scale\(0\.96\)/, 'the wash scales in');
  assert.match(wash, /z-index:\s*-1/, 'the wash must sit behind the label, not over it');

  const rail = ruleBody('.xv-sidebar-menu a::after');
  assert.match(rail, /height:\s*0/, 'the rail grows from nothing');
  assert.match(rail, /background:\s*var\(--accent\)/, 'the rail rides the theme accent');
});

test('the treatment is built from theme tokens, not one theme\'s colours', () => {
  // A literal hex here would look correct in whichever theme it was written for and
  // wrong in the other three, with nothing to signal it.
  for (const selector of ['.xv-sidebar-menu a::before', '.xv-sidebar-menu a::after']) {
    const body = ruleBody(selector);
    assert.ok(
      !/#[0-9a-f]{3,8}\b/i.test(body) && !/\brgba?\(/.test(body),
      `${selector} pins a literal colour instead of a theme token`,
    );
  }
  // The wash is the theme ink at low alpha, which is what makes it a dark veil on
  // the light themes and a light one on the dark themes.
  assert.match(ruleBody('.xv-sidebar-menu a::before'), /color-mix\(in srgb, var\(--text-primary\)/);
});

test('a press reads differently from a hover', () => {
  const press = ruleBody('.xv-sidebar-menu a:active');
  assert.match(press, /scale\(/, 'the pressed row should settle, not just stay put');
  assert.match(press, /transition-duration:\s*\d+ms/, 'the press should react faster than the hover');
});

test('the selected row keeps its solid pill and drops the hover layers', () => {
  // Both would sit under an opaque fill, and the rail would compete with the pill
  // as a second marker for the same state.
  const suppressed = CSS.indexOf('.xv-sidebar-menu a.xv-active::before');
  assert.notEqual(suppressed, -1, 'the active row still paints the hover layers');
  assert.match(CSS.slice(suppressed, suppressed + 400), /content:\s*none/);

  const active = ruleBody('.xv-sidebar-menu a.xv-active');
  assert.match(active, /background:\s*var\(--text-primary\)/, 'the active pill inverts the theme');
});

test('reduced motion keeps the feedback and drops the travel', () => {
  const at = CSS.indexOf('@media (prefers-reduced-motion: reduce)', CSS.indexOf('.xv-sidebar-menu'));
  assert.notEqual(at, -1, 'the sidebar rows ignore prefers-reduced-motion');
  const block = CSS.slice(at, at + 2000);
  assert.match(block, /transform:\s*none/, 'the row should stop travelling');
  // Suppressing the state change entirely would leave the nav less usable for the
  // people the setting exists to help, so the wash must still resolve to visible.
  assert.match(block, /transform:\s*scale\(1\)/, 'the wash should still appear, just not animate');
});
