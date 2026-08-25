import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

/**
 * Guards for the sidebar tips, which were reported as "not showing properly".
 *
 * Two separate defects sat behind that:
 *
 * 1. **Clipped.** The tip was absolutely positioned inside its trigger, and
 *    `.xv-sidebar-floating` is `overflow: hidden`. Every toolbar tip was therefore
 *    sliced off at the sidebar's right edge — text cut mid-word. This is not a
 *    z-index problem: clipping is decided before stacking, so no stacking value can
 *    rescue it. Only leaving the clipping ancestor can.
 *
 * 2. **Stranded.** A click focuses, and a pointer that clicks and then moves away
 *    never fires `mouseleave` on the trigger. The tip opened on focus and stayed open
 *    forever; two could be on screen at once.
 *
 * 3. **Missing.** The two collapsible nav groups were the only rows with no styled
 *    tip at all — they carried a native `title` instead.
 *
 * The clipping rule is modelled below rather than described, because "does an ancestor
 * clip this" is a real geometric question with a real answer.
 */

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const TIP = read('../components/ui/HoverTip.tsx');
const SIDEBAR = read('../components/layout/Sidebar.tsx');

// ---------------------------------------------------------------------------
// Clipping, modelled
// ---------------------------------------------------------------------------

interface Box {
  left: number;
  right: number;
  clips: boolean;
}

/**
 * Whether a tip drawn at [left, right] survives its ancestor chain intact.
 * A clipping ancestor cuts anything outside its own box; a portalled tip has no such
 * ancestors between it and the document, which is the whole point of the change.
 */
function clippedBy(tip: Box, ancestors: Box[]): number | null {
  for (const [index, ancestor] of ancestors.entries()) {
    if (!ancestor.clips) continue;
    if (tip.right > ancestor.right || tip.left < ancestor.left) return index;
  }
  return null;
}

const SIDEBAR_BOX: Box = { left: 0, right: 240, clips: true };
const TIP_BESIDE_SIDEBAR: Box = { left: 191, right: 396, clips: false };

test('a tip inside the sidebar is cut off — this is the reported defect', () => {
  const cut = clippedBy(TIP_BESIDE_SIDEBAR, [SIDEBAR_BOX]);
  assert.equal(cut, 0, 'the model no longer reproduces the clipping sidebar');
});

test('the same tip on the body survives — this is the fix', () => {
  // Portalled: the sidebar is no longer an ancestor, so it cannot clip.
  const cut = clippedBy(TIP_BESIDE_SIDEBAR, [{ left: 0, right: 1440, clips: false }]);
  assert.equal(cut, null);
});

test('a tip is clipped whenever any ancestor clips, however deep', () => {
  // One clipping ancestor anywhere in the chain is enough, which is why "move it out
  // of the chain" is the only reliable fix rather than adjusting one container.
  const chain = [
    { left: 0, right: 1440, clips: false },
    { left: 0, right: 240, clips: true },
    { left: 0, right: 1440, clips: false },
  ];
  assert.equal(clippedBy(TIP_BESIDE_SIDEBAR, chain), 1);
});

// ---------------------------------------------------------------------------
// The component keeps the fix
// ---------------------------------------------------------------------------

test('the tip renders on the body, outside every clipping ancestor', () => {
  assert.match(TIP, /createPortal\(/);
  assert.match(TIP, /document\.body\s*\)/);
  assert.match(TIP, /position: 'fixed'/);
});

test('the tip is positioned from a measured rect, not from a static offset', () => {
  // `fixed` coordinates only stay correct if they are recomputed; a tip pinned to one
  // offset drifts the moment the sidebar scrolls or the window resizes.
  assert.match(TIP, /getBoundingClientRect\(\)/);
  assert.match(TIP, /window\.addEventListener\('scroll', place, true\)/);
  assert.match(TIP, /window\.addEventListener\('resize', place\)/);
  assert.match(TIP, /window\.removeEventListener\('scroll', place, true\)/);
});

test('a tip that would open off-screen is brought back inside the viewport', () => {
  assert.match(TIP, /window\.innerWidth - VIEWPORT_MARGIN/);
  assert.match(TIP, /Math\.max\(VIEWPORT_MARGIN, Math\.min\(/);
});

test('clicking does not strand a tip on screen', () => {
  // `:focus-visible` is the browser's own answer to "was this focus from a keyboard",
  // so keyboard users keep their tip and a mouse click no longer opens one that
  // nothing will ever close.
  assert.match(TIP, /matches\(':focus-visible'\)/);
  assert.match(TIP, /onPointerDown=\{onLeave\}/);
  assert.match(TIP, /onMouseLeave=\{onLeave\}/);
  assert.match(TIP, /onBlur=\{onLeave\}/);
});

// ---------------------------------------------------------------------------
// Every section explains itself
// ---------------------------------------------------------------------------

test('the collapsible nav groups have a styled tip like every other row', () => {
  const groupBranch = SIDEBAR.slice(
    SIDEBAR.indexOf('isGroup(entry) ? ('),
    SIDEBAR.indexOf('xv-nav-group__items'),
  );
  assert.notEqual(groupBranch, '', 'the nav group branch is gone');
  assert.match(groupBranch, /<SidebarTip label=\{entry\.label\} description=\{entry\.tip\}>/);
  // The native tooltip it used to rely on appears after a much longer delay and in the
  // browser's own chrome, so it is not a substitute.
  assert.equal(/title=\{entry\.tip\}/.test(groupBranch), false, 'the native title attribute came back');
});

test('no sidebar entry is left without a description to show', () => {
  // `animated:` sits between `icon` and `tip` on the rows that carry a purpose-built
  // animated glyph, so it has to be optional here — without it this matched only the
  // five rows that do not have one and stopped checking the rest.
  const entries = [
    ...SIDEBAR.matchAll(/label: '([^']+)',\s*\n\s*icon: \w+,\s*\n(?:\s*animated: \w+,\s*\n)?\s*tip: '([^']*)'/g),
  ];
  assert.ok(entries.length >= 11, `expected the nav table, found ${entries.length} entries`);
  for (const [, label, tip] of entries) {
    assert.ok(tip.trim().length > 0, `"${label}" has an empty tip`);
  }
});
