import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

/**
 * Guards for the mobile chrome: one logo, sections as a scrolling row, the bottom
 * bar, and what page fullscreen actually hides.
 *
 * All four were reported from a phone, and all four are the kind of thing that
 * looks fine to whoever is testing on a laptop.
 */

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const SHELL = read('./AppShell.tsx');
const SIDEBAR = read('./Sidebar.tsx');
const NAV = read('./MobileNav.tsx');
const TABS = read('../ui/Tabs.tsx');
const SETTINGS = read('../settings/SettingsView.tsx');
const CSS = read('../../app/globals.css');
const UIVERSE = read('../../../src/styles/uiverse.css');
const MIC = read('../terminal/ChatBarMicButton.tsx');
const THEME_TOGGLE = read('./ThemeToggle.tsx');

/**
 * Two Xroga wordmarks a few pixels apart: the page header carried one for small
 * screens, and the sidebar's own mobile bar — which sits at the top of the same
 * screen, and carries the drawer, search and new-terminal controls — carried the
 * other.
 */
test('there is one Xroga logo on a phone, not two', () => {
  assert.ok(!/HeaderLogo/.test(SHELL), 'the page header renders a logo again');
  assert.ok(!/<Logo\b/.test(SHELL), 'the app shell renders a logo again');
  // The one that stays is the sidebar's, because it is the bar with the controls.
  assert.match(SIDEBAR, /xv-mobile-workspace-logo/, 'the mobile bar lost its logo');
});

test('the settings sections are a scrolling row rather than a dropdown', () => {
  assert.ok(!/<Select\b/.test(SETTINGS), 'the section dropdown is back');
  assert.match(SETTINGS, /orientation="horizontal"/, 'the mobile switcher is not a tab strip');
  // Two tab strips over one set of panels: without a separate panel prefix the second
  // copy's aria-controls would point at panels that do not exist.
  assert.match(SETTINGS, /panelPrefix="xv-settings"/, 'the mobile strip controls nothing');
  assert.match(TABS, /xv-tabstrip flex-row flex-nowrap/, 'the horizontal strip wraps again');
  assert.match(CSS, /\.xv-settings-sections \.xv-tabstrip \{[^}]*overflow-x: auto;/, 'the strip does not scroll');
  // A tab reached by deep link can be off the end of a row that scrolls.
  assert.match(TABS, /inline: 'center'/, 'an off-screen tab is never brought into view');
});

test('the bottom bar uses the same glyphs as the sidebar', () => {
  for (const icon of [
    'TerminalIcon',
    'LayoutGridIcon',
    'FolderOpenIcon',
    'ConnectIcon',
    'RocketIcon',
    'HeartPulseIcon',
    'ChartColumnIncreasingIcon',
    'CogIcon',
  ]) {
    assert.match(NAV, new RegExp(`icon: ${icon}`), `the bottom bar is missing ${icon}`);
    assert.match(SIDEBAR, new RegExp(`\\b${icon}\\b`), `${icon} is not the sidebar's glyph`);
  }
  assert.ok(!/lucide-react/.test(NAV), 'the bottom bar still uses static lucide glyphs');
});

test('the selected tab is a filled disc in the chosen accent', () => {
  assert.match(NAV, /xv-mobile-nav__disc/, 'the disc is gone');
  assert.match(
    CSS,
    /\.xv-mobile-nav__tab\.is-active \.xv-mobile-nav__disc \{[^}]*background: var\(--accent\);/,
    'the active disc does not follow the accent',
  );
  assert.match(CSS, /\.xv-mobile-nav__disc \{[^}]*border-radius: 999px;/, 'the disc is not round');
  // A shape, not only a colour — so it survives a colour-blind reader.
  assert.match(CSS, /\.xv-mobile-nav__tab\.is-active \.xv-mobile-nav__disc \{[^}]*transform: translateY/);
});

test('the bar can be swiped away and swiped back', () => {
  assert.match(NAV, /onTouchStart=\{onTouchStart\}/, 'the bar has no swipe');
  assert.match(NAV, /travel > SWIPE_THRESHOLD_PX\) setHidden\(true\)/, 'swiping down does not hide it');
  assert.match(NAV, /travel < -SWIPE_THRESHOLD_PX\) setHidden\(false\)/, 'swiping up does not show it');
  assert.match(CSS, /\.xv-mobile-nav\[data-hidden='true'\] \{\n\s*transform: translateY/, 'hiding moves nothing');
  // The handle stays on screen while the bar is down, and is a button in its own
  // right — a gesture with nothing left to grab cannot be undone, and a gesture with
  // no control behind it cannot be used with a keyboard.
  assert.match(NAV, /className="xv-mobile-nav__handle"/, 'there is no handle to grab');
  assert.match(NAV, /aria-label=\{hidden \? 'Show navigation' : 'Hide navigation'\}/, 'the handle is unlabelled');
  assert.match(CSS, /translateY\(calc\(100% - 26px/, 'the handle goes off screen with the bar');
});

/**
 * Fullscreen used to name only `aside.xv-sidebar-hover` and hide it with
 * `visibility`. That matched a state class the sidebar does not normally carry, so
 * the sidebar simply stayed; and a `visibility: hidden` element keeps its width, so
 * even when it matched it left a column of empty page beside the panel.
 */
test('page fullscreen hides every piece of chrome, on a phone too', () => {
  const rule = CSS.slice(
    CSS.indexOf('body.xv-page-fullscreen-active .xv-sidebar-root'),
    CSS.indexOf('body.xv-page-fullscreen-active .xv-sidebar-root') + 520,
  );
  for (const selector of [
    '.xv-sidebar-root',
    '.xv-sidebar-edge-toggle',
    '.xv-mobile-workspace-header',
    '.xv-mobile-nav',
  ]) {
    assert.match(rule, new RegExp(`body\\.xv-page-fullscreen-active \\${selector}`), `${selector} survives fullscreen`);
  }
  assert.match(rule, /display: none !important;/, 'the chrome is only hidden, so it keeps its space');
  assert.ok(
    !/body\.xv-page-fullscreen-active aside\.xv-sidebar-hover/.test(CSS),
    'the old state-class rule is back',
  );
  // The overlay has to be opaque or the page scrolls past behind it.
  assert.match(CSS, /\.xv-fullscreen-overlay \{\n\s*background: var\(--background\) !important;/);
  assert.match(CSS, /body\.xv-page-fullscreen-active \{\n\s*overflow: hidden;/, 'the page behind still scrolls');
});

test('the mic is bars with no ring around them', () => {
  assert.match(MIC, /icon=\{AudioLinesIcon\}/, 'the mic is not the bars');
  const rule = UIVERSE.slice(UIVERSE.indexOf('.xv-mic-btn {'), UIVERSE.indexOf('.xv-mic-btn:hover'));
  assert.match(rule, /border: 0;/, 'the resting ring is back');
  assert.match(rule, /background: transparent;/, 'the resting fill is back');
  // Listening is still marked by more than colour.
  assert.match(UIVERSE, /\.xv-mic-btn\.is-listening \{[^}]*background: color-mix/, 'listening lost its tint');
});

test('the sidebar rows that were given new glyphs kept them', () => {
  for (const [label, icon] of [
    ["'Showcase'", 'AirplayIcon'],
    ["'Community'", 'UsersRoundIcon'],
    ["'Share Feedback'", 'SmileIcon'],
    ["'Growth'", 'ChartColumnIncreasingIcon'],
    ["'Operations'", 'HeartPulseIcon'],
  ]) {
    const at = SIDEBAR.indexOf(`label: ${label},`);
    assert.ok(at > 0, `the ${label} row is gone`);
    assert.match(SIDEBAR.slice(at, at + 300), new RegExp(`animated: ${icon},`), `${label} lost ${icon}`);
  }
});


/**
 * There was a second theme control: a loose button floating over every dashboard tab,
 * with no toolbar to belong to. The sidebar's toolbar carries the real one, beside
 * New and Search.
 */
test('there is one theme control, not two', () => {
  assert.ok(!/<ThemeToggle/.test(SHELL), 'the floating theme button is back');
  assert.match(SIDEBAR, /<ThemeToggle \/>/, 'the sidebar lost the real one');
  assert.ok(THEME_TOGGLE.length > 0, 'the theme control itself is gone');
  // With the logo and the toggle both gone, the header was an empty absolutely
  // positioned strip across the top of every page — invisible, and still in front of
  // whatever it covered.
  assert.ok(!/xv-site-header/.test(SHELL), 'the empty header strip is back');
});

/**
 * Fullscreen on a phone gives up the frame and the chrome.
 *
 * The mobile bar is named in the CSS rather than left to the `hidden` class the shell
 * puts on it: `.xv-mobile-workspace-header` sets `display: flex` inside a media query
 * emitted after Tailwind's utilities, so at equal specificity the later rule won and
 * the logo and its buttons stayed on top of the terminal. Measured with `hidden`
 * applied, the header still computed `display: flex`.
 */
test('workspace fullscreen is edge to edge on a phone and hides the mobile bar', () => {
  const at = CSS.indexOf('body.xv-terminal-fullscreen-active .xv-sidebar-root');
  assert.notEqual(at, -1, 'terminal fullscreen hides nothing');
  const rule = CSS.slice(at, CSS.indexOf('}', at));
  assert.ok(
    rule.includes('body.xv-terminal-fullscreen-active .xv-mobile-workspace-header'),
    'the mobile bar survives workspace fullscreen',
  );
  assert.match(rule, /display: none !important/, 'the bar is only hidden, so it keeps its space');

  const mobile = CSS.slice(CSS.indexOf('@media (max-width: 1023px) {', CSS.indexOf('.xv-app-stage--fullscreen {')));
  assert.match(
    mobile,
    /body\.xv-terminal-fullscreen-active \.xv-app-stage--fullscreen \{\n\s*padding: 0;/,
    'the stage keeps its gutter on a phone',
  );
  assert.match(mobile, /border-radius: 0;/, 'the shell keeps its rounded corners on a phone');
  // Desktop keeps the frame: there is a desk for the window to sit on there.
  assert.match(CSS, /\.xv-app-stage--fullscreen \{ padding: var\(--xv-app-gutter\); \}/);
});
