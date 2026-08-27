import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

/**
 * Guards for the sidebar's three-icon toolbar: New terminal · Search · Theme.
 *
 * The restyle had exactly two ways to go wrong, and both are checked here rather than
 * described:
 *
 * 1. **A second theme system.** The toolbar must read the theme the app already puts on
 *    `<body>`. A component that sniffed the theme itself, or kept its own state, would
 *    drift the moment the real one changed — and would flash on first paint, because the
 *    body class is applied by a pre-hydration bootstrap script that no component sees.
 *    So every colour must come from a variable resolved by `body.theme-*`, and the card
 *    must contain no literal colour of its own.
 *
 * 2. **A permanently filled icon.** The theme control ships `glass-panel`, which paints
 *    `--card` behind its glyph. Left alone it rendered as a selected third icon — but
 *    none of these three is ever "on", so a filled one is a lie about state. The fix is
 *    specificity, and specificity is exactly the kind of thing that silently regresses.
 */

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const CSS = read('../app/globals.css');
const SIDEBAR = read('../components/layout/Sidebar.tsx');

/**
 * The declarations of one rule, comments stripped, by the exact selector text that
 * precedes its brace in the sheet.
 *
 * Anchored to column zero, which is where every rule this file asserts on lives. The
 * older rules for these same classes sit indented inside `@layer` blocks, and matching
 * those too would mean picking between several blocks by guesswork — including the
 * reduced-motion block, where the selector only borrows someone else's declarations.
 * The last column-zero block is unambiguously the one the browser applies.
 */
function block(selector: string): string {
  const at = CSS.lastIndexOf(`\n${selector} {`);
  if (at === -1) return '';
  const open = CSS.indexOf('{', at);
  const close = CSS.indexOf('}', open);
  return CSS.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, '');
}

const winning = block;

/**
 * Every custom property a theme declares, merged across all of its rules.
 *
 * A theme is not one block: the toolbar palette, the stage ground and the shared panel
 * surface are each declared in their own `body.theme-*` rule, near the code they serve.
 * Reading only the last block silently reports the others as missing, which is exactly
 * what happened when the panel-surface rules were added.
 */
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

const THEMES = ['black', 'gray', 'white', 'beige'] as const;
const TOKENS = [
  '--toolbar-bg-top',
  '--toolbar-bg-bottom',
  '--toolbar-border',
  '--toolbar-icon',
  '--toolbar-icon-hover',
  '--toolbar-separator',
  '--toolbar-hover',
  '--toolbar-shadow',
] as const;

// ---------------------------------------------------------------------------
// One theme system, four themes
// ---------------------------------------------------------------------------

test('every Xroga theme defines the full toolbar palette', () => {
  for (const theme of THEMES) {
    const vars = themeVars(theme);
    assert.notEqual(vars.size, 0, `body.theme-${theme} declares nothing`);
    for (const token of TOKENS) {
      assert.ok(vars.has(token), `theme-${theme} is missing ${token}`);
    }
  }
});

test('the four themes are actually different, not one palette repeated', () => {
  // A copy-paste that left every theme dark would satisfy the test above and fail the
  // requirement completely. The surfaces must genuinely differ.
  const surfaces = THEMES.map((theme) => themeVars(theme).get('--toolbar-bg-top'));
  assert.equal(new Set(surfaces).size, THEMES.length, `the themes share a surface: ${surfaces.join(', ')}`);

  // Light themes need dark glyphs and dark themes need light ones, or the icons vanish.
  const iconOf = (theme: string) => themeVars(theme).get('--toolbar-icon') ?? '';
  // #a7a7a2 and #c2c2c0 are light; #656565 and #777066 are dark.
  assert.match(iconOf('black'), /#a7a7a2/);
  assert.match(iconOf('gray'), /#c2c2c0/);
  assert.match(iconOf('white'), /#656565/);
  assert.match(iconOf('beige'), /#777066/);
});

test('an unclassed body still paints the card', () => {
  // The bootstrap script adds the class before paint, but a body that somehow has no
  // theme class must not render a transparent, borderless, shadowless box.
  assert.match(CSS, /\nbody,\s*\nbody\.theme-black \{/);
});

test('the card carries no colour of its own — only theme variables', () => {
  const card = winning('.xv-sidebar-header-actions');
  for (const property of ['background', 'border', 'box-shadow']) {
    const line = card.match(new RegExp(`${property}:([^;]+);`))?.[1] ?? '';
    assert.notEqual(line, '', `the card lost its ${property}`);
    assert.match(line, /var\(--toolbar-/, `${property} hardcodes a colour instead of using a theme variable`);
  }
  // No literal hex or rgba anywhere in the card rule.
  assert.equal(/#[0-9a-f]{3,8}\b|rgba?\(/i.test(card), false, 'a hardcoded colour appeared on the card');
});

test('the toolbar adds no state and no theme detection of its own', () => {
  const toolbar = SIDEBAR.slice(
    SIDEBAR.indexOf('xv-sidebar-header-actions'),
    SIDEBAR.indexOf('xv-sidebar-collapsed-actions'),
  );
  assert.notEqual(toolbar, '', 'the toolbar markup is gone');
  assert.equal(
    /useState|useTheme|theme\s*===|data-theme=|classList/.test(toolbar),
    false,
    'the toolbar grew its own theme state or detection',
  );
});

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

test('the card is compact and rounded, not oversized', () => {
  // Trimmed from 42px on request: at that height it competed with the brand beside
  // it. The bound is what matters — a utility strip that grows back past ~36px is
  // the complaint returning, and one under ~28px stops being a comfortable target.
  const card = winning('.xv-sidebar-header-actions');
  const height = Number(card.match(/height:\s*(\d+)px/)?.[1]);
  assert.ok(height >= 28 && height <= 36, `the toolbar is ${height}px tall`);
  const radius = Number(card.match(/border-radius:\s*(\d+)px/)?.[1]);
  assert.ok(radius >= 10 && radius < height / 2, `radius ${radius}px is not proportional to ${height}px`);
  assert.match(card, /padding:\s*\d+px \d+px/);
  assert.equal(/backdrop-filter/.test(card), false, 'heavy glassmorphism came back');
});

test('the controls stay comfortable targets inside the smaller card', () => {
  // Shrinking the card must not shrink the hit areas below usability. The buttons
  // also have to fit inside it, which is the constraint a hand-tuned height forgets.
  const card = winning('.xv-sidebar-header-actions');
  const cardHeight = Number(card.match(/height:\s*(\d+)px/)?.[1]);
  const padding = Number(card.match(/padding:\s*(\d+)px/)?.[1]);

  const button = winning(
    '.xv-sidebar-header-actions .xv-new-terminal-compact,\n.xv-sidebar-header-actions .xv-sidebar-head-icon,\n.xv-sidebar-header-actions .xv-theme-toggle',
  );
  const width = Number(button.match(/width:\s*(\d+)px/)?.[1]);
  const height = Number(button.match(/height:\s*(\d+)px/)?.[1]);

  assert.ok(width >= 26, `control width ${width}px is too small to hit`);
  assert.ok(height >= 24, `control height ${height}px is too small to hit`);
  assert.ok(
    height + padding * 2 <= cardHeight,
    `a ${height}px control plus ${padding}px padding does not fit a ${cardHeight}px card`,
  );
});

test('the three controls are uniform and no icon is permanently filled', () => {
  // The whole set must rest identically. One filled icon reads as a selected state.
  const resting = winning(
    '.xv-sidebar-header-actions button.xv-theme-toggle,\n.xv-sidebar-header-actions button.xv-sidebar-head-icon,\n.xv-sidebar-header-actions button.xv-new-terminal-compact',
  );
  assert.match(resting, /background:\s*transparent/);
  assert.match(resting, /color:\s*var\(--toolbar-icon\)/);

  // Tag-qualified on purpose: `.glass-panel` on the theme control outranks a plain
  // class-only selector and repaints the fill. Dropping `button` reintroduces it.
  assert.match(
    CSS,
    /\.xv-sidebar-header-actions button\.xv-theme-toggle/,
    'the tag-qualified override is gone; the theme icon will fill again',
  );
  // And the glyph must not keep the blue accent that the control uses elsewhere.
  assert.match(winning('.xv-sidebar-header-actions .xv-theme-toggle svg'), /color:\s*inherit/);
});

test('hover is a surface, and only on hover', () => {
  const hover = winning(
    '.xv-sidebar-header-actions button.xv-theme-toggle:hover,\n.xv-sidebar-header-actions button.xv-theme-toggle:focus-visible,\n.xv-sidebar-header-actions button.xv-sidebar-head-icon:hover,\n.xv-sidebar-header-actions button.xv-sidebar-head-icon:focus-visible,\n.xv-sidebar-header-actions button.xv-new-terminal-compact:hover,\n.xv-sidebar-header-actions button.xv-new-terminal-compact:focus-visible',
  );
  assert.match(hover, /background:\s*var\(--toolbar-hover\)/);
  assert.match(hover, /color:\s*var\(--toolbar-icon-hover\)/);
});

test('separators are hairlines, and decorative', () => {
  const sep = winning('.xv-toolbar-sep');
  assert.match(sep, /width:\s*1px/);
  const sepHeight = Number(sep.match(/height:\s*(\d+)px/)?.[1]);
  assert.ok(sepHeight >= 12 && sepHeight <= 24, `separator is ${sepHeight}px`);
  assert.match(sep, /background:\s*var\(--toolbar-separator\)/);
  // Two of them, between three controls, carrying no meaning for a screen reader.
  const spans = SIDEBAR.match(/<span className="xv-toolbar-sep" aria-hidden="true" \/>/g) ?? [];
  assert.equal(spans.length, 2, `expected 2 separators, found ${spans.length}`);
});

test('theme changes transition rather than jump', () => {
  const card = winning('.xv-sidebar-header-actions');
  assert.match(card, /transition:[\s\S]*background 220ms ease/);
  assert.match(card, /transition:[\s\S]*border-color 220ms ease/);
  assert.match(card, /transition:[\s\S]*box-shadow 220ms ease/);
  assert.match(winning('.xv-toolbar-sep'), /transition:\s*background 220ms ease/);
});

// ---------------------------------------------------------------------------
// Nothing else moved
// ---------------------------------------------------------------------------

test('the three controls, their order and their handlers are untouched', () => {
  const toolbar = SIDEBAR.slice(
    SIDEBAR.indexOf('xv-sidebar-header-actions'),
    SIDEBAR.indexOf('xv-sidebar-collapsed-actions'),
  );
  const order = [...toolbar.matchAll(/aria-label="(New Terminal|Search)"|<ThemeToggle \/>/g)].map((m) => m[1] ?? 'Theme');
  assert.deepEqual(order, ['New Terminal', 'Search', 'Theme'], 'the controls changed or were reordered');

  assert.match(toolbar, /onClick=\{handleNewChat\}/);
  assert.match(toolbar, /onClick=\{\(\) => setSearchOpen\(true\)\}/);
  // No labels, no extra controls.
  assert.equal(/<span>(?!New<)/.test(toolbar.replace(/<span className="xv-toolbar-sep"[^/]*\/>/g, '')), false);
});

test('the collapsed sidebar toolbar stays a separate control from the expanded card', () => {
  // Indented inside a `@layer` block, so matched directly rather than through `block`.
  const collapsed = CSS.match(/\.xv-sidebar-collapsed-actions \{([^}]*)\}/)?.[1] ?? '';
  assert.notEqual(collapsed, '', 'the collapsed rail is gone');

  // This used to also require `border-radius: 999px` — the pill it was drawn as while
  // the expanded card was being restyled around it, when leaving it alone was the point.
  // The collapsed rail has since been asked for in its own right: stacked under the logo
  // and carrying no surface at all, because in a 64px column a floating pill was a second
  // card that could not fit. `appFrameAlignment.test.ts` holds it to that shape now.
  // What still belongs here is the separation — the two controls must not share a palette.
  assert.equal(/--toolbar-/.test(collapsed), false, 'the collapsed rail was pulled into the new palette');
});
