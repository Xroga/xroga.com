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
const APPSHELL = read('../components/layout/AppShell.tsx');

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

// ---------------------------------------------------------------------------
// One surface for the whole page, not just the two panels
// ---------------------------------------------------------------------------

test('every theme grounds the page in the shared panel surface', () => {
  // The desk behind the window carried a shade of its own — #efe8d9 under a #fdf6e3
  // workspace — so the page showed three near-misses at once instead of one theme.
  // Checked as a reference, not as a matching literal: a table that repeated the
  // panel's hex four times would drift again the first time one of them changed.
  for (const theme of THEMES) {
    const ground = themeVars(theme).get('--stage-ground');
    assert.equal(
      ground,
      'var(--app-panel)',
      `theme-${theme} grounds the page in ${ground} rather than the shared surface`,
    );
  }
});

test('the ground carries no glow that would tint it off the panel', () => {
  // A radial wash over the ground is a colour the panel does not have, which is the
  // same mismatch by another name.
  for (const theme of THEMES) {
    assert.equal(themeVars(theme).get('--stage-glow'), 'none', `theme-${theme} tints its ground`);
  }
});

test('the page behind the sidebar column is painted, and from the same variable', () => {
  // The stage starts where the sidebar column ends, so it never covered the strip
  // beside it — that strip showed the marketing page's background through the app.
  assert.match(CSS, /\.xv-app-ground \{[^}]*background:\s*var\(--app-panel\)/);
  assert.match(
    APPSHELL,
    /isDashboard[\s\S]{0,200}'xv-app-ground/,
    'the workspace no longer applies the ground class',
  );
});

// ---------------------------------------------------------------------------
// The collapsed rail stays inside its own column
// ---------------------------------------------------------------------------

test('the collapsed rail is bounded by its column instead of sizing to its content', () => {
  // `width: max-content` let the rail grow to fit a horizontal row of controls, so at
  // 64px wide it ran to 154px and the toolbar sat on top of the workspace.
  const rule = ruleBody(UIVERSE, '.xv-sidebar-root.is-collapsed .xv-sidebar-floating');
  assert.notEqual(rule, '', 'the collapsed rail rule is gone');
  assert.equal(
    /width:\s*max-content/.test(rule),
    false,
    'the collapsed rail sizes to its content again and will overflow its column',
  );
  assert.match(rule, /width:\s*calc\(100% - \(var\(--xv-sidebar-inset\)/);
});

test('the collapsed controls stack under the logo rather than beside it', () => {
  const rule = CSS.slice(CSS.indexOf('.xv-sidebar-collapsed-actions {'));
  const body = rule.slice(rule.indexOf('{') + 1, rule.indexOf('}'));
  assert.match(body, /flex-direction:\s*column/, 'the collapsed controls are laid out in a row again');
  // The markup has to agree — the CSS column is defeated by a `flex items-center` row.
  assert.match(
    SIDEBAR,
    /navExpanded \? 'w-full gap-2' : 'flex-col gap-2'/,
    'the collapsed brand row lays the logo and controls out side by side again',
  );
});

test('the collapsed controls carry no surface of their own', () => {
  const rule = CSS.slice(CSS.indexOf('.xv-sidebar-collapsed-actions {'));
  const body = rule.slice(rule.indexOf('{') + 1, rule.indexOf('}'));
  assert.match(body, /background:\s*transparent/, 'the floating pill came back');
  assert.match(body, /border:\s*0/);
  assert.match(body, /box-shadow:\s*none/);
});

// ---------------------------------------------------------------------------
// No seam where the two panels meet
// ---------------------------------------------------------------------------

/** The seam rule, by the selector that has to keep winning. */
function seamRule(): string {
  const at = CSS.indexOf('.xv-workspace-shell.xv-workspace-shell');
  if (at === -1) return '';
  const open = CSS.indexOf('{', at);
  return CSS.slice(at, CSS.indexOf('}', open) + 1);
}

test('both panels draw the same edge, from one variable', () => {
  // Two borders met in that gap, in two colours that matched neither each other nor
  // the surface behind them.
  //
  // This first asserted `border-color: transparent` — removing both. That did end the
  // mismatch, and it also removed the window's outline entirely and left the
  // application with no shape at all. The defect was never that the panels had edges,
  // it was that they had *different* edges, so the contract is a shared source rather
  // than an absence: one variable that both read. A literal here would be the original
  // bug in one panel's clothing.
  const rule = seamRule();
  assert.notEqual(rule, '', 'the seam rule is gone');
  assert.match(rule, /border-color:\s*var\(--app-panel-border\)\s*!important/);
  assert.equal(
    /border-color:[^;]*(#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\()/i.test(rule),
    false,
    'a panel edge is a literal again, so the two can drift apart',
  );
  // The shadows stay off: each spilled a soft gradient into the same gap, which is
  // the same mismatch drawn slowly.
  assert.match(rule, /box-shadow:\s*none\s*!important/);
  for (const selector of ['.xv-sidebar-floating', '.xv-sidebar-floating--mobile']) {
    assert.ok(rule.includes(selector), `${selector} is not covered by the shared edge`);
  }
});

test('the shared edge is strong enough to see against a matching ground', () => {
  // The old values were tuned for a panel sitting on a *contrasting* desk. Against a
  // ground that now equals the panel exactly, Black's rgba(255,255,255,0.055) is
  // invisible — which is how removing the borders went unnoticed as "flat" rather
  // than "broken". A floor keeps the outline legible without pinning an exact tone.
  for (const theme of THEMES) {
    const value = themeVars(theme).get('--app-panel-border')!;
    const alpha = Number(value.match(/,\s*([\d.]+)\s*\)$/)?.[1] ?? '1');
    assert.ok(
      alpha >= 0.12,
      `theme-${theme} draws its frame at ${alpha} alpha, too faint to read against its own ground`,
    );
  }
});

test('the seam rule outranks the terminal skin that sets the shell border', () => {
  // This is the part that silently regresses. Three rules give the shell a border,
  // two of them `!important`, and the strongest — `body.theme-black
  // .terminal-skin-dark` — scores (0,2,1). A normal declaration loses to an
  // important one at any specificity, and a doubled class scores (0,2,0) and loses
  // too: that exact selector was the first attempt here and changed nothing on the
  // dark themes while looking correct on the light ones. Three classes score (0,3,0)
  // and win. Anything less silently restores the heavier of the two lines.
  const rule = seamRule();
  const head = rule.slice(0, rule.indexOf('{'));
  for (const compound of head.split(',')) {
    const name = compound.trim().split('.')[1];
    if (!name) continue;
    const repeats = compound.trim().split('.').filter((part) => part === name).length;
    assert.ok(
      repeats >= 3,
      `"${compound.trim()}" repeats .${name} ${repeats}x — not enough to outrank the skin's important border`,
    );
  }
});
