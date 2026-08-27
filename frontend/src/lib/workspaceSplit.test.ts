import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
/*
 * The bounds are read from the store's source rather than imported.
 *
 * The suite runs `tsx --test` from the repo root, where the frontend tsconfig's path
 * aliases are not in effect — and the store imports `@/lib/theme`, so importing it
 * here fails to resolve no matter how this file spells its own import.
 */

/**
 * Guards for the resizable split, the expanded preview, and the rail's footer.
 *
 * **The split width is a share, not a pixel count.** It lives inside a shell whose
 * own width moves with the sidebar and the browser window, so a pixel width chosen
 * on a wide screen would keep its size and swallow the terminal on a narrow one.
 *
 * **The expanded preview hides chrome from `body`.** The composer and the sidebar are
 * not descendants of the panel — they are siblings several levels up, mounted by the
 * app shell — so the panel cannot hide them by rendering differently. And it must be
 * `display: none`: a sidebar hidden with `visibility` keeps its width and leaves a
 * band of shell beside a preview that is supposed to be full, which is the same bug
 * terminal fullscreen already had.
 *
 * **The rail carries the account, and only that.** Collapsing is what fullscreen does
 * now, so a rail with no avatar means signing out requires expanding first. It briefly
 * carried standalone plan and settings buttons as well — three targets stacked in a
 * 64px column for destinations the account menu already lists.
 *
 * The geometry is measured in `e2e/command3-auth.spec.ts`, which can reach the
 * authenticated workspace. These guard the decisions that produce it.
 */

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const DASH = read('../components/dashboard/DashboardView.tsx');
const PANEL = read('../components/terminal/DevWorkspacePanel.tsx');
const SIDEBAR = read('../components/layout/Sidebar.tsx');
const UIVERSE = read('../styles/uiverse.css');
const STORE = read('../store/useThemeStore.ts');
const CSS = read('../app/globals.css');
const E2E = read('../../e2e/command3-auth.spec.ts');

/** CSS with comments stripped, so prose about a rule cannot satisfy a search for it. */
const code = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

/** An exported numeric constant, read from the store's source. */
function constant(name: string): number {
  const match = new RegExp(`export const ${name} = (-?[\\d.]+);`).exec(STORE);
  assert.ok(match, `${name} is not exported from the store`);
  return Number(match[1]);
}

const WORKSPACE_MIN_WIDTH = constant('WORKSPACE_MIN_WIDTH');
const WORKSPACE_MAX_WIDTH = constant('WORKSPACE_MAX_WIDTH');
const WORKSPACE_DEFAULT_WIDTH = constant('WORKSPACE_DEFAULT_WIDTH');

test('the split width is a bounded share of the shell', () => {
  assert.ok(WORKSPACE_MIN_WIDTH < WORKSPACE_DEFAULT_WIDTH, 'the default is below the floor');
  assert.ok(WORKSPACE_DEFAULT_WIDTH < WORKSPACE_MAX_WIDTH, 'the default is above the ceiling');
  // Percentages, so the split survives the shell changing width.
  assert.ok(WORKSPACE_MAX_WIDTH <= 100, 'the share should be a percentage');
  assert.match(
    code,
    /grid-template-columns:\s*minmax\(0, 1fr\) auto var\(--xv-workspace-width/,
    'the workspace column must follow the stored width',
  );
});

test('the split has a track for every child', () => {
  /*
   * The open split holds three children: the terminal pane, the drag handle and the
   * panel. A two-track template silently wraps the third onto an implicit second row,
   * where it takes the first column's width — so dragging resizes the handle's track
   * and the panel moves the *wrong way*. It looks like a sign error in the drag maths
   * and is not one, which is what made it worth its own guard.
   */
  const open = code.indexOf(".xv-workspace-body[data-workspace-open='true'] {");
  assert.notEqual(open, -1, 'the open split has no columns');
  const columns = code.slice(code.indexOf('grid-template-columns', open), code.indexOf('}', open));
  const tracks = columns.split(':')[1].trim().replace(/\(([^)]*)\)/g, (m) => m.replace(/\s/g, '')).split(/\s+/);
  assert.equal(tracks.length, 3, `the open split declares ${tracks.length} tracks for three children`);

  const children = ['xv-terminal-panel', 'xv-workspace-resize', 'xv-dev-workspace'];
  for (const child of children) {
    assert.ok(DASH.includes(child) || PANEL.includes(child), `${child} is not in the split`);
  }
});

test('clamping lives in the setter and on the way back out', () => {
  // In the setter, every caller gets the same bounds — including the keyboard path.
  assert.match(
    STORE,
    /setWorkspaceWidth: \(workspaceWidth\) =>\s*set\(\{ workspaceWidth: Math\.min\(WORKSPACE_MAX_WIDTH, Math\.max\(WORKSPACE_MIN_WIDTH/,
    'the setter must clamp',
  );
  // And on read: a value stored before the bounds changed would otherwise come back
  // out of range and hand one pane the whole shell.
  assert.match(STORE, /workspaceWidth:\s*\n?\s*typeof state\.workspaceWidth === 'number'/, 'migrate must re-clamp');
  assert.match(STORE, /workspaceWidth: s\.workspaceWidth/, 'the width must persist');
});

test('the handle works without a pointer', () => {
  // A separator that only responds to a drag is unusable from the keyboard.
  assert.match(DASH, /role="separator"/, 'the handle needs a separator role');
  assert.match(DASH, /onKeyDown=\{onWorkspaceResizeKey\}/, 'the handle needs a keyboard path');
  for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
    assert.ok(DASH.includes(`'${key}'`), `${key} should move the split`);
  }
  assert.match(DASH, /aria-valuenow=\{Math\.round\(workspaceWidth\)\}/, 'the value must be exposed');
});

test('the handle only exists while the workspace is open', () => {
  // Otherwise a closed workspace has an invisible grab strip down the middle of the
  // terminal.
  const at = DASH.indexOf('role="separator"');
  assert.ok(/workspaceOpen \?/.test(DASH.slice(at - 400, at)), 'the handle should be conditional');
});

test('the expanded preview owns the viewport and hides the shell', () => {
  assert.match(PANEL, /xv-workspace-expanded fixed inset-0/, 'expanded must cover the viewport');
  // Scoped to the panel's own root class list, comments stripped. A file-wide search
  // for `inset-3` also matches the log-fullscreen overlay further down — a different
  // control that is legitimately inset — and the comment explaining this change.
  const root = PANEL.replace(/\/\/[^\n]*/g, '');
  const rootAt = root.indexOf("'xv-dev-workspace flex flex-col overflow-hidden'");
  assert.notEqual(rootAt, -1, 'the panel root has been renamed');
  const rootClasses = root.slice(rootAt, root.indexOf('className\n', rootAt) + 40);
  assert.ok(!/inset-3/.test(rootClasses), 'the old inset expanded state is back');
  // `expanded && workspaceOpen`, not `expanded` alone: closing the panel leaves this
  // component mounted rendering `null`, so a flag set from `expanded` by itself
  // survived the panel and left the chrome hidden until a reload. The claim here is
  // unchanged — the shell needs a flag it can read — it just has to stop being true
  // when there is no panel to describe.
  assert.match(
    PANEL,
    /classList\.toggle\('xv-workspace-expanded-active', expanded && workspaceOpen\)/,
    'the shell needs a flag it can read, and one that dies with the panel',
  );
  // Cleared on unmount: closing the workspace while expanded would otherwise leave
  // the chrome hidden with nothing on screen to bring it back.
  assert.match(
    PANEL,
    /return \(\) => document\.body\.classList\.remove\('xv-workspace-expanded-active'\)/,
    'the flag must be cleared on unmount',
  );

  /*
   * The rule that hides the chrome, not merely the first mention of the flag.
   *
   * This used to take `indexOf` and read the block that followed. More than one rule
   * responds to the expanded flag now — releasing the phone's reserved header strip
   * is another — so the first hit stopped being the hiding rule and the guard failed
   * on a change that was not about hiding anything. Every block is collected and the
   * claim is that one of them stands the chrome down.
   */
  const blocks: string[] = [];
  for (let at = code.indexOf('body.xv-workspace-expanded-active'); at !== -1;
       at = code.indexOf('body.xv-workspace-expanded-active', at + 1)) {
    blocks.push(code.slice(at, code.indexOf('}', at) + 1));
  }
  assert.notEqual(blocks.length, 0, 'nothing responds to the expanded flag');

  const hiding = blocks.find(
    (block) => block.includes('.xv-terminal-dock') && block.includes('.xv-sidebar-root'),
  );
  assert.ok(hiding, 'the composer and the sidebar should stand down for the preview');
  assert.match(
    hiding,
    /display:\s*none\s*!important/,
    'hiding must remove the element from layout, not just stop it painting',
  );
});

test('the expanded preview has no drawn border', () => {
  const at = code.indexOf('.xv-workspace-expanded {');
  assert.notEqual(at, -1, 'the expanded panel has no styles');
  const body = code.slice(code.indexOf('{', at) + 1, code.indexOf('}', at));
  assert.match(body, /border:\s*0/, 'the hard outline should be gone');
  assert.match(body, /box-shadow:/, 'the edge should be carried by a shadow instead');
});

test('the collapsed rail carries the account, and only that', () => {
  assert.match(SIDEBAR, /\{navExpanded \? bottomSection : railBottom\}/, 'the rail needs its own footer');
  const at = SIDEBAR.indexOf('const railBottom = (');
  assert.notEqual(at, -1, 'the rail footer is missing');
  const block = SIDEBAR.slice(at, SIDEBAR.indexOf('const bottomSection', at));

  // The avatar and the control that opens its menu.
  assert.ok(block.includes('ProfileQuickMenu'), 'the account menu should be on the rail');
  assert.ok(/UserProfileBox|IncognitoProfileBox/.test(block), 'the avatar should be on the rail');

  // And nothing else. Standalone plan and settings buttons were three targets stacked
  // in a 64px column for destinations the menu already lists; the rail is meant to be
  // the quiet version of the sidebar.
  assert.ok(!block.includes('href="/pricing"'), 'the plan button is back on the rail');
  assert.ok(!block.includes('href="/settings"'), 'the settings button is back on the rail');
});

test('the rail footer sits at the bottom of a full-height rail', () => {
  // Sized to its contents the rail has no column to push anything down, so the footer
  // rides directly under the shortcuts near the top — `mt-auto` needs something to
  // work against.
  const at = UIVERSE.indexOf('.xv-sidebar-root.is-collapsed .xv-sidebar-floating {');
  assert.notEqual(at, -1, 'the collapsed rail has no rule');
  const body = UIVERSE.slice(at, UIVERSE.indexOf('}', at));
  assert.ok(!/height:\s*max-content/.test(body), 'the rail is sized to its contents again');
  assert.match(body, /height:\s*calc\(100vh/, 'the rail needs a full-height column');
  assert.match(SIDEBAR, /className="xv-sidebar-rail-bottom mt-auto"/, 'the footer must be pushed down');
});

test('the geometry is asserted where the workspace can actually be reached', () => {
  assert.match(E2E, /dragging the split left did not widen the workspace panel/);
  assert.match(E2E, /dragging the split right did not narrow the panel/);
  assert.match(E2E, /the expanded preview does not span the viewport/);
  // Anchored on the bottom-position check rather than on a link name: the plan link
  // still appears in the spec, inside the assertion that it must NOT be on the rail,
  // so matching its name would pass either way.
  assert.match(E2E, /the account sits near the top of the rail rather than at its foot/);
});
