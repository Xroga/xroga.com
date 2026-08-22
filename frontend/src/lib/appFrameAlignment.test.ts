import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

/**
 * Guards for the application frame: the sidebar panel and the workspace window.
 *
 * Three reported mismatches, all from the two panels being described by rules that
 * nothing kept in step:
 *
 * 1. **Different heights.** The sidebar was inset by `--xv-sidebar-inset` (8px), the
 *    stage by its own padding (12px top, 14px bottom). Side by side, their tops and
 *    bottoms sat six pixels apart.
 * 2. **Different colours.** The sidebar painted `--surface-raised`, a near-white on the
 *    Beige theme, while the workspace showed Parchment's cream. Two whites in one window.
 * 3. **The logo ran under the toolbar.** `Logo` sets its width as an inline style, which
 *    no stylesheet can cap, so at the default sidebar width the mark showed through
 *    behind the first icon.
 *
 * Each is checked as a *shared source*, not as a pair of matching values: two literals
 * that happen to agree today is the bug, one variable that both read is the fix.
 */

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const CSS = read('../app/globals.css');
const UIVERSE = read('../styles/uiverse.css');
const LOGO = read('../components/layout/Logo.tsx');
const SIDEBAR = read('../components/layout/Sidebar.tsx');

const THEMES = ['black', 'gray', 'white', 'beige'] as const;

/** Every custom property a theme declares, merged across all of its rules. */
function themeVars(theme: string): Map<string, string> {
  const found = new Map<string, string>();
  const pattern = new RegExp(`(?:^|\\n)body\\.theme-${theme} \\{([^}]*)\\}`, 'g');
  for (const match of CSS.matchAll(pattern)) {
    for (const decl of match[1].matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
      found.set(decl[1], decl[2].trim());
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// One gutter
// ---------------------------------------------------------------------------

test('the sidebar and the stage measure from the same gutter', () => {
  // Not "both are 14px" — that is two literals agreeing by luck, which is what drifted.
  assert.match(CSS, /--xv-app-gutter:\s*\d+px/, 'the shared gutter is gone');
  assert.match(
    UIVERSE,
    /--xv-sidebar-inset:\s*var\(--xv-app-gutter/,
    'the sidebar went back to its own inset',
  );
  assert.match(
    CSS,
    /\.xv-app-stage[^{]*\{[^}]*padding:\s*var\(--xv-app-gutter\)/,
    'the stage went back to its own padding',
  );
});

test('the stage pads every side equally, so the two panels line up top and bottom', () => {
  // The reported gap came from `12px 14px 14px`: a different top to the sidebar's.
  const rule = CSS.slice(CSS.lastIndexOf('\n.xv-app-stage,'));
  const padding = rule.match(/padding:\s*([^;]+);/)?.[1].trim() ?? '';
  assert.equal(
    /\s/.test(padding),
    false,
    `the stage padding is multi-value ("${padding}"), so its vertical inset can differ from the sidebar's`,
  );
});

test('the sidebar radius follows the same responsive step as the window', () => {
  assert.match(UIVERSE, /--xv-sidebar-radius:\s*var\(--xv-app-radius/);
  assert.match(CSS, /--xv-app-radius:\s*\d+px/);
});

// ---------------------------------------------------------------------------
// One surface
// ---------------------------------------------------------------------------

test('every theme declares the shared panel surface', () => {
  for (const theme of THEMES) {
    const vars = themeVars(theme);
    assert.ok(vars.has('--app-panel'), `theme-${theme} has no --app-panel`);
    assert.ok(vars.has('--app-panel-border'), `theme-${theme} has no --app-panel-border`);
  }
});

/** One rule's declarations, bounded by its own closing brace. */
function ruleBody(css: string, selector: string): string {
  const at = css.indexOf(`${selector} {`);
  if (at === -1) return '';
  const open = css.indexOf('{', at);
  return css.slice(open + 1, css.indexOf('}', open));
}

test('the sidebar paints the shared surface, not its own', () => {
  // Bounded to each rule: reading to the end of the file lets the *other* panel's
  // correct background satisfy the assertion for a broken one.
  for (const selector of ['.xv-sidebar-floating', '.xv-sidebar-floating--mobile']) {
    const body = ruleBody(UIVERSE, selector);
    assert.notEqual(body, '', `${selector} is gone`);
    assert.match(body, /background:\s*var\(--app-panel/, `${selector} does not paint the shared surface`);
  }
});

test('the sidebar surface matches what the workspace shows for that theme', () => {
  // `--app-panel` must equal the surface of the skin each theme resolves to, or the
  // two panels are the same shape in two different colours again.
  const skinSurface: Record<string, string> = {
    black: '#000000',
    gray: '#2a2a2a',
    white: '#ffffff',
    beige: '#fdf6e3',
  };
  for (const theme of THEMES) {
    const panel = themeVars(theme).get('--app-panel')!.toLowerCase();
    assert.equal(
      panel,
      skinSurface[theme],
      `theme-${theme} paints the sidebar ${panel} but the workspace ${skinSurface[theme]}`,
    );
  }
});

test('the opaque panel drops the blur it no longer needs', () => {
  const panel = UIVERSE.slice(
    UIVERSE.indexOf('.xv-sidebar-floating {'),
    UIVERSE.indexOf('.xv-sidebar-root.is-collapsed .xv-sidebar-floating'),
  );
  assert.equal(/backdrop-filter/.test(panel), false, 'the blur came back on an opaque surface');
});

// ---------------------------------------------------------------------------
// The logo cannot overflow its box
// ---------------------------------------------------------------------------

test('the logo caps itself where its width is actually set', () => {
  // The width is an inline style, so a stylesheet cannot cap it — the cap has to sit
  // beside it. Both the link and the inner box need it: capping only the inner box
  // measures 100% of an uncapped parent and changes nothing, which is exactly what
  // the first attempt at this did.
  assert.match(LOGO, /style=\{\{ height, width, maxWidth: '100%', background: 'transparent' \}\}/);
  assert.match(LOGO, /style=\{\{ background: 'transparent', maxWidth: '100%', minWidth: 0 \}\}/);
});

test('the brand row lets the logo give way to the toolbar', () => {
  // `block` makes the tip wrapper `w-full`, so the logo claimed the whole row and the
  // `ml-auto` toolbar was laid on top of it.
  const brand = SIDEBAR.slice(SIDEBAR.indexOf('xv-sidebar-brand'), SIDEBAR.indexOf('xv-sidebar-header-actions'));
  assert.match(brand, /<HoverTip label="Xroga AI"/);
  assert.equal(
    /<HoverTip label="Xroga AI"[^>]*block=\{navExpanded\}/.test(brand),
    false,
    'the logo tip is full-width again and the toolbar will overlap it',
  );
  assert.match(brand, /className=\{navExpanded \? 'shrink min-w-0' : 'shrink-0'\}/);
});

test('the toolbar holds its width while the logo shrinks', () => {
  const bar = CSS.slice(CSS.lastIndexOf('\n.xv-sidebar-header-actions {'));
  const shrink = CSS.match(/\.xv-sidebar-header-actions \{[^}]*flex-shrink:\s*0/);
  assert.ok(bar.length > 0, 'the toolbar rule is gone');
  assert.ok(
    shrink || /\.xv-sidebar-header-actions \{\s*margin-left: auto;\s*flex-shrink: 0;/.test(CSS),
    'the toolbar can shrink, so its controls will squash instead of the logo giving way',
  );
});
