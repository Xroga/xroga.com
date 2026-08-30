import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

/**
 * Guards for two reported defects, both variations on the same mistake.
 *
 * 1. **The theme control did nothing to the workspace.** Every large surface around the
 *    terminal was a literal near-black: the desk behind the window, the composer, the
 *    `+` menu. Switching to White or Beige repainted the sidebar and left the middle of
 *    the application black. A hardcoded colour cannot follow a theme, so the fix is
 *    structural — those surfaces read variables, and the variables are declared once per
 *    theme.
 *
 * 2. **Light themes were treated as "White only".** The overrides that made the menu
 *    readable were written for `theme-white` alone, so on the cream Beige page the menu
 *    rendered white ink on a cream surface. Beige is a light theme too.
 *
 * These are checked as *absence of literals* rather than as specific colours: asserting
 * the exact hex would pass a future change that hardcoded a different one just as badly.
 */

const CSS = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

const THEMES = ['black', 'gray', 'white', 'beige'] as const;
const LIGHT_THEMES = ['white', 'beige'] as const;
const TERMINAL_SKINS = ['dark', 'amoled', 'light', 'light-grid', 'gray', 'midnight', 'forest', 'matrix', 'amber', 'solar'] as const;

/** The last column-zero rule for a selector — the one the browser applies. */
function block(selector: string): string {
  const at = CSS.lastIndexOf(`\n${selector} {`);
  if (at === -1) return '';
  const open = CSS.indexOf('{', at);
  const close = CSS.indexOf('}', open);
  return CSS.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Every `--name: value;` declared for one theme, across all of its rules. */
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

const SURFACE_TOKENS = ['--stage-ground', '--composer-surface', '--composer-border', '--menu-surface'] as const;

/**
 * The tokens that still hold a colour of their own, per theme.
 *
 * `--stage-ground` no longer does. The page behind the application was a shade apart
 * from the panels on it, so the theme read as three near-misses at once; it now
 * resolves to `--app-panel` in every theme. The two tests below ask "is this colour
 * different from the other themes' / light enough for a light theme", and neither
 * question can be asked of a reference — `var(--app-panel)` is deliberately the same
 * four times, and its value lives on a different token. `appFrameAlignment.test.ts`
 * is what holds it to the shared surface now.
 */
const COLOURED_TOKENS = SURFACE_TOKENS.filter((token) => token !== '--stage-ground');

// ---------------------------------------------------------------------------
// Every themed surface is declared for every theme
// ---------------------------------------------------------------------------

test('all four themes declare every workspace surface', () => {
  for (const theme of THEMES) {
    const vars = themeVars(theme);
    for (const token of SURFACE_TOKENS) {
      assert.ok(vars.has(token), `theme-${theme} does not declare ${token}`);
    }
  }
});

test('every terminal skin owns the composer and starter surface palette', () => {
  for (const skin of TERMINAL_SKINS) {
    const selector = `.terminal-skin-${skin}`;
    const rule = CSS.match(new RegExp(`\\.terminal-skin-${skin}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
    assert.notEqual(rule, '', `${selector} is gone`);
    for (const token of ['--terminal-ui-surface', '--terminal-ui-raised', '--terminal-ui-inset', '--terminal-ui-border']) {
      assert.match(rule, new RegExp(`${token}:\\s*[^;]+;`), `${selector} does not declare ${token}`);
    }
  }
});

test('the dock and all empty-state cards use solid terminal-skin surfaces', () => {
  assert.match(CSS, /\.xv-terminal-dock\[class\*='terminal-skin-'\][\s\S]*--card:\s*var\(--terminal-ui-raised\)/);
  assert.match(block('.xv-terminal-dock .xv-chatbar-solid'), /background:\s*var\(--terminal-ui-raised/);
  assert.match(block('.xv-chatbar-context-strip'), /background:\s*var\(--terminal-ui-raised/);
  assert.match(block('.xv-repo-chip--compact'), /background:\s*var\(--terminal-ui-inset/);
  assert.match(block('.xv-workspace-templates'), /background:\s*var\(--terminal-ui-raised/);
});

test('the surfaces genuinely differ between themes, rather than being one palette', () => {
  // The defect was every theme sharing one dark value. A table that declares the token
  // four times with the same colour is the same bug wearing a variable.
  for (const token of COLOURED_TOKENS) {
    const values = THEMES.map((theme) => themeVars(theme).get(token));
    assert.equal(
      new Set(values).size,
      THEMES.length,
      `${token} repeats across themes: ${values.join(' | ')}`,
    );
  }
});

test('the light themes get light surfaces and the dark themes get dark ones', () => {
  // Direction, not exact value: a mapping that swapped them would satisfy every other
  // test here and be obviously wrong on screen.
  const brightness = (colour: string): number => {
    const hex = colour.match(/#([0-9a-f]{6})/i)?.[1];
    if (hex) {
      const n = parseInt(hex, 16);
      return ((n >> 16) + ((n >> 8) & 255) + (n & 255)) / 3;
    }
    const rgb = colour.match(/\d+/g);
    return rgb ? (Number(rgb[0]) + Number(rgb[1]) + Number(rgb[2])) / 3 : Number.NaN;
  };

  for (const token of ['--composer-surface', '--menu-surface'] as const) {
    for (const theme of LIGHT_THEMES) {
      const value = themeVars(theme).get(token)!;
      assert.ok(brightness(value) > 180, `theme-${theme} ${token} is ${value}, too dark for a light theme`);
    }
    for (const theme of ['black', 'gray'] as const) {
      const value = themeVars(theme).get(token)!;
      assert.ok(brightness(value) < 80, `theme-${theme} ${token} is ${value}, too light for a dark theme`);
    }
  }
});

// ---------------------------------------------------------------------------
// The surfaces read the variables rather than carrying a colour
// ---------------------------------------------------------------------------

test('the desk, the composer and the menu carry no colour of their own', () => {
  const surfaces: Array<[string, string]> = [
    ['.xv-app-stage', 'background'],
    ['.xv-terminal-dock .xv-chatbar-solid', 'background'],
    ['.xv-cba-menu', 'background'],
  ];
  for (const [selector, property] of surfaces) {
    const rule = block(selector);
    assert.notEqual(rule, '', `${selector} is gone`);
    const value = rule.match(new RegExp(`(?:^|\\n)\\s*${property}:([^;]+);`))?.[1] ?? '';
    assert.notEqual(value.trim(), '', `${selector} lost its ${property}`);
    assert.match(value, /var\(--/, `${selector} hardcodes its ${property}: ${value.trim()}`);

    // Presence of `var(` is not enough. `background: var(--glow), #020304` contains
    // one and is still a hardcoded desk — that exact shape is what shipped. So the
    // `var(…)` calls are removed, fallbacks and all, and what remains must hold no
    // colour of its own.
    let remainder = value;
    let previous: string;
    do {
      previous = remainder;
      remainder = remainder.replace(/var\([^()]*\)/g, ' ');
    } while (remainder !== previous);

    assert.equal(
      /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i.test(remainder),
      false,
      `${selector} still carries a literal ${property} outside its variables: ${remainder.trim()}`,
    );
  }
});

test('the shell takes its surface from the terminal skin, not from a literal', () => {
  // A background here outranked the skins' own layered rules, so Parchment rendered
  // as near-black under a cream desk.
  const shell = block('.xv-workspace-shell');
  assert.equal(
    /(?:^|\n)\s*background(-color)?:\s*#/.test(shell),
    false,
    'the shell hardcodes a surface again and will override every light skin',
  );
  // The skinless fallback is allowed, and is the only place a colour may appear.
  assert.match(CSS, /\.xv-workspace-shell:not\(\[class\*='terminal-skin-'\]\)/);
});

// ---------------------------------------------------------------------------
// Beige is a light theme
// ---------------------------------------------------------------------------

test('every light-theme override covers Beige as well as White', () => {
  // Each `body.theme-white .xv-cba…` rule must have a Beige twin with the *same*
  // selector tail, or the menu goes white-on-cream again.
  const whiteRules = [...CSS.matchAll(/(?:^|\n)body\.theme-white (\.xv-cba[^,{\n]*)/g)].map((m) => m[1].trim());
  assert.ok(whiteRules.length > 0, 'the light-theme menu overrides are gone');

  for (const tail of whiteRules) {
    const twin = new RegExp(`body\\.theme-beige ${tail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[,{]`);
    assert.match(CSS, twin, `theme-beige has no rule for "${tail}"`);
  }
});

test('no rule targets a terminal skin that does not exist', () => {
  // `paper` was written into 17 selectors and is not in the catalogue, so every one of
  // them was dead. The real warm light skin is `solar`.
  const theme = readFileSync(new URL('./theme.ts', import.meta.url), 'utf8');
  const known = [...theme.matchAll(/\{ id: '([\w-]+)', label:/g)].map((m) => m[1]);
  assert.ok(known.length >= 8, 'the skin catalogue could not be read');

  const targeted = new Set([...CSS.matchAll(/\.terminal-skin-([\w-]+)/g)].map((m) => m[1]));
  for (const skin of targeted) {
    assert.ok(known.includes(skin), `.terminal-skin-${skin} is styled but is not a real skin`);
  }
});
