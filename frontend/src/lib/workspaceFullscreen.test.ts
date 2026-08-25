import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

/**
 * Guards for terminal fullscreen and the composer's plus menu.
 *
 * **Fullscreen did not fill the screen.** The sidebar was hidden with
 * `visibility: hidden`, which stops an element painting but leaves its width in the
 * layout. `.xv-sidebar-root` is a flex sibling of the stage, so the terminal went on
 * starting after a band of empty page as wide as whatever the user had dragged the
 * sidebar to. Nothing was oversized — the space was reserved for something
 * invisible, which is why it looked like a sizing bug in the terminal.
 *
 * The fix collapses the sidebar to its icon rail instead of hiding it, which also
 * keeps the logo, sidebar toggle, search and new-terminal buttons reachable without
 * leaving fullscreen. `sidebarOpen` itself is untouched, so exiting restores the
 * width the user chose rather than stranding them in the rail.
 *
 * **The plus menu was one tall column**, standing about three times its own width,
 * which reads as a page rather than a menu. It pairs off into two columns from `sm`
 * up, with separators and the long Integrations row spanning the full width.
 *
 * The geometry itself is asserted in `e2e/command3-auth.spec.ts`, which can reach
 * the authenticated workspace. These guard the decisions that produce it.
 */

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const SIDEBAR = read('../components/layout/Sidebar.tsx');
const MENU = read('../components/terminal/ChatBarActionsMenu.tsx');
const CSS = read('../app/globals.css');
const E2E = read('../../e2e/command3-auth.spec.ts');

/** CSS with comments stripped, so prose about a rule cannot satisfy a search for it. */
const code = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

test('fullscreen hides the sidebar without reserving its width', () => {
  /*
   * Reversed deliberately, and asked for twice: fullscreen shows the terminal and its
   * composer and nothing else, where it used to keep a 64px rail of shortcuts.
   *
   * How it hides still matters, and is the older half of this guard. `visibility:
   * hidden` keeps the element's width, so the terminal would gain the rail's shortcuts
   * back as a band of empty page — the original fullscreen bug. It must be removed from
   * layout outright.
   */
  const at = code.indexOf('body.xv-terminal-fullscreen-active .xv-sidebar-root');
  assert.notEqual(at, -1, 'the sidebar is not hidden in fullscreen');
  const block = code.slice(at, code.indexOf('}', at));
  assert.match(block, /display: none !important/, 'a hidden sidebar still reserves its width');

  /*
   * Page fullscreen is a different feature and hides it too — and now hides it the
   * same way. It used to name `aside.xv-sidebar-hover` and use `visibility`, which
   * is both halves of the bug above: a state class the sidebar does not normally
   * carry, so the sidebar stayed; and `visibility`, so even when it matched it kept
   * its width. The bottom bar and the mobile header go with it, because on a phone
   * those are the whole of the chrome.
   */
  const pageAt = code.indexOf('body.xv-page-fullscreen-active .xv-sidebar-root');
  assert.notEqual(pageAt, -1, 'page fullscreen should still hide the sidebar');
  const pageRule = code.slice(pageAt, code.indexOf('}', pageAt));
  for (const selector of ['.xv-mobile-workspace-header', '.xv-mobile-nav']) {
    assert.ok(
      pageRule.includes(`body.xv-page-fullscreen-active ${selector}`),
      `${selector} survives page fullscreen`,
    );
  }
  assert.match(pageRule, /display: none !important/, 'page fullscreen only hides, so the chrome keeps its space');
  // The store is still driven to the collapsed state, so leaving fullscreen does not
  // flash an expanded sidebar before the rule stops applying.
  assert.match(
    SIDEBAR,
    /const effectiveSidebarOpen = \(hydrated \? sidebarOpen : true\) && !terminalFullscreen;/,
    'fullscreen must still drive the sidebar closed',
  );
});

test('exiting fullscreen gives back the width the user chose', () => {
  // Collapsing must not write to the stored preference, or the user's own width is
  // lost the first time they use fullscreen.
  const at = SIDEBAR.indexOf('const effectiveSidebarOpen');
  const after = SIDEBAR.slice(at, at + 600);
  assert.ok(
    !/setSidebarOpen|toggleSidebar\(\)/.test(after),
    'fullscreen must not mutate the stored sidebar preference',
  );
});

test('the composer stops where the terminal does', () => {
  const at = code.indexOf('body.xv-terminal-fullscreen-active .xv-terminal-dock');
  assert.notEqual(at, -1, 'the dock has no fullscreen rule');
  const block = code.slice(at, at + 700);
  /*
   * No rail term any more. The offset used to be `rail + gutter` because a 64px rail
   * stood between the window edge and the terminal; fullscreen hides the sidebar
   * outright now, so the composer starts at the frame's gutter like the terminal above
   * it. Leaving the rail in the sum would have indented the composer past the terminal
   * it belongs to.
   */
  assert.ok(!/--xv-fullscreen-rail/.test(block), 'the composer is offset by a rail that is gone');
  assert.match(block, /left: 14px !important/, 'the composer must start at the gutter');
  assert.match(block, /right: 14px !important/, 'and stop at it');
});

test('the plus menu lays out in two columns', () => {
  assert.match(MENU, /className="xv-cba-grid"/, 'the root list needs the grid wrapper');
  const at = code.indexOf('.xv-cba-grid {');
  assert.notEqual(at, -1, 'the grid has no styles');

  const media = code.indexOf('@media (min-width: 640px)', at);
  const block = code.slice(media, media + 500);
  assert.match(block, /grid-template-columns:\s*1fr 1fr/, 'two columns from sm up');
  // A separator confined to one column divides half a list, which is not what the
  // layout means; the long Integrations row wraps to three lines in half a row.
  assert.match(block, /\.xv-cba-grid > \.xv-cba-sep[\s\S]{0,120}grid-column:\s*1 \/ -1/, 'separators span the grid');
  assert.match(MENU, /xv-cba-item xv-cba-item--wide/, 'the long row should span both columns');

  // One column is the fallback, not the default the media query overrides.
  const base = code.slice(at, code.indexOf('}', at));
  assert.match(base, /grid-template-columns:\s*1fr/, 'a narrow composer keeps one column');
});

test('only the root list is a grid', () => {
  // Skills and Rules are toggles in a set rather than independent destinations, and
  // reading them across two columns would break that.
  const gridOpen = MENU.indexOf('<div className="xv-cba-grid">');
  const skills = MENU.indexOf("panel === 'skills'");
  assert.ok(gridOpen !== -1 && skills > gridOpen, 'the sub-panels must sit outside the grid');
  assert.equal(
    (MENU.match(/className="xv-cba-grid"/g) ?? []).length,
    1,
    'there should be exactly one grid, around the root list',
  );
});

test('the geometry is asserted where the workspace can actually be reached', () => {
  // These decisions only matter if something measures the result. The workspace is
  // behind auth, so that check lives in the authenticated browser spec.
  // Re-anchored: fullscreen no longer runs the terminal edge to edge. It keeps the
  // frame's gutter, so the spec now bounds that inset on both sides rather than
  // requiring it to be zero.
  assert.match(E2E, /more than the gutter is reserved to the left of the terminal/);
  // Re-anchored: fullscreen removes the sidebar now rather than collapsing it to a rail.
  assert.match(E2E, /the sidebar is still on screen in fullscreen/);
  assert.match(E2E, /the hidden sidebar still reserves its width/);
  assert.match(E2E, /the sidebar did not reopen after fullscreen/);
  assert.match(E2E, /the plus menu should lay out in two columns/);
});
