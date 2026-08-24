import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

/**
 * Guards for the sidebar's edge controls.
 *
 * **One control per job.** The toggle briefly persisted while collapsed, so the rail
 * would have an expand control of its own — but the rail already carried a PanelLeft
 * button for exactly that, and the collapsed state ended up showing both, a few pixels
 * apart, doing the same thing. Both are gone now: the mark reopens the rail on hover,
 * and the toggle only ever closes.
 *
 * Hover reaches a mouse and nothing else, so the same handler runs on focus — the mark
 * is a link and already in the tab order. It is delayed and cancellable because opening
 * on the first pixel of hover fires whenever a pointer crosses the rail on its way
 * somewhere else, and a sidebar that expands under a passing cursor shoves the
 * workspace sideways.
 *
 * **The toggle ate the resize gesture.** It is centred on the same edge the resize
 * handle runs down and paints above it, so a press at the midpoint — the most natural
 * place to grab an edge — landed on the button. The drag never reached the handle,
 * and the pointerup landed away from the button so no click fired either. Measured on
 * the previous release: a 130px drag from the midpoint moved the sidebar from 248px
 * to 248px, while the same drag 150px lower moved it to 358px.
 *
 * The behaviour itself is measured in `e2e/command3-auth.spec.ts`, which can reach
 * the authenticated workspace. These guard the decisions that produce it.
 */

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const SIDEBAR = read('../components/layout/Sidebar.tsx');
const CSS = read('../app/globals.css');
const E2E = read('../../e2e/command3-auth.spec.ts');

/** Source with comments stripped, so prose about a rule cannot satisfy a search for it. */
const code = SIDEBAR.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

test('the edge toggle closes only, because the mark reopens', () => {
  /*
   * Reversed deliberately. The toggle used to persist while collapsed so the rail had
   * an expand control of its own — but the rail already carried a PanelLeft button for
   * that, so the collapsed state ended up with two controls a few pixels apart doing
   * the same thing. Both are gone now; hovering the mark expands the rail instead.
   */
  assert.match(code, /\{effectiveSidebarOpen \? <button/, 'the toggle must not render while collapsed');
  assert.match(code, /aria-label="Close sidebar"/, 'it only ever closes now');
  assert.ok(!/PanelLeftOpen/.test(code), 'the open glyph belongs to a state this no longer has');
  // And the rail's own duplicate is gone with it.
  const rail = code.slice(code.indexOf('xv-sidebar-collapsed-actions'));
  assert.ok(!/aria-label="Open sidebar"/.test(rail.slice(0, 900)), 'the rail button is back');
});

test('hovering the mark expands the rail', () => {
  assert.match(code, /onMouseEnter=\{openSidebarOnHover\}/, 'the mark must open on hover');
  assert.match(code, /onMouseLeave=\{cancelSidebarHover\}/, 'leaving must cancel a pending open');
  // Hover reaches a mouse and nothing else. The mark is a link and already in the tab
  // order, so the same handler on focus keeps the rail usable from the keyboard.
  assert.match(code, /onFocus=\{openSidebarOnHover\}/, 'the keyboard needs the same route in');
  assert.match(code, /onBlur=\{cancelSidebarHover\}/);

  // Delayed and cancellable: opening on the first pixel would fire whenever the pointer
  // crossed the rail on its way elsewhere, shoving the workspace sideways.
  assert.match(code, /HOVER_OPEN_DELAY_MS/, 'an undelayed hover opens on a passing cursor');
  const delay = Number(/const HOVER_OPEN_DELAY_MS = (\d+)/.exec(code)?.[1]);
  assert.ok(delay >= 100 && delay <= 500, `the delay (${delay}ms) should be a pause, not a wait`);
  assert.match(code, /if \(effectiveSidebarOpen \|\| terminalFullscreen\) return;/, 'it must be a no-op when open');
  // A pending timer must not fire into an unmounted sidebar.
  assert.match(code, /clearTimeout\(hoverOpenTimerRef\.current\)/, 'the timer must be cleared');
});

test('the rail carries the two destinations people actually go to', () => {
  const rail = code.slice(code.indexOf('xv-sidebar-collapsed-actions'));
  const block = rail.slice(0, rail.indexOf('</div>'));
  assert.match(block, /href="\/dashboard"[\s\S]{0,80}aria-label="Dashboard"/, 'Dashboard should be on the rail');
  assert.match(block, /href="\/dashboard\/projects"[\s\S]{0,80}aria-label="Repositories"/, 'Repositories should be on the rail');
});

test('the page header does not repeat the sidebar mark', () => {
  // From `lg` up the sidebar is on screen and carries the mark, so the header logo was
  // a second Xroga a few hundred pixels from the first. Hidden rather than removed:
  // below `lg` the sidebar is a drawer and this is the only branding on the page.
  const SHELL = read('../components/layout/AppShell.tsx');
  assert.match(SHELL, /xv-mobile-header-logo min-w-0 lg:hidden/, 'the header logo must stand down on desktop');
});

test('the collapsed styling can actually match something', () => {
  // These rules were written for a persistent button. With the old gate they styled
  // an element that never existed while `.is-collapsed` was set.
  const sheet = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(
    sheet.includes('.xv-sidebar-root.is-collapsed .xv-sidebar-edge-toggle'),
    'the collapsed toggle has no styling',
  );
});

test('a drag on the toggle resizes instead of doing nothing', () => {
  assert.match(code, /onPointerDown=\{startEdgeToggleDrag\}/, 'the toggle must accept a drag');
  // Shared with the handle, so both paths move the sidebar the same way.
  assert.match(code, /function beginResize\(startX: number\)/, 'the resize needs a shared entry point');
  assert.match(code, /beginResize\(e\.clientX\)/, 'the handle must use the shared resize');
  assert.match(code, /beginResize\(startX\)/, 'the toggle must hand off to the shared resize');

  // Threshold, so an ordinary click is not read as a drag.
  assert.match(code, /EDGE_DRAG_THRESHOLD_PX/, 'a bare pointermove would swallow every click');
  const threshold = Number(/const EDGE_DRAG_THRESHOLD_PX = (\d+)/.exec(code)?.[1]);
  assert.ok(threshold > 0 && threshold < 20, `the threshold (${threshold}px) should be small but non-zero`);

  // And the click that follows a drag must not also collapse the sidebar.
  assert.match(code, /if \(edgeToggleDraggedRef\.current\)/, 'a drag must swallow the click that follows');
});

test('the collapsed rail has no width to drag', () => {
  // Resizing a 64px icon rail has nothing to act on, and the handle is not rendered
  // there — so the toggle must not start a resize either.
  const at = code.indexOf('function startEdgeToggleDrag');
  assert.notEqual(at, -1);
  const body = code.slice(at, code.indexOf('\n  }', at));
  assert.match(body, /if \(!effectiveSidebarOpen\) return;/, 'a collapsed rail must not start a resize');
});

test('the behaviour is asserted where the workspace can be reached', () => {
  assert.match(E2E, /the collapsed rail still carries a sidebar toggle/);
  assert.match(E2E, /hovering the mark did not reopen the sidebar/);
  assert.match(E2E, /dragging from the toggle did not widen the sidebar/);
  // The fullscreen frame is geometry, so it is measured there rather than read off the
  // stylesheet — the stylesheet is exactly what hid the duplicate-rule bug.
  assert.match(E2E, /the terminal runs to the right edge instead of keeping its frame/);
  assert.match(E2E, /the terminal is squared off in fullscreen/);
});

test('fullscreen keeps the frame instead of giving it up', () => {
  /*
   * Fullscreen used to set `padding: 0` and square off the shell, so the terminal ran
   * edge to edge and its corners met the browser chrome.
   *
   * Declared exactly once. There were two `.xv-app-stage--fullscreen` rules for the
   * same property at equal specificity, and the later one silently won — so a rule that
   * appeared to give the state its padding back did nothing at all. Measured after the
   * fix: 14px above, right and below, and the shell keeps a 16px radius.
   */
  const sheet = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = sheet.match(/\.xv-app-stage--fullscreen\s*\{[^}]*padding[^}]*\}/g) ?? [];
  assert.equal(rules.length, 1, `${rules.length} rules set the fullscreen stage padding`);
  assert.match(rules[0], /padding:\s*var\(--xv-app-gutter\)/, 'fullscreen must keep the gutter');
  // And nothing squares the shell off again.
  assert.ok(
    !/\.xv-app-stage--fullscreen\s+\.xv-workspace-shell\s*\{[^}]*border-radius:\s*0/.test(sheet),
    'fullscreen flattens the shell again',
  );
});

test('the fullscreen composer is bounded and sits inside the terminal', () => {
  const DOCK = read('../components/terminal/TerminalDock.tsx');
  // `max-w-none` stretched the composer across the whole screen.
  assert.ok(!/dashboardFullscreen\s*\n?\s*[\s\S]{0,200}?w-full max-w-none/.test(DOCK), 'the composer is unbounded again');
  assert.match(DOCK, /\? 'max-w-3xl px-2 sm:px-4'/, 'the fullscreen composer needs a width cap');

  const sheet = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  // Inset on both edges so it stops where the terminal's rounded box stops.
  assert.match(sheet, /left: calc\(var\(--xv-fullscreen-rail, 64px\) \+ 14px\) !important/);
  assert.match(sheet, /right: 14px !important/);
  // The gradient painted --background over the terminal's own surface.
  const dockFs = sheet.slice(sheet.indexOf('.xv-terminal-dock--fullscreen {'));
  assert.match(dockFs.slice(0, 260), /background: none/, 'the composer still paints a slab');
});
