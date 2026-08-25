import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

/**
 * Guards for the animated icons and where they are wired in.
 *
 * These are twelve components that animate their own paths rather than lucide
 * glyphs tilted as a whole, and each one is at a specific control. A swap back to
 * a static glyph is a one-line change that nothing else would notice, so each
 * placement is named here.
 *
 * The behaviour they share — play once when the page loads, rest, then play again
 * on hover or on click — lives in `AnimatedIcon` and is asserted once rather than
 * twelve times.
 */

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const HOST = read('./AnimatedIcon.tsx');
const SIDEBAR = read('../../layout/Sidebar.tsx');
const HISTORY = read('../../layout/SidebarProjectHistory.tsx');
const THEME = read('../../layout/ThemeToggle.tsx');
const PROFILE = read('../../ui/ProfileQuickMenu.tsx');
const SEND = read('../../terminal/ChatBarSendIcon.tsx');

const ICONS = [
  'TerminalIcon',
  'CodeXmlIcon',
  'LocateFixedIcon',
  'RocketIcon',
  'LayoutGridIcon',
  'CogIcon',
  'TelescopeIcon',
  'FilterIcon',
  'ShipWheelIcon',
  'SlidersHorizontalIcon',
  'PaletteIcon',
  'ConnectIcon',
];

test('every animated icon exposes the handle the host drives it by', () => {
  for (const name of ICONS) {
    const source = read(`./${name}.tsx`);
    assert.match(source, /startAnimation: \(\) =>/, `${name} cannot be started`);
    assert.match(source, /stopAnimation: \(\) =>/, `${name} cannot be stopped`);
    // Controlled mode is what lets the host own the timing: with a ref attached the
    // icon stops driving itself and forwards its pointer events instead.
    assert.match(source, /isControlled(Ref)?\.current = true/, `${name} never enters controlled mode`);
    assert.match(source, /forwardRef</, `${name} does not forward a ref`);
  }
});

test('the icons load motion lazily rather than pulling the full bundle', () => {
  for (const name of ICONS) {
    const source = read(`./${name}.tsx`);
    // `m` under LazyMotion, never the eager `motion` proxy: these mount on the
    // workspace route, whose first-load JS is budgeted.
    assert.match(source, /<LazyMotion features=\{domAnimation\} strict>/, `${name} is not lazily loaded`);
    assert.ok(
      !/^import \{[^}]*\bmotion\b/m.test(source),
      `${name} imports the eager motion proxy, which would also throw under strict LazyMotion`,
    );
  }
});

test('the shared host plays once on load, then on hover and on click', () => {
  // The load pass is deliberately not gated behind a once-per-session marker — it is
  // meant to be seen on every reload.
  assert.ok(!/sessionStorage/.test(HOST), 'the load pass must not be gated to once per session');
  assert.match(HOST, /if \(!intro \|\| !hydrated \|\| reduced\) return;\n\s*play\(\);/, 'no load pass');
  assert.match(HOST, /onMouseEnter=\{ownsPointer \? hold : undefined\}/, 'hover does not start it');
  assert.match(HOST, /onMouseLeave=\{ownsPointer \? release : undefined\}/, 'leaving does not rest it');
  assert.match(HOST, /onClick=\{\(event\) => \{\n\s*play\(\);/, 'clicking does not replay it');
  // Plays and settles on its own, so a click cannot leave an icon stuck mid-pose.
  assert.match(HOST, /settleTimer\.current = window\.setTimeout/, 'nothing tells the icon to rest');
});

test('reduced motion leaves every icon still', () => {
  assert.match(HOST, /const reduced = Boolean\(systemReduced\) \|\| \(hydrated && preferenceReduced\)/);
  for (const guard of ['const play', 'const hold']) {
    const at = HOST.indexOf(guard);
    assert.ok(at > 0, `${guard} is gone`);
    assert.match(HOST.slice(at, at + 160), /if \(reduced\) return;/, `${guard} runs under reduced motion`);
  }
});

test('the sidebar nav rows carry their animated icons', () => {
  for (const [label, icon] of [
    ["'Workspace'", 'TerminalIcon'],
    ["'Dashboard'", 'LayoutGridIcon'],
    ["'Integrations'", 'ConnectIcon'],
    ["'Launch & Growth'", 'RocketIcon'],
    ["'Explore'", 'TelescopeIcon'],
    ["'Settings'", 'CogIcon'],
  ]) {
    const at = SIDEBAR.indexOf(`label: ${label},`);
    assert.ok(at > 0, `the ${label} row is gone`);
    // Within the row's own object literal, not somewhere else in the file.
    assert.match(SIDEBAR.slice(at, at + 260), new RegExp(`animated: ${icon},`), `${label} lost ${icon}`);
  }
});

test('the collapsed rail shows the workspace as code and search as a reticle', () => {
  // Searched forward from the rail, not from the top of the file: `SidebarNavScroller`
  // is imported above it, so an unanchored lookup ends the slice before it starts.
  const start = SIDEBAR.indexOf('xv-sidebar-collapsed-actions');
  const rail = SIDEBAR.slice(start, SIDEBAR.indexOf('<SidebarNavScroller', start));
  assert.ok(rail.length > 0, 'the collapsed rail could not be located');
  assert.match(rail, /icon=\{CodeXmlIcon\}/, 'the rail lost the workspace glyph');
  assert.match(rail, /icon=\{LocateFixedIcon\}/, 'the rail lost the search glyph');
  assert.match(rail, /icon=\{LayoutGridIcon\}/, 'the rail lost the dashboard glyph');
});

test('no static lucide glyph is left at a control that was given an animated one', () => {
  for (const [name, source, gone] of [
    ['Sidebar', SIDEBAR, /<Search\b/],
    ['ThemeToggle', THEME, /<Palette\b/],
    ['SidebarProjectHistory', HISTORY, /<Filter\b/],
    ['ProfileQuickMenu', PROFILE, /<SlidersHorizontal\b/],
  ] as const) {
    assert.ok(!gone.test(source), `${name} still renders the static glyph`);
  }
  assert.match(THEME, /icon=\{PaletteIcon\}/);
  assert.match(HISTORY, /icon=\{FilterIcon\}/);
  assert.match(PROFILE, /icon=\{SlidersHorizontalIcon\}/);
});

/**
 * The send button is a state machine, not one glyph. Only `idle` became the ship's
 * wheel: `sending` shows a request in flight and refuses a second submit,
 * `thinking` is the Stop control for a streaming response, and `launched` is the
 * confirmation. Replacing the whole icon would have taken the ability to stop a
 * response away with it.
 */
test('the send button takes the wheel at rest and keeps the rest of its states', () => {
  assert.match(SEND, /icon=\{ShipWheelIcon\}/, 'the idle send glyph is not the wheel');
  assert.match(SEND, /if \(!loading && !busy && !done\)/, 'the wheel is not scoped to idle');
  for (const kept of ['LeafLoader', 'xv-sendicon__sweep', 'xv-sendicon__stop', 'xv-sendicon__check']) {
    assert.ok(SEND.includes(kept), `the send button lost ${kept}`);
  }
});
