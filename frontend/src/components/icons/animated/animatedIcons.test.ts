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
const PROVIDER = read('./MotionProvider.tsx');
const SIDEBAR = read('../../layout/Sidebar.tsx');
const HISTORY = read('../../layout/SidebarProjectHistory.tsx');
const THEME = read('../../layout/ThemeToggle.tsx');
const PROFILE = read('../../ui/ProfileQuickMenu.tsx');
const SEND = read('../../terminal/ChatBarSendIcon.tsx');
const ACTIONS = read('../../terminal/ChatBarActionsMenu.tsx');
const MIC = read('../../terminal/ChatBarMicButton.tsx');
const LOG = read('../../terminal/SwarmMessageLog.tsx');
const DASHBOARD = read('../../dashboard/DashboardView.tsx');
const PROMPT = read('./TerminalPromptIcon.tsx');
const FRAME = read('../../layout/PageFullscreenFrame.tsx');
const DEVPANEL = read('../../terminal/DevWorkspacePanel.tsx');

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
  'CirclePlayIcon',
  'MicIcon',
  'FolderOpenIcon',
  'ExpandIcon',
  'MinimizeIcon',
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

/**
 * Motion is loaded through exactly one door.
 *
 * Two separate costs. `domAnimation` is the feature bundle: eighteen icons each
 * bringing their own `LazyMotion` gave the bundler eighteen owners for it. And
 * `motion/react` is a barrel whose eager `motion` proxy drags in drag, layout and
 * gesture support — importing `m` from it pulled roughly 14 kB of features nothing
 * here uses onto every route the icons reach.
 */
test('motion is imported through one provider and the m-only entry', () => {
  assert.match(PROVIDER, /import \{ LazyMotion, domAnimation \} from 'motion\/react';/);
  assert.match(PROVIDER, /<LazyMotion features=\{domAnimation\} strict>/, 'the provider does not lazy-load');
  assert.match(HOST, /<IconMotion>/, 'the host does not wrap its icon in the provider');

  for (const name of [...ICONS, 'TerminalPromptIcon']) {
    const source = read(`./${name}.tsx`);
    assert.match(source, /import \* as m from 'motion\/react-m';/, `${name} does not use the m-only entry`);
    assert.ok(
      !/\bdomAnimation\b/.test(source),
      `${name} owns a second copy of the feature bundle`,
    );
    assert.ok(
      !/^import \{[^}]*\bmotion\b/m.test(source),
      `${name} imports the eager motion proxy, which also throws under strict LazyMotion`,
    );
  }
});

/**
 * The bug this replaced: hover and click were React props on the icon, so they only
 * fired when the pointer landed on the 16px glyph exactly. Hovering a sidebar row or
 * pressing a rail button animated nothing, which is how it was reported. The icon
 * now walks up to the control it sits in and listens there.
 */
test('hover and click are bound to the control, not to the glyph', () => {
  assert.match(HOST, /const INTERACTIVE = 'a, button/, 'the interactive ancestors are gone');
  assert.match(HOST, /const target = host\.closest\(INTERACTIVE\) \?\? host;/, 'it listens on itself again');
  for (const event of ['mouseenter', 'mouseleave', 'click']) {
    assert.match(
      HOST,
      new RegExp(`target\\.addEventListener\\('${event}'`),
      `${event} is not bound to the control`,
    );
    assert.match(
      HOST,
      new RegExp(`target\\.removeEventListener\\('${event}'`),
      `${event} is never unbound`,
    );
  }
  // The wrapper is what makes the walk possible: the icon's own ref is its handle.
  assert.match(HOST, /<span ref=\{hostRef\}/, 'there is no element to walk up from');
});

test('the shared host plays once on load, then on hover and on click', () => {
  // The load pass is deliberately not gated behind a once-per-session marker — it is
  // meant to be seen on every reload.
  assert.ok(!/sessionStorage/.test(HOST), 'the load pass must not be gated to once per session');
  assert.match(HOST, /if \(!intro \|\| !hydrated \|\| reduced\) return;\n\s*play\(\);/, 'no load pass');
  assert.match(HOST, /const enter = \(\) => hold\(\);/, 'hover does not start it');
  assert.match(HOST, /const leave = \(\) => release\(\);/, 'leaving does not rest it');
  assert.match(HOST, /const press = \(\) => play\(\);/, 'clicking does not replay it');
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


test('the composer takes the ring, the bars and the wheel', () => {
  assert.match(ACTIONS, /icon=\{CirclePlayIcon\}/, 'the composer menu trigger is not the ring');
  assert.ok(!/<Plus\b/.test(ACTIONS), 'the static plus is back');
  /*
   * The mic renders the meter directly rather than through `AnimatedIcon`, because it
   * drives the animation from the recording state rather than from a pointer. What it
   * looks like, and that it runs for exactly as long as the recording does, is
   * asserted in `mobileChrome.test.ts` where the rest of the composer's chrome lives.
   */
  assert.match(MIC, /<AudioLinesIcon ref=\{meterRef\}/, 'the mic button is not the meter');
  assert.ok(!/<Mic\b/.test(MIC), 'the static mic is back');
});

/**
 * The prompt glyph beside `xroga@swarm` is the one icon here that is not
 * hover-driven. It stands for a live shell, and a shell's cursor blinks whether or
 * not anyone is pointing at it.
 */
test('the terminal prompt cursor blinks continuously and is not hover-driven', () => {
  assert.match(PROMPT, /repeat: Number\.POSITIVE_INFINITY/, 'the cursor does not repeat');
  assert.ok(!/onMouseEnter/.test(PROMPT), 'the cursor was made hover-driven');
  assert.match(PROMPT, /controls\.start\('animate'\);\n\s*\}, \[hydrated, reduced, controls\]\)/, 'it does not start itself');
  // Reduced motion gets the glyph with the cursor solid rather than a still frame
  // of a blink.
  assert.match(PROMPT, /if \(reduced\) \{\n\s*controls\.start\('normal'\);/, 'reduced motion still blinks');

  for (const [name, source] of [['SwarmMessageLog', LOG], ['DashboardView', DASHBOARD]] as const) {
    assert.match(source, /<TerminalPromptIcon/, `${name} lost the prompt glyph`);
    assert.ok(!/<Terminal\b/.test(source), `${name} still renders the static terminal glyph`);
    // The label it belongs to.
    assert.match(source, /xroga<span className="xv-term-at">@<\/span>swarm/, `${name} lost the prompt label`);
  }
});

test('every fullscreen and minimize control animates its corners', () => {
  for (const [name, source] of [
    ['PageFullscreenFrame', FRAME],
    ['DevWorkspacePanel', DEVPANEL],
    ['SwarmMessageLog', LOG],
    ['DashboardView', DASHBOARD],
  ] as const) {
    assert.match(source, /icon=\{ExpandIcon\}/, `${name} lost the expand glyph`);
    assert.ok(
      !/<Maximize2\b|<Minimize2\b/.test(source),
      `${name} still renders a static fullscreen glyph`,
    );
  }
  for (const [name, source] of [['DevWorkspacePanel', DEVPANEL], ['SwarmMessageLog', LOG]] as const) {
    assert.match(source, /icon=\{MinimizeIcon\}/, `${name} lost the minimize glyph`);
  }
});

test('Repositories opens its folder, in the row and in the rail', () => {
  const at = SIDEBAR.indexOf("label: 'Repositories',");
  assert.ok(at > 0, 'the Repositories row is gone');
  assert.match(SIDEBAR.slice(at, at + 260), /animated: FolderOpenIcon,/, 'the row lost the folder');
  const start = SIDEBAR.indexOf('xv-sidebar-collapsed-actions');
  const rail = SIDEBAR.slice(start, SIDEBAR.indexOf('<SidebarNavScroller', start));
  assert.match(rail, /icon=\{FolderOpenIcon\}/, 'the rail lost the folder');
});
