import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

/**
 * Guards for the appearance settings and the sidebar seam.
 *
 * **The Font setting did nothing.** `--ui-font` was declared on `html`, built from
 * the next/font variables — which are attached to the `<body>` class list and so do
 * not exist one level up. The stack resolved to the empty token stream, `font-family`
 * was dropped, and the control changed the stored value while the page kept the same
 * face. Measured before the fix: Modern, Classic and Mono produced a byte-identical
 * `font-family` on `body`. It is the same trap `--font-claude` fell into.
 *
 * The scoped rules carry their whole stack rather than referencing a shared token,
 * so each resolves where it is used, and they are `!important` because `<body>`
 * carries Tailwind's `font-sans` utility, which sets `font-family` directly and
 * outranks an inherited value.
 *
 * **Default is not a colour.** It takes the theme's ink, so it is near-black on the
 * light themes and near-white on the dark ones. A fixed hex would be wrong on three
 * themes out of four.
 *
 * **The seam is not the gutter.** They were the same value, so the channel between
 * the sidebar and the workspace measured twice the outer margin.
 */

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const CSS = read('../app/globals.css');
const UIVERSE = read('../styles/uiverse.css');
const THEME = read('./theme.ts');
const PROVIDER = read('../components/providers/ThemeProvider.tsx');
const PANEL = read('../components/settings/ThemeSettingsPanel.tsx');

/** CSS with comments stripped, so prose about a rule cannot satisfy a search for it. */
const code = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

test('the font stacks are declared where the font variables exist', () => {
  // On `html` they resolve to nothing and the setting silently does nothing.
  assert.ok(
    !/html\[data-font='(modern|classic|mono)'\]/.test(code),
    'a font stack is declared on html again, where the next/font variables do not exist',
  );
  for (const mode of ['modern', 'classic', 'mono']) {
    assert.ok(code.includes(`body[data-font='${mode}']`), `${mode} must be scoped to body`);
  }
  assert.match(
    PROVIDER,
    /body\.dataset\.font = fontPreference/,
    'the attribute must be set on body to match the rules',
  );
});

test('the sidebar and the workspace take separate faces', () => {
  for (const id of ['goga', 'inter', 'serif', 'display', 'mono']) {
    assert.ok(
      code.includes(`body[data-sidebar-font='${id}']`),
      `the sidebar has no rule for ${id}`,
    );
    assert.ok(
      code.includes(`body[data-workspace-font='${id}']`),
      `the workspace has no rule for ${id}`,
    );
  }
  // `default` deliberately has no rule: the surface keeps the shell's own face.
  assert.ok(!code.includes("data-sidebar-font='default'"), 'default should set nothing');

  assert.match(PROVIDER, /body\.dataset\.sidebarFont = sidebarFont/);
  assert.match(PROVIDER, /body\.dataset\.workspaceFont = workspaceFont/);
});

test('the chosen face actually reaches the text', () => {
  // Tailwind's `font-sans` on <body> sets font-family directly, so an inherited
  // value loses. Without this the setting applies to a custom property and stops.
  const at = code.indexOf("body[data-sidebar-font='goga']");
  assert.notEqual(at, -1);
  const block = code.slice(at, code.indexOf('}', at));
  assert.match(block, /font-family:[^;]*!important/, 'the scoped face must outrank the utility');
  // And the stack names a real font variable rather than a shared token that would
  // have to resolve somewhere else.
  assert.match(block, /var\(--font-goga\)/, 'the stack must be spelled out where it is used');
});

test('six choices, including one that changes nothing', () => {
  const ids = [...THEME.matchAll(/\{ id: '([a-z]+)', label: '[^']*', hint:/g)].map((m) => m[1]);
  assert.deepEqual(ids, ['default', 'goga', 'inter', 'serif', 'display', 'mono']);
  // Both pickers are offered, and they are separate controls.
  assert.match(PANEL, /label="Sidebar font"/);
  assert.match(PANEL, /label="Workspace font"/);
});

test('the default accent is the theme ink, not a colour', () => {
  const at = code.indexOf("html[data-accent='default'] body");
  assert.notEqual(at, -1, 'there is no default accent');
  const block = code.slice(at, code.indexOf('}', at));
  assert.match(block, /--accent: var\(--foreground\)/, 'default must follow the theme ink');
  assert.ok(!/#[0-9a-f]{3,6}/i.test(block), 'a fixed hex is wrong on three themes out of four');
  // Its swatch says the same thing, so the settings dot inverts with the theme.
  assert.match(THEME, /\{ id: 'default', label: 'Default', swatch: 'currentColor' \}/);
});

test('the new accents exist in the sheet as well as the list', () => {
  for (const id of ['amber', 'cyan', 'rose']) {
    assert.match(THEME, new RegExp(`id: '${id}'`), `${id} is not offered`);
    assert.ok(code.includes(`html[data-accent='${id}'] body`), `${id} has no rule, so it would do nothing`);
  }
});

test('the seam between the panels is smaller than the frame gutter', () => {
  // Anchored on the seam's own declaration, then widened backwards to its block.
  // Searching forward from the first `--xv-app-gutter` lands on the next `:root`,
  // which is the 640px override — it sets the gutter and not the seam.
  const seamAt = code.indexOf('--xv-app-seam:');
  assert.notEqual(seamAt, -1, 'the seam is not declared');
  const root = code.slice(code.lastIndexOf(':root {', seamAt), code.indexOf('}', seamAt));
  const gutter = Number(/--xv-app-gutter:\s*(\d+)px/.exec(root)?.[1]);
  const seam = Number(/--xv-app-seam:\s*(\d+)px/.exec(root)?.[1]);
  assert.ok(Number.isFinite(gutter) && Number.isFinite(seam), 'both values should be set');
  assert.ok(seam < gutter, `the seam (${seam}px) is not tighter than the gutter (${gutter}px)`);
  // Not zero: butted panels lose the edge that says there are two of them.
  assert.ok(seam > 0, 'the panels should still show a seam');

  // Both sides of the channel have to use it, or only one edge moves.
  assert.match(code, /padding-inline-start: var\(--xv-app-seam\)/, 'the stage must use the seam');
  assert.match(UIVERSE, /var\(--xv-app-seam/, 'the sidebar must use the seam');
});

test('the edge toggle straddles the sidebar without a card', () => {
  const at = code.indexOf('.xv-sidebar-edge-toggle {');
  assert.notEqual(at, -1);
  const block = code.slice(at, code.indexOf('}', at));
  assert.match(block, /transform: translate\(50%, -50%\)/, 'half in, half out');
  assert.match(block, /border: 0/, 'the toggle should not carry its own border');
  assert.match(block, /background: transparent/, 'the toggle should not carry its own fill');
  // The shadow spilled into the seam the panels were just brought together across.
  assert.match(block, /box-shadow: none/, 'the toggle should not cast a shadow into the seam');
});
