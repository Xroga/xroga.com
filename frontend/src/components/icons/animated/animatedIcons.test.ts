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

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const HOST = read('./AnimatedIcon.tsx');
const PROVIDER = read('./MotionProvider.tsx');
const SIDEBAR = read('../../layout/Sidebar.tsx');
const HISTORY = read('../../layout/SidebarProjectHistory.tsx');
const THEME = read('../../layout/ThemeToggle.tsx');
const PROFILE = read('../../ui/ProfileQuickMenu.tsx');
const SEND = read('../../terminal/ChatBarSendIcon.tsx');
const ACTIONS = read('../../terminal/ChatBarActionsMenu.tsx');
const MIC = read('../../terminal/ChatBarButtons.tsx');
const LOG = read('../../terminal/SwarmMessageLog.tsx');
const DASHBOARD = read('../../dashboard/DashboardView.tsx');
const PROMPT = read('./TerminalPromptIcon.tsx');
const FRAME = read('../../layout/PageFullscreenFrame.tsx');
const DEVPANEL = read('../../terminal/DevWorkspacePanel.tsx');
const SETTINGS = read('../../settings/SettingsView.tsx');
const LAUNCHER = read('../../terminal/WorkspaceLauncher.tsx');

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
  'CatIcon',
  'FilePenIcon',
  'UserRoundPenIcon',
  'ShieldCheckIcon',
  'DatabaseBackupIcon',
  'WalletIcon',
  'UserLockIcon',
  'BellElectricIcon',
  'UserStarIcon',
  'AtomIcon',
  'LogoutIcon',
  'EyeClosedIcon',
  'BatteryChargingIcon',
  'BatteryLowIcon',
  'CreditCardIcon',
  'ActivityIcon',
  'ExternalLinkIcon',
  'CopyIcon',
  'UpvoteIcon',
  'DownvoteIcon',
  'ShareIcon',
  'Trash2Icon',
  'LightbulbIcon',
  'EarthIcon',
  'AirplayIcon',
  'TabletIcon',
  'CpuIcon',
  'GlobeLockIcon',
  'NewTerminalIcon',
  'ImageIcon',
  'FileTextIcon',
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

test('the collapsed rail names each of its four shortcuts', () => {
  // Searched forward from the rail, not from the top of the file: `SidebarNavScroller`
  // is imported above it, so an unanchored lookup ends the slice before it starts.
  const start = SIDEBAR.indexOf('xv-sidebar-collapsed-actions');
  const rail = SIDEBAR.slice(start, SIDEBAR.indexOf('<SidebarNavScroller', start));
  assert.ok(rail.length > 0, 'the collapsed rail could not be located');
  assert.match(rail, /icon=\{LocateFixedIcon\}/, 'the rail lost the search glyph');
  assert.match(rail, /icon=\{LayoutGridIcon\}/, 'the rail lost the dashboard glyph');
  assert.match(rail, /icon=\{FolderOpenIcon\}/, 'the rail lost the folder');
  /*
   * The rail's second button carries the new-terminal window, not the code brackets.
   *
   * This guard used to call it "the workspace glyph" and require `CodeXmlIcon`. Its
   * `aria-label` is "New Terminal" and its handler is `handleNewChat`, so the
   * description was of a button that does not exist — the rail has no workspace
   * button. Naming the icon after what the control actually does is the fix; the
   * old assertion would have gone on passing while the button stayed mislabelled.
   */
  assert.match(rail, /icon=\{NewTerminalIcon\}/, 'the rail lost the new-terminal window');
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

test('the Companion settings tab wears the cat', () => {
  assert.match(SETTINGS, /icon=\{CatIcon\}/, 'the Companion tab lost the cat');
  assert.ok(!/\bSparkles\b/.test(SETTINGS), 'the static sparkles glyph is back');
  const at = SETTINGS.indexOf("id: 'companion'");
  assert.ok(at > 0, 'the Companion section is gone');
  assert.match(SETTINGS.slice(at, at + 200), /CatIcon/, 'the cat is not on the Companion row');
});

/*
 * The launcher used to say "Workspace", the same word the sidebar and the bottom bar
 * use for the whole page. What it actually opens is the file tree, the diff and the
 * editor, so it says "Project edits" and wears a pen. Both halves are asserted: a
 * rename without the icon, or an icon without the rename, leaves the same collision.
 */
test('the workspace launcher opens Project edits, with a pen', () => {
  assert.match(LAUNCHER, /icon=\{FilePenIcon\}/, 'the launcher lost the pen');
  assert.match(LAUNCHER, /<span>Project edits<\/span>/, 'the launcher label was not renamed');
  assert.ok(!/<span>Workspace<\/span>/.test(LAUNCHER), 'the launcher still says Workspace');
  assert.ok(
    !/PanelRightClose|PanelRightOpen/.test(LAUNCHER),
    'the static panel-slide glyphs are back',
  );
});

/*
 * The homepage header uses the product's icons, not its own.
 *
 * Theme and Dashboard sit in one segmented pill beside the wordmark, and they were
 * the last two static lucide glyphs on a control the reader meets before anything
 * else. The palette and the grid are the same components the sidebar, the collapsed
 * rail and the mobile bottom bar use for those destinations, so a place looks like
 * itself whichever surface you reach it from.
 */
test('the homepage header pill takes the palette and the grid', () => {
  const HOME = read('../../../app/page.tsx');
  const SWITCHER = read('../../companion/HomepageThemeSwitcher.tsx');

  assert.match(SWITCHER, /icon=\{PaletteIcon\}/, 'the homepage theme control lost the palette');
  assert.ok(!/<Palette\b/.test(SWITCHER), 'the static palette is back');

  assert.match(HOME, /icon=\{LayoutGridIcon\}/, 'the homepage Dashboard lost the grid');
  assert.ok(!/LayoutDashboard/.test(HOME), 'the static dashboard glyph is back');
});

/**
 * Every settings section wears an animated icon, and the right one.
 *
 * Nine tabs, nine placements. The pairing is the substance here — a guard that only
 * counted `AnimatedIcon` occurrences would pass with all nine showing the same glyph —
 * so each id is checked against the icon that belongs to it, inside its own object
 * literal rather than anywhere in the file.
 */
test('the settings sections each carry their own animated icon', () => {
  for (const [id, icon] of [
    ['general', 'UserRoundPenIcon'],
    ['companion', 'CatIcon'],
    ['privacy', 'ShieldCheckIcon'],
    ['data-ai', 'DatabaseBackupIcon'],
    ['plan', 'WalletIcon'],
    ['integrations', 'ConnectIcon'],
    ['security', 'UserLockIcon'],
    ['notifications', 'BellElectricIcon'],
    ['theme', 'PaletteIcon'],
  ] as const) {
    const at = SETTINGS.indexOf(`id: '${id}'`);
    assert.ok(at > 0, `the ${id} section is gone`);
    assert.match(SETTINGS.slice(at, at + 160), new RegExp(`icon=\\{${icon}\\}`), `${id} lost ${icon}`);
  }
  // No lucide glyph left in the rail at all — the whole import block went with them.
  assert.ok(!/from 'lucide-react'/.test(SETTINGS), 'a static glyph is back in the settings rail');
});

/**
 * The account menu animates every row, with no static fallback left in the renderer.
 *
 * The fallback is the part worth guarding. While a `{Icon ? … : Animated}` branch
 * existed, a new row could be added with a plain lucide glyph and look wired without
 * moving — the same shape of mistake as a guard pointed at a file nothing imports.
 */
test('every account menu row carries an animated icon', () => {
  const MENU = read('../../ui/ProfileQuickMenu.tsx');
  for (const [key, icon] of [
    ['plan', 'AtomIcon'],
    ['profile', 'UserRoundPenIcon'],
    ['personalization', 'PaletteIcon'],
    ['settings', 'CogIcon'],
    ['community', 'UsersRoundIcon'],
    ['feedback', 'SmileIcon'],
    ['about', 'UserStarIcon'],
  ] as const) {
    const at = MENU.indexOf(`key: '${key}'`);
    assert.ok(at > 0, `the ${key} row is gone`);
    assert.match(MENU.slice(at, at + 220), new RegExp(`animated: ${icon},`), `${key} lost ${icon}`);
  }
  assert.ok(!/from 'lucide-react'/.test(MENU), 'a static glyph is back in the account menu');
  assert.ok(!/'icon' in item/.test(MENU), 'the static branch is back, and can hide an unwired icon');

  // Logout is in a different file — the menu renders the shared button.
  const UIVERSE = read('../../ui/Uiverse.tsx');
  assert.match(UIVERSE, /icon=\{LogoutIcon\}/, 'the logout button lost its arrow');
  assert.ok(!/viewBox="0 0 512 512"/.test(UIVERSE), 'the solid Font Awesome mark is back');
});

/**
 * The capacity gauge reads its own value.
 *
 * Two icons for one instrument: the same battery with a bolt above the threshold and
 * with a single bar below it. The threshold is named rather than inlined, and the
 * unavailable case is asserted too — `?? 0` sends a reading the panel cannot
 * establish to the low battery, because an unknown capacity is not a capacity worth
 * reassuring anybody about.
 */
test('the dashboard widgets animate, and capacity picks its battery by value', () => {
  const HOME = read('../../dashboard/DashboardHomeView.tsx');
  assert.match(HOME, /const LOW_CAPACITY_PERCENT = 30;/, 'the threshold is gone');
  assert.match(
    HOME,
    /\(entitlement\.capacityRemainingPercent \?\? 0\) < LOW_CAPACITY_PERCENT\s*\n\s*\? BatteryLowIcon\s*\n\s*: BatteryChargingIcon/,
    'capacity no longer chooses its battery by value',
  );
  assert.match(HOME, /icon=\{CreditCardIcon\}/, 'Billing lost the card');
  assert.match(HOME, /icon=\{ActivityIcon\}/, 'Recent Activity lost the pulse');
  assert.match(HOME, /icon: AnimatedIconComponent;/, 'WidgetCard takes a static glyph again');
});

/**
 * The GitHub mark runs on its own, everywhere it appears.
 *
 * It is the second icon here that is not hover-driven. It stands for the connection
 * the product rests on and appears on surfaces nobody points at — a footer, a signup
 * form, a showcase row that is read rather than clicked — so waiting for a hover
 * would mean it never moves in most of its homes.
 *
 * The span root is asserted with it: this mark sits in running text, and a `div`
 * inside a `p` is a hydration mismatch. That is why the continuous version went into
 * this component rather than arriving as a second, div-rooted GitHub icon.
 */
test('the GitHub mark waves continuously, and is still a span', () => {
  const GLYPH = read('./GithubGlyphIcon.tsx');
  assert.match(GLYPH, /<IconMotion>/, 'the GitHub mark has no motion features loaded');
  assert.match(GLYPH, /repeat: Number\.POSITIVE_INFINITY/, 'the arm stops waving');
  assert.match(GLYPH, /controls\.start\(reduced \? 'normal' : 'animate'\);/, 'it waits to be driven');
  assert.match(GLYPH, /<m\.span/, 'the mark is a div again, which breaks hydration in prose');
  assert.ok(!/GithubIcon\.tsx/.test(GLYPH), 'a second GitHub icon is back');
});

test('the composer, the skin picker and the repo area take their icons', () => {
  const LAUNCH = read('../../terminal/WorkspaceLauncher.tsx');
  assert.match(LAUNCH, /icon=\{EyeClosedIcon\}/, 'hide-the-chatbar lost the closing eye');
  assert.ok(!/PanelBottom/.test(LAUNCH), 'the panel-slide glyphs are back');

  const SKIN = read('../../terminal/TerminalSkinPicker.tsx');
  assert.match(SKIN, /icon=\{PaletteIcon\}/, 'the skin picker lost the palette');
  assert.ok(!/<Palette\b/.test(SKIN), 'the static palette is back');
  assert.match(SKIN, /createPortal\(/, 'the skin menu is trapped behind the workspace again');

  const CARD = read('../../projects/GitHubProjectCard.tsx');
  assert.match(CARD, /icon=\{ExternalLinkIcon\}/, 'Open on GitHub lost its arrow');

  const PROJECTS = read('../../../app/(shell)/dashboard/projects/page.tsx');
  assert.match(PROJECTS, /icon=\{FolderOpenIcon\}/, 'the projects heading lost its folder');
  assert.match(PROJECTS, /icon=\{TerminalIcon\}/, 'New Terminal lost the chevron');

  const BUBBLE = read('../../terminal/MessageBubbleActions.tsx');
  for (const icon of ['UpvoteIcon', 'DownvoteIcon', 'CopyIcon', 'ShareIcon', 'Trash2Icon']) {
    assert.match(BUBBLE, new RegExp(`icon=\\{${icon}\\}`), `the message actions lost ${icon}`);
  }
  assert.ok(!/ThumbsUp|ThumbsDown/.test(BUBBLE), 'the static thumbs are back');
  assert.ok(!/<Share2\b|<Trash2\b/.test(BUBBLE), 'static share/delete glyphs are back');
  assert.match(BUBBLE, /<MessageShareModal/, 'share fell back to clipboard-only output');
});

/**
 * GitHub and Vercel animate wherever an integration mark is drawn.
 *
 * Every provider in this product is a brand SVG served as an image, and an image
 * cannot move. These two are the ones we have real components for, and the two that
 * carry the most weight — the repository connection and the deployment target.
 *
 * The guard is on the shared component and on the call sites together. There are six
 * of the latter, and wiring a mark at only some of them leaves the rest static with
 * nothing failing — which is exactly how the first attempt at the mic shipped.
 */
test('the integration marks are animated, in one place, at every call site', () => {
  const LOGO = read('../../integrations/IntegrationLogo.tsx');
  assert.match(LOGO, /id === 'github'/, 'GitHub falls through to a still image');
  assert.match(LOGO, /id === 'vercel'/, 'Vercel falls through to a still image');
  assert.match(LOGO, /<GithubGlyphIcon size=\{size\} \/>/, 'the GitHub mark is not the animated one');
  assert.match(LOGO, /<VercelIcon size=\{size\} \/>/, 'the Vercel mark is not the animated one');

  for (const [name, path] of [
    ['the composer modal', '../../terminal/IntegrationsModal.tsx'],
    ['the repository card', '../../projects/GitHubProjectCard.tsx'],
    ['the GitHub connect card', '../../integrations/GitHubConnect.tsx'],
    ['the homepage composer', '../../terminal/HomepageChatBar.tsx'],
    ['the homepage tour', '../../homepage/HomepageWorkspaceTour.tsx'],
  ] as const) {
    const source = read(path);
    assert.match(source, /<IntegrationLogo\b/, `${name} draws its own logo again`);
    assert.ok(!/getIntegrationLogo/.test(source), `${name} bypasses the shared mark`);
  }
  // The connect card led with a generic code glyph and no GitHub mark at all.
  assert.ok(!/<Code2\b/.test(read('../../integrations/GitHubConnect.tsx')), 'the generic glyph is back');
});

test('the homepage composer reuses the workspace controls and animated provider marks', () => {
  const HOME_COMPOSER = read('../../terminal/HomepageChatBar.tsx');
  assert.match(HOME_COMPOSER, /<ChatbarShell\b/, 'the homepage draws a separate chatbar shell again');
  assert.match(HOME_COMPOSER, /<ChatBarActionsMenu\b/, 'the homepage lost the workspace action control');
  assert.match(HOME_COMPOSER, /<ChatBarMicrophoneButton\b/, 'the homepage lost workspace voice input');
  assert.match(HOME_COMPOSER, /<ChatBarSendButton\b/, 'the homepage lost the workspace send control');
  assert.match(HOME_COMPOSER, /triggerComposerSignal\(900\)/, 'typing no longer triggers the workspace signal');
  assert.match(HOME_COMPOSER, /composerSignal && 'xv-chatbar--inner-active'/, 'the homepage signal is not connected to its shell');
  for (const provider of ['github', 'vercel', 'supabase']) {
    assert.match(
      HOME_COMPOSER,
      new RegExp(`<IntegrationLogo id="${provider}"`),
      `${provider} bypasses the shared integration mark`,
    );
  }
  assert.ok(!/brand\/logos\/(github|vercel)\.svg/.test(HOME_COMPOSER), 'a static provider logo returned');
});

/**
 * Both continuous marks run without being pointed at, and carry their own provider.
 *
 * Neither is driven by `AnimatedIcon`, so neither gets its `LazyMotion` — an icon
 * rendered outside that provider has no motion features loaded and is silently
 * static. That is not a hypothetical: it is how the mic shipped unmoving.
 */
test('the GitHub and Vercel marks run on their own', () => {
  const VERCEL = read('./VercelIcon.tsx');
  assert.match(VERCEL, /<IconMotion>/, 'the Vercel mark has no motion features loaded');
  assert.match(VERCEL, /repeat: Number\.POSITIVE_INFINITY/, 'the Vercel mark stops');
  assert.match(VERCEL, /controls\.start\(reduced \? 'normal' : 'animate'\);/, 'it waits to be driven');
  // Filled, not outlined: this is a brand logo, and stroking it makes it another logo.
  assert.match(VERCEL, /d="M12 3 21 19H3L12 3Z" fill="currentColor"/, 'the triangle lost its fill');
});

/**
 * The new-terminal badge takes the theme rather than the design's blue and white.
 *
 * `--card` for the ring so the badge sits on top of the terminal rather than punched
 * through it, `--accent` for the fill so it follows the colour the reader chose, and
 * `--button-text` for the plus so it stays legible when that accent is a pale one.
 */
test('the new-terminal badge stays legible on every theme', () => {
  const ICON = read('./NewTerminalIcon.tsx');
  assert.match(ICON, /fill="var\(--accent\)"/, 'the badge is a fixed colour again');
  assert.match(ICON, /r="6.4" fill="var\(--card\)"/, 'the badge lost the ring that separates it from the window');

  /*
   * The plus is inked with the surface, not with `--button-text`.
   *
   * On the Black theme `--accent` is `#ffffff`, so a white plus on an accent disc was
   * white on white and simply gone — the control rendered as a smudge, which is how it
   * was reported. Inking it with `--card` makes it invert with the theme the way the
   * disc does: dark on a white accent, light on a blue one. Verified in a browser
   * across all four themes rather than reasoned about, because the first version
   * looked correct in the source too.
   */
  assert.ok(!/--button-text/.test(ICON), 'the plus can vanish into a white accent again');
  const plus = ICON.slice(ICON.indexOf('d="M17.5 3.6v5.8"'), ICON.indexOf('</m.g>'));
  assert.match(plus, /stroke="var\(--card\)"/, 'the plus stopped following the surface');

  // The window is drawn inside 17 units so the badge can be large enough to hold a
  // plus at the 16px this renders at in the toolbar.
  assert.match(ICON, /<m\.rect x="1.75" y="5.5" width="15.5" height="13"/, 'the window is full-bleed again, which shrinks the badge');
});
/**
 * A rule that hides a label must not hide the icon beside it.
 *
 * The compact New Terminal button showed nothing on every theme, and the cause was not
 * a colour or a size: `.xv-new-terminal-compact span { display: none }` was written to
 * hide the word "New", and `AnimatedIcon` wraps its glyph in a span too. The icon
 * computed `display: none` and the control rendered as an empty 30x28 square.
 *
 * Measured, not reasoned about — the source read as correct, and it took rendering the
 * real markup against the built stylesheet to see the host was `display: none` and the
 * svg `0x0`. So the guard is written against the shape of the mistake: any rule that
 * hides a bare `span` inside a control that also holds an `AnimatedIcon` will hide the
 * icon, so the label has to be named.
 */
test('the New Terminal label is hidden by name, not by element', () => {
  const CSS = read('../../../app/globals.css');
  assert.ok(
    !/\.xv-new-terminal-compact\s+span\s*\{[^}]*display:\s*none/.test(CSS),
    'a bare span rule is back, which hides the icon along with the label',
  );
  assert.match(CSS, /\.xv-new-terminal-compact__label \{ display: none; \}/, 'the label is no longer hidden');
  assert.match(SIDEBAR, /className="xv-new-terminal-compact__label"/, 'the label lost the class the rule targets');

  // The icon's own wrapper is a span, which is the whole reason the rule had to change.
  assert.match(HOST, /<span ref=\{hostRef\}/, 'the host is no longer a span, so this guard is checking the wrong thing');
});
