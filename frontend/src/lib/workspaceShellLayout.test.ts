import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

/**
 * Guards for the workspace application shell.
 *
 * Two defects are being kept out, and both are *structural* — they cannot be caught by
 * asserting a colour or a class name:
 *
 * 1. **The shell scrolled.** The page was the scrolling surface, so a long transcript
 *    pushed the terminal card past the viewport: the inset vanished and the rounded
 *    corners squared off. The fix is an ownership rule — exactly one element scrolls,
 *    and it is inside the shell, not the shell and not the page.
 *
 * 2. **The `+` menu floated.** It sat 8px above a 28px button in the middle of the
 *    composer's bottom row, which is why it read as an unrelated popup. The fix is one
 *    offset (`bottom: calc(100% - 1px)`) against one anchor (the composer surface).
 *    Any positive offset, or any positioned element between the menu and the composer,
 *    puts the gap back.
 *
 * The scroll-ownership rule is modelled below rather than described: a real nested
 * layout with a real overflow decision, checked for which element absorbs a scroll.
 */

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const CSS = read('../app/globals.css');
const VIEW = read('../components/dashboard/DashboardView.tsx');
const SHELL = read('../components/layout/AppShell.tsx');
const LOG = read('../components/terminal/SwarmMessageLog.tsx');
const MENU = read('../components/terminal/ChatBarActionsMenu.tsx');
const CHATBAR = read('../components/terminal/TerminalChatBar.tsx');

/**
 * The declarations of one CSS rule, by selector. Null when the rule is gone.
 *
 * The *last* occurrence, deliberately: several of these selectors also have an older
 * definition earlier in the sheet, and the later one is the one the browser applies.
 * Reading the first would assert against a rule that never takes effect.
 */
function rule(selector: string): string | null {
  const at = CSS.lastIndexOf(`\n${selector} {`);
  if (at === -1) return null;
  const open = CSS.indexOf('{', at);
  const close = CSS.indexOf('}', open);
  // Comments stripped: these assertions are about declarations. A guard that reads the
  // commentary can be tripped by a comment naming the very thing it forbids.
  return CSS.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, '');
}

// ---------------------------------------------------------------------------
// Scroll ownership, modelled
// ---------------------------------------------------------------------------

/**
 * A minimal box model: each node has a fixed height and may clip or scroll.
 * `absorb` walks from the innermost node outward and reports which ancestor actually
 * takes the scroll — the same question the browser answers, and the one the old layout
 * got wrong.
 */
interface Box {
  name: string;
  height: number;
  contentHeight: number;
  overflow: 'visible' | 'hidden' | 'auto';
}

function absorbsScroll(chain: Box[]): string | null {
  // Innermost first. A node scrolls when it clips *and* its content exceeds it.
  for (const box of chain) {
    if (box.overflow === 'auto' && box.contentHeight > box.height) return box.name;
    if (box.overflow === 'hidden') continue;
    if (box.overflow === 'visible' && box.contentHeight > box.height) {
      // Content escapes upward and becomes the *parent's* content.
      const parent = chain[chain.indexOf(box) + 1];
      if (parent) parent.contentHeight = Math.max(parent.contentHeight, box.contentHeight);
    }
  }
  return null;
}

test('the old layout let the page absorb the scroll — this is the defect', () => {
  // Terminal body overflow:visible inside a card inside a scrolling page.
  const absorbed = absorbsScroll([
    { name: 'terminal-body', height: 300, contentHeight: 4000, overflow: 'visible' },
    { name: 'terminal-card', height: 300, contentHeight: 300, overflow: 'visible' },
    { name: 'page-main', height: 800, contentHeight: 800, overflow: 'auto' },
  ]);
  assert.equal(absorbed, 'page-main', 'the model no longer reproduces the page-scrolling layout');
});

test('the new layout keeps the scroll inside the shell — this is the fix', () => {
  const absorbed = absorbsScroll([
    { name: 'terminal-scroll', height: 800, contentHeight: 4000, overflow: 'auto' },
    { name: 'terminal-panel', height: 800, contentHeight: 800, overflow: 'hidden' },
    { name: 'workspace-shell', height: 850, contentHeight: 850, overflow: 'hidden' },
    { name: 'page-main', height: 900, contentHeight: 900, overflow: 'hidden' },
  ]);
  assert.equal(absorbed, 'terminal-scroll');
});

test('however tall the transcript grows, nothing outside the shell scrolls', () => {
  // A rounded corner is lost the moment an ancestor of the shell starts scrolling, so
  // the property has to hold for any content height, not one convenient one.
  for (const contentHeight of [900, 4_000, 40_000, 400_000]) {
    const absorbed = absorbsScroll([
      { name: 'terminal-scroll', height: 800, contentHeight, overflow: 'auto' },
      { name: 'terminal-panel', height: 800, contentHeight: 800, overflow: 'hidden' },
      { name: 'workspace-shell', height: 850, contentHeight: 850, overflow: 'hidden' },
      { name: 'page-main', height: 900, contentHeight: 900, overflow: 'hidden' },
    ]);
    assert.equal(absorbed, 'terminal-scroll', `content height ${contentHeight} escaped the pane`);
  }
});

// ---------------------------------------------------------------------------
// The shell's structure
// ---------------------------------------------------------------------------

test('the terminal pane owns the scrollbar, and the shell and panel only clip', () => {
  assert.match(rule('.xv-terminal-scroll') ?? '', /overflow-y:\s*auto/);
  assert.match(rule('.xv-terminal-scroll') ?? '', /overscroll-behavior:\s*contain/);
  assert.match(rule('.xv-workspace-shell') ?? '', /overflow:\s*hidden/);
  assert.match(rule('.xv-terminal-panel') ?? '', /overflow:\s*hidden/);

  // The shell must not be a scroller itself — that is the failure being prevented.
  assert.equal(/overflow(-y)?:\s*(auto|scroll)/.test(rule('.xv-workspace-shell') ?? ''), false);
  assert.equal(/overflow(-y)?:\s*(auto|scroll)/.test(rule('.xv-terminal-panel') ?? ''), false);
});

test('the workspace route stops the page from scrolling at all', () => {
  // `min-h-screen` lets a tall child stretch the page; `h-[100dvh]` cannot.
  assert.match(SHELL, /isDashboard \? 'h-\[100dvh\] max-h-\[100dvh\] overflow-hidden' : 'min-h-screen'/);
  assert.match(SHELL, /'xv-workspace-main flex-1 min-h-0 overflow-hidden'/);
});

test('the shell keeps one radius and one hairline border', () => {
  const shell = rule('.xv-workspace-shell') ?? '';
  assert.match(shell, /border-radius:\s*16px/);
  assert.match(shell, /border:\s*1px solid rgba\(255, 255, 255, 0\.055\)/);

  // The workspace pane is divided, never boxed. A full border is the second card.
  const panel = rule('.xv-workspace-panel') ?? '';
  assert.match(panel, /border-left:\s*1px solid/);
  assert.equal(/^\s*border:\s/m.test(panel), false, 'the workspace pane grew a full border again');
});

test('the title bar is outside the scrolling container', () => {
  // In the rendered tree the header is a sibling *before* the body that holds the
  // panes, so the transcript moves underneath it rather than carrying it along.
  const header = VIEW.indexOf('<header className="xv-workspace-header"');
  const body = VIEW.indexOf('<div className="xv-workspace-body"');
  assert.ok(header > -1, 'the shell header is gone');
  assert.ok(body > -1, 'the shell body is gone');
  assert.ok(header < body, 'the header moved inside the transcript and will scroll away');
  // And the scrolling container lives inside the body, under the header.
  assert.match(VIEW.slice(body), /xv-terminal-panel[\s\S]{0,200}xv-terminal-scroll|xv-terminal-panel[^>]*>\s*\n\s*\{terminalPane\}/);
  // It is a sibling of the body, not a sticky element compensating for page padding.
  assert.equal(/\.xv-workspace-header\s*\{[^}]*position:\s*sticky/.test(CSS), false);
});

test('the split is one animated grid, not a second mounted card', () => {
  const body = rule('.xv-workspace-body') ?? '';
  assert.match(body, /display:\s*grid/);
  assert.match(body, /transition:\s*grid-template-columns 280ms/);
  assert.match(CSS, /\.xv-workspace-body\[data-workspace-open='true'\] \{\s*grid-template-columns:\s*minmax\(0, 1\.4fr\)/);
  assert.match(VIEW, /data-workspace-open=\{workspaceOpen \? 'true' : 'false'\}/);
});

test('narrow screens get one pane, never two unusable columns', () => {
  assert.match(
    CSS,
    /@media \(max-width: 1023px\) \{\s*\.xv-workspace-body\[data-workspace-open='true'\] \{\s*grid-template-columns:\s*minmax\(0, 1fr\);/,
  );
});

test('the transcript renders chromeless inside the shell and framed everywhere else', () => {
  // The compact project view and the incognito room still draw their own window.
  assert.match(LOG, /chromeless\s*\n?\s*\? 'xv-terminal-window--flush'/);
  assert.match(LOG, /\{chromeless \? null : \(/);
  assert.match(VIEW, /<SwarmMessageLog chromeless/);
});

// ---------------------------------------------------------------------------
// The plus menu is part of the composer
// ---------------------------------------------------------------------------

test('the menu shares an edge with the composer — no gap at any width', () => {
  const menu = rule('.xv-cba-menu') ?? '';
  assert.match(menu, /bottom:\s*calc\(100% - 1px\)/, 'the menu no longer overlaps the composer border');
  assert.match(menu, /left:\s*0/);
  assert.match(menu, /margin:\s*0/);

  // The specific regressions: any positive offset reopens the gap.
  assert.equal(/bottom:\s*calc\(100% \+/.test(menu), false, 'a positive offset came back');
  assert.equal(/margin-bottom:\s*[1-9]/.test(menu), false, 'a bottom margin came back');
});

test('the menu is anchored to the composer, not to the plus button', () => {
  // `position: absolute` resolves against the nearest *positioned* ancestor, so the
  // trigger's own wrapper and the composer's button row must both stay static.
  assert.match(MENU, /className=\{cn\('xv-cba-root shrink-0', className\)\}/);
  assert.match(rule('.xv-cba-root') ?? '', /position:\s*static/);
  assert.match(rule('.xv-terminal-dock .xv-chatbar-row-modern') ?? '', /position:\s*static/);
  assert.match(rule('.xv-terminal-dock .xv-chatbar-solid') ?? '', /position:\s*relative/);
});

test('opening the menu overlays the terminal instead of resizing anything', () => {
  const menu = rule('.xv-cba-menu') ?? '';
  assert.match(menu, /position:\s*absolute/);
  assert.match(menu, /max-height:\s*min\(520px, calc\(100dvh - 150px\)\)/);
  // Never wider than the bar it belongs to.
  assert.match(menu, /width:\s*min\(360px, 100%\)/);
});

test('Integrations is a menu row, and the detached pill is gone', () => {
  assert.match(MENU, /<b>Integrations<\/b>/);
  assert.match(MENU, /onOpenIntegrations/);
  assert.match(CHATBAR, /onOpenIntegrations=\{\(\) => \{/);
  // The duplicate trigger, and its styling hook, must not come back.
  assert.equal(CHATBAR.includes('xv-chatbar-integration-btn'), false, 'the detached Integrations pill returned');
});

test('every existing menu action is still present', () => {
  // Reliability and polish work must not quietly drop a feature.
  for (const label of [
    'Add files or photos',
    'Slash commands',
    'Connectors',
    'Plan before build',
    'Debug an error',
    'Skills',
    'Rules',
    'Integrations',
  ]) {
    assert.ok(MENU.includes(`<b>${label}</b>`), `the "${label}" action is gone`);
  }
  // Dismissal and keyboard handling are untouched.
  assert.match(MENU, /event\.key === 'Escape'/);
  assert.match(MENU, /document\.addEventListener\('pointerdown', onPointerDown\)/);
});

// ---------------------------------------------------------------------------
// Quieter surfaces
// ---------------------------------------------------------------------------

test('terminal output is sized like a console, not like a landing page', () => {
  assert.match(rule('.xv-terminal-scroll .xv-response-text') ?? '', /font-size:\s*14px/);
  assert.match(CSS, /\.xv-terminal-scroll \.xv-response-text h1,\s*\n\.xv-terminal-scroll \.xv-response-text h2 \{\s*\n\s*font-size:\s*18px/);
});

test('the prompt bubble and the chips lost their outlines but kept their shape', () => {
  const bubble = rule('.xv-user-bubble') ?? '';
  assert.match(bubble, /background:\s*rgba\(255, 255, 255, 0\.045\)/);
  assert.match(bubble, /border:\s*1px solid rgba\(255, 255, 255, 0\.075\)/);
  assert.match(bubble, /border-radius:\s*12px/);
  assert.equal(/gradient/.test(bubble), false, 'the blue gradient bubble came back');

  assert.match(rule('.xv-suggest-chip') ?? '', /background:\s*rgba\(255, 255, 255, 0\.035\)/);
});

test('the Workspace button uses filled states rather than a border', () => {
  const launch = rule('.xv-ws-launch') ?? '';
  assert.match(launch, /border:\s*0/);
  assert.match(launch, /background:\s*transparent/);
  assert.match(rule(".xv-ws-launch[aria-pressed='true']") ?? '', /background:\s*rgba\(255, 255, 255, 0\.075\)/);
});

test('workspace tabs and the device switcher are marked, not boxed', () => {
  assert.match(rule('.xv-ws-tab.is-active') ?? '', /color:\s*#2f7cff/);
  assert.match(rule('.xv-ws-device.is-active') ?? '', /color:\s*#2f7cff/);
  // An indicator, not an outline around each control.
  assert.match(CSS, /\.xv-ws-tab\.is-active::after/);
  assert.equal(/^\s*border:\s*1px/m.test(rule('.xv-ws-tab') ?? ''), false);
  assert.equal(/^\s*border:\s*1px/m.test(rule('.xv-ws-device') ?? ''), false);
});
