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

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const SHELL = read('./AppShell.tsx');
const SIDEBAR = read('./Sidebar.tsx');
const NAV = read('./MobileNav.tsx');
const TABS = read('../ui/Tabs.tsx');
const SETTINGS = read('../settings/SettingsView.tsx');
const CSS = read('../../app/globals.css');
const UIVERSE = read('../../../src/styles/uiverse.css');
const MIC = read('../terminal/ChatBarButtons.tsx');
const THEME_TOGGLE = read('./ThemeToggle.tsx');
const HISTORY = read('./SidebarProjectHistory.tsx');
const GH = read('../icons/GitHubIcon.tsx');
const GH_GLYPH = read('../icons/animated/GithubGlyphIcon.tsx');
const METER = read('../icons/animated/AudioLinesIcon.tsx');
const PROMPT = read('../icons/animated/TerminalPromptIcon.tsx');

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

test('every bottom tab keeps its icon and label while selection changes contrast', () => {
  assert.match(NAV, /xv-mobile-nav__disc/, 'the disc is gone');
  assert.match(
    CSS,
    /\.xv-mobile-nav__tab\.is-active \{[^}]*background: var\(--foreground\);[^}]*color: var\(--background\);/,
    'the active destination is not a clear theme-aware segment',
  );
  assert.match(CSS, /\.xv-mobile-nav__disc \{[^}]*border-radius: 8px;/, 'the icon box is too round');
  assert.match(CSS, /\.xv-mobile-nav__label \{[^}]*max-width: 92px;[^}]*opacity: 1;/, 'inactive labels are hidden');
});

test('the bar goes away as the page is read, and comes back on the way up', () => {
  /*
   * The direction is the page's, not the bar's.
   *
   * Reading down puts the bar away; coming back up brings it out. That is the same
   * direction as the scroll it competes with, so the gesture and the scroll cannot
   * disagree — which they did before, when a downward swipe hid a bar that a downward
   * scroll would have shown.
   */
  assert.match(NAV, /travel < -SWIPE_THRESHOLD_PX\) setHidden\(true\)/, 'swiping up does not hide it');
  assert.match(NAV, /travel > SWIPE_THRESHOLD_PX\) setHidden\(false\)/, 'swiping down does not show it');
  assert.match(NAV, /window\.addEventListener\('scroll', onScroll, \{ passive: true \}\)/, 'the bar ignores the scroll');
  assert.match(NAV, /setHidden\(travel > 0\)/, 'scrolling down does not put it away');
  assert.match(NAV, /if \(current <= 0\) setHidden\(false\)/, 'the top of the page can leave it hidden');
  // A destination reached from elsewhere brings it back: arriving on a new page with
  // no navigation on screen is the one state it must never be in.
  assert.match(NAV, /useEffect\(\(\) => setHidden\(false\), \[pathname\]\)/, 'a new page can arrive with no nav');

  /*
   * The handle is gone, and must stay gone.
   *
   * It was a 4px line under the bar whose only job was to undo the gesture that hid
   * the bar — a control existing to fix another control. With the scroll driving it
   * there is nothing left to undo, so the bar leaves the screen completely.
   */
  assert.ok(!/xv-mobile-nav__handle/.test(NAV), 'the grab handle is back');
  assert.ok(!/xv-mobile-nav__handle/.test(CSS), 'the grab handle is back in the stylesheet');
  assert.match(CSS, /\.xv-mobile-nav\[data-hidden='true'\] \{\n\s*transform: translateY\(100%\);/, 'it parks a stub again');
});

test('the bar is a compact bottom-attached box with a flat selected segment', () => {
  const bar = CSS.slice(CSS.indexOf('.xv-mobile-nav__bar {'), CSS.indexOf('.xv-mobile-nav__bar::-webkit'));
  assert.match(bar, /width: 100%;/, 'the bar is floating instead of touching both edges');
  assert.match(bar, /min-height: 58px;/, 'the compact reference height was lost');
  assert.match(bar, /border-radius: 14px 14px 0 0;/, 'the navigation is still a floating capsule');
  assert.match(bar, /border-bottom: 0;/, 'the bar does not attach cleanly to the viewport');
  assert.match(bar, /env\(safe-area-inset-bottom/, 'the attached bar ignores the home indicator');

  const active = CSS.slice(
    CSS.indexOf('.xv-mobile-nav__tab.is-active {'),
    CSS.indexOf('.xv-mobile-nav__label {'),
  );
  assert.doesNotMatch(active, /translateY|0 0 34px/, 'the old raised glowing disc is back');
  assert.match(active, /background: var\(--foreground\)/, 'the active segment does not invert with its theme');
  assert.match(active, /color: var\(--background\)/, 'the active label does not invert with its theme');
});

test('the mobile header is one textured glass frame around the mark and controls', () => {
  assert.match(SIDEBAR, /xv-mobile-workspace-pill/, 'the header is two floating elements again');
  const pill = CSS.slice(
    CSS.indexOf('.xv-mobile-workspace-pill {'),
    CSS.indexOf('.xv-mobile-workspace-logo'),
  );
  assert.match(pill, /min-height: 48px;/, 'the header grew back to its oversized height');
  assert.match(pill, /border-radius: 18px;/, 'the header lost its compact rounded frame');
  assert.match(pill, /pointer-events: auto;/, 'the pill cannot be touched');
  assert.match(pill, /justify-content: space-between;/, 'the mark and the controls are no longer opposed');
  assert.match(pill, /--xv-mobile-header-art: url\('\/workspace\/mobile-header\/white-voxel-world-20260830\.webp'\)/);
  assert.match(pill, /background-image: var\(--xv-mobile-header-art\)/);
  for (const [theme, asset] of [
    ['beige', 'beige-architecture-20260830.webp'],
    ['gray', 'gray-skyline-20260830.webp'],
    ['black', 'black-coder-universe-20260830.webp'],
  ]) {
    assert.match(CSS, new RegExp(`body\\.theme-${theme} \\.xv-mobile-workspace-pill \\{[\\s\\S]*?${asset}`));
  }
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

/**
 * The meter is the mic, and it runs for exactly as long as the recording does.
 *
 * There used to be two drawings of the same thing: the glyph, hidden while
 * listening, and three CSS bars behind it. One of them was always wrong.
 */
test('the mic is a meter that runs while recording and stops when it ends', () => {
  assert.match(MIC, /<AudioLinesIcon ref=\{meterRef\} loop/, 'the mic is not the meter');
  assert.ok(!/xv-mic-wave/.test(MIC), 'the second drawing is back');
  assert.ok(!/xv-mic-wave/.test(UIVERSE), 'the CSS bars are back');
  assert.match(METER, /repeat: loop \? Number\.POSITIVE_INFINITY : 0/, 'the meter settles mid-recording');

  /*
   * Driven from the recording state, not from the click: the recording ends without
   * one when the browser stops on silence, on an error, or when permission is
   * refused. The bars have to settle with it or they go on claiming to record a
   * released mic.
   */
  assert.match(MIC, /if \(state === 'recording'\) meterRef\.current\?\.startAnimation\(\);/);
  assert.match(MIC, /else meterRef\.current\?\.stopAnimation\(\);/);
  assert.match(MIC, /\}, \[state\]\);/, 'the meter is not tied to the recording');

  /*
   * This file, and not a second one.
   *
   * The meter first landed in `ChatBarMicButton.tsx`, which nothing imported — the
   * composer renders `ChatBarMicrophoneButton` from here. The guards passed against
   * a file with no production caller while the shipped mic was still a lucide glyph,
   * which is how it reached a user. The duplicate is deleted; this asserts the
   * component the composer actually mounts.
   */
  assert.match(MIC, /export function ChatBarMicrophoneButton\(/, 'the live mic button moved');
  assert.match(
    read('../terminal/ChatBarParts.tsx'),
    /<ChatBarMicrophoneButton /,
    'the composer stopped rendering the mic this guard checks',
  );

  const rule = UIVERSE.slice(UIVERSE.indexOf('.xv-mic-btn {'), UIVERSE.indexOf('.xv-mic-btn:hover'));
  assert.match(rule, /border: 0;/, 'the resting ring is back');
  assert.match(rule, /background: transparent;/, 'the resting fill is back');
  // The terminal's ink, inherited. `var(--foreground)` measured 1.24 against the Gray
  // terminal and 1.18 against Black, because the skins do not all redefine it the
  // same way and it fell through to the page's value.
  assert.match(rule, /color: inherit;/, 'the meter names a token that falls through');
  // Recording is red AND moving, so it does not rest on colour alone.
  assert.match(UIVERSE, /\.xv-mic-btn\.is-listening[^{]*\{[^}]*color: #dc2626;/, 'recording is not red');
});

/**
 * An icon rendered outside `AnimatedIcon` has no `LazyMotion` above it, and `m`
 * components without one are plain elements with no animation features loaded. The
 * meter shipped that way for one build: measured, its opacity held at 1 and its
 * transform at `none` for the whole run. These two are the only icons rendered
 * directly, so these two carry their own provider.
 */
test('the icons that render outside AnimatedIcon bring their own motion provider', () => {
  for (const [name, source] of [['AudioLinesIcon', METER], ['TerminalPromptIcon', PROMPT]] as const) {
    assert.match(source, /import \{ IconMotion \}/, `${name} has no provider to fall back on`);
    assert.match(source, /<IconMotion>/, `${name} does not wrap itself`);
  }
});

/**
 * The mic used to be painted over by a theme rule with `!important` on both the fill
 * and the ink: a white disc with slate-900 bars, stuck to a dark composer. That is
 * the outline it was asked to lose, and it measured 1.24 and 1.18 against its own
 * surface on Gray and Black.
 */
test('no theme paints a coin behind the mic', () => {
  assert.ok(
    !/\.xv-terminal-dock \.xv-mic-btn \{[^}]*background: #ffffff !important/.test(CSS),
    'the white coin is back',
  );
  assert.ok(
    !/body\.theme-gray \.xv-mic-btn \{/.test(CSS),
    'a theme is overriding the mic again',
  );
});

/**
 * The Beige workspace runs the Solar terminal, whose muted ink measured 3.29 against
 * its own surface — under AA, and the reason the prompt line read as washed-out grey
 * rather than as text.
 */
test('the Solar terminal ink is readable on its own surface', () => {
  const solar = CSS.slice(CSS.indexOf('.terminal-skin-solar {'), CSS.indexOf('}', CSS.indexOf('.terminal-skin-solar {')));
  assert.match(solar, /--muted: #5c6a76;/, 'the washed-out muted ink is back');
  assert.ok(!/--muted: #7c8a94;/.test(solar), 'the sub-AA value is back');
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
/**
 * Fullscreen has to remove the mobile bar, and the CSS has to be the thing that does
 * it.
 *
 * The shell puts `hidden` on the bar, but `.xv-mobile-workspace-header` sets
 * `display: flex` inside a media query emitted after Tailwind's utilities, so at
 * equal specificity the later rule won and the logo and its buttons stayed on top of
 * the terminal. Measured with `hidden` applied, the header still computed
 * `display: flex`.
 *
 * The geometry that goes with it is asserted separately, below.
 */
test('workspace fullscreen hides the mobile bar', () => {
  const at = CSS.indexOf('body.xv-terminal-fullscreen-active .xv-sidebar-root');
  assert.notEqual(at, -1, 'terminal fullscreen hides nothing');
  const rule = CSS.slice(at, CSS.indexOf('}', at));
  assert.ok(
    rule.includes('body.xv-terminal-fullscreen-active .xv-mobile-workspace-header'),
    'the mobile bar survives workspace fullscreen',
  );
  assert.match(rule, /display: none !important/, 'the bar is only hidden, so it keeps its space');
});

test('the drawer close button belongs to the toolbar it sits in', () => {
  // Its own default is a 36px outlined button, right in a modal and wrong beside
  // three 28px borderless siblings — it sat a head taller with a box drawn round it.
  assert.match(
    SIDEBAR,
    /<ModalCloseButton onClick=\{closeMobile\} className="xv-sidebar-head-icon" \/>/,
    'the close button is back to its modal size',
  );
  // The compound selector outranks the button's own utilities whatever order they
  // are emitted in, which is the whole reason it is written this way.
  assert.match(CSS, /\.xv-sidebar-header-actions \.xv-sidebar-head-icon svg \{ width: 14px;/);
});

test('the phone can change theme without opening the drawer', () => {
  const header = SIDEBAR.slice(
    SIDEBAR.indexOf('xv-mobile-workspace-actions'),
    SIDEBAR.indexOf('</header>', SIDEBAR.indexOf('xv-mobile-workspace-actions')),
  );
  assert.match(header, /<ThemeToggle \/>/, 'theme is only reachable behind the drawer again');
});

/**
 * The GitHub mark is the one logo on the site that has to survive every theme: it
 * appears on both auth forms, the marketing footer, three landing pages, the
 * homepage ship stack, the about visual and two showcase surfaces.
 */
test('the GitHub mark is a disc that inverts with the theme', () => {
  assert.match(GH, /icon=\{GithubGlyphIcon\}/, 'the mark is not the animated glyph');
  assert.match(CSS, /\.xv-github-mark \{[^}]*background: var\(--foreground\);/, 'the disc is not themed');
  assert.match(CSS, /\.xv-github-mark \{[^}]*color: var\(--background\);/, 'the glyph is not themed');
  assert.match(CSS, /\.xv-github-mark \{[^}]*border-radius: 999px;/, 'the disc is not round');
  // Sized in `em` so it follows the type it sits in, from a 3.5 utility to body text.
  assert.match(CSS, /\.xv-github-mark \{[^}]*width: 1\.6em;/);

  // A span, not a div: this sits in running text, and a div inside a p is invalid
  // HTML that React reports as a hydration mismatch.
  assert.match(GH_GLYPH, /<m\.span/, 'the mark roots a div again and breaks hydration in prose');
  assert.ok(!/<m\.div/.test(GH_GLYPH), 'the mark roots a div again');
  // The handler types stay div-shaped, because widening the shared type breaks every
  // div-rooted icon: a handler taking the narrower element cannot accept the wider.
  assert.match(GH_GLYPH, /React\.MouseEvent<HTMLDivElement>/, 'the shared icon type was widened');
});

test('the repository rows under the filter are fork points', () => {
  // Named carefully: this is the row icon beneath the Repositories/filter header, not
  // the Repositories destination in the nav.
  assert.match(HISTORY, /icon=\{GitForkIcon\}/, 'the repository rows lost the fork');
  assert.ok(!/FolderGit2/.test(HISTORY), 'the folder glyph is back on the rows');
  // The open state stays a folder, because that one says "expanded", not "repository".
  assert.match(HISTORY, /const FolderIcon = isOpen \? FolderOpen : null;/);
});

test('fullscreen on a phone is a rounded box that fills the screen', () => {
  const mobile = CSS.slice(CSS.indexOf('@media (max-width: 1023px) {', CSS.indexOf('.xv-app-stage--fullscreen {')));
  // 4px, not 0. Zero filled the screen and lost the thing the workspace is.
  assert.match(mobile, /padding: 4px;/, 'the stage gave up its gutter again');
  assert.match(mobile, /border-radius: 14px;/, 'the shell squared off again');
  assert.ok(!/border-radius: 0;/.test(mobile.slice(0, 900)), 'the shell squares off again');
  // The top edge clears the status bar rather than sliding under it.
  assert.match(mobile, /padding-top: max\(4px, env\(safe-area-inset-top\)\);/);
  // And the composer stops where the terminal's corners do.
  assert.match(mobile, /\.xv-terminal-dock \{\n\s*left: 4px !important;/, 'the composer runs past the box');
});
