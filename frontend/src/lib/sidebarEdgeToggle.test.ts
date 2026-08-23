import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

/**
 * Guards for the sidebar's edge controls.
 *
 * **The edge control moved when you used it.** The toggle was rendered inside
 * `{effectiveSidebarOpen ? … : null}`, so it deleted itself the moment it was used
 * and clicking the same spot again did nothing. The sidebar was still reopenable —
 * the collapsed rail carries its own 28×28 expand button, measured working — but the
 * affordance the user had just pressed was gone from the edge, which is what "the
 * close button doesn't work" looks like from the outside.
 *
 * Two things in the tree already assumed a button that persists: the label reads
 * `effectiveSidebarOpen ? 'Close sidebar' : 'Open sidebar'`, and globals.css carries
 * three `.is-collapsed .xv-sidebar-edge-toggle` rules that could never match.
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

test('the edge toggle survives being used', () => {
  const at = code.indexOf('xv-sidebar-edge-toggle');
  assert.notEqual(at, -1, 'the edge toggle is gone');

  // Walk back to the start of the element and check nothing gates it on the open
  // state. A conditional here is the bug: the control that closes the sidebar would
  // be removed by closing it.
  const start = code.lastIndexOf('<button', at);
  assert.notEqual(start, -1, 'the toggle is no longer a button');
  const preceding = code.slice(Math.max(0, start - 220), start);
  assert.ok(
    !/effectiveSidebarOpen \?\s*$/.test(preceding.trimEnd() + ''),
    'the edge toggle is gated on the sidebar being open again',
  );
  assert.ok(
    !/\{effectiveSidebarOpen \? <button/.test(code),
    'the edge toggle is gated on the sidebar being open again',
  );
});

test('the toggle says and shows which direction it goes', () => {
  assert.match(
    code,
    /aria-label=\{effectiveSidebarOpen \? 'Close sidebar' : 'Open sidebar'\}/,
    'the label must name both states',
  );
  // A close glyph on a collapsed rail points the wrong way.
  assert.match(code, /PanelLeftOpen/, 'the collapsed state needs its own glyph');
  assert.match(code, /effectiveSidebarOpen\s*\?\s*<PanelLeftClose/, 'the glyph must follow the state');
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
  assert.match(E2E, /the sidebar could not be reopened from the edge/);
  assert.match(E2E, /dragging from the toggle did not widen the sidebar/);
});
