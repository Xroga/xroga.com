import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const DOCK = read('../components/terminal/TerminalDock.tsx');
const REPO = read('../components/terminal/RepoContextBar.tsx');
const COMPANION = read('../components/companion/CompanionSurfaces.tsx');
const CHATBAR = read('../components/terminal/TerminalChatBar.tsx');
const COMPANION_RUNTIME = read('../components/companion/XrogaCompanion.tsx');
const GLOBALS = read('../app/globals.css').replace(/\/\*[\s\S]*?\*\//g, '');
const COMPANION_CSS = read('../styles/companion.css').replace(/\/\*[\s\S]*?\*\//g, '');

function rule(css: string, selector: string): string {
  const start = css.indexOf(selector);
  assert.notEqual(start, -1, `${selector} is missing`);
  return css.slice(start, css.indexOf('}', start) + 1);
}

test('Black Hole V sits beside the primary composer action, not the repo strip or character', () => {
  const strip = DOCK.slice(DOCK.indexOf('xv-chatbar-context-strip'), DOCK.indexOf('</div>', DOCK.indexOf('xv-chatbar-context-strip')));
  assert.doesNotMatch(strip, /BlackHoleVButton/, 'Black Hole V still creates a wide gap in the repo row');
  assert.doesNotMatch(COMPANION, /BlackHoleVButton/);
  assert.match(CHATBAR, /<ChatBarActionsMenu[\s\S]*<BlackHoleVButton compact className="xv-companion-blackhole" \/>/);
  assert.doesNotMatch(COMPANION, /xv-companion-composer-label|>Smoky</, 'the companion name is still printed over the workspace');
  assert.doesNotMatch(COMPANION_RUNTIME, /message:\s*'Smoky\b/, 'the workspace status still exposes the companion name');
});

test('the compact repo control hugs its content on desktop and uses a solid theme surface', () => {
  const classes = /\? '([^']*xv-repo-chip--compact[^']*)'/.exec(REPO)?.[1].split(/\s+/) ?? [];
  assert.ok(!classes.includes('w-full'), 'the repo row still forces full width');
  assert.match(rule(GLOBALS, '.xv-chatbar-context-strip > :first-child'), /flex:\s*0 1 auto/);
  assert.match(rule(GLOBALS, '.xv-repo-chip--compact .xv-repo-identity'), /flex:\s*0 1 auto/);
  const compact = rule(GLOBALS, '.xv-repo-chip--compact {');
  assert.match(compact, /width:\s*max-content/);
  assert.match(compact, /background:\s*var\(--terminal-ui-inset, var\(--surface-inset\)\)/, 'the compact row is transparent again');
  assert.match(compact, /border:\s*0/, 'the repo strip regained an outline');
  assert.match(compact, /box-shadow:\s*none/, 'the repo strip regained a floating edge');
});

test('mobile keeps the repo and branch compact while the menu owns new repository actions', () => {
  assert.doesNotMatch(REPO, /Pick to update|New product<\/span>/);
  assert.match(REPO, /\+ New repository/);
  assert.match(REPO, /selectRepo\(r\.fullName\)/);
  assert.match(REPO, /selectBranch\(b\)/);
  const mobile = GLOBALS.slice(GLOBALS.indexOf('@media (max-width: 560px)'));
  assert.match(mobile, /\.xv-repo-chip--compact\s*\{[^}]*width:\s*max-content/);
  assert.match(mobile, /\.xv-repo-chip--compact \.xv-repo-branch\s*\{[^}]*display:\s*block/);
});

test('switching a connected repository during a conversation starts a fresh task', () => {
  assert.match(REPO, /if \(messages\.length > 0 \|\| \(previousKey && previousKey !== targetKey\)\)\s*\{\s*startNewChat\(\)/);
  assert.match(REPO, /saveSelectedRepoContext\(\{ repo: fullName, branch \}\)/);
  assert.match(REPO, /notifyGithubRepoContext\(fullName, branch\)/);
  assert.match(REPO, /if \(changesContext\) startNewChat\(\)/);
  assert.match(REPO, /markFreshTerminalIntent\(\);[\s\S]*clearSelectedRepoContext\(\)/);
});

test('the external companion and compact Black Hole control stay readable', () => {
  const chip = rule(COMPANION_CSS, '.xv-companion-blackhole > button {');
  assert.match(chip, /background:\s*transparent/);
  assert.match(chip, /border:\s*0/);
  assert.match(chip, /box-shadow:\s*none/);
  assert.match(chip, /font-size:\s*\.68rem/);
  const anchor = rule(COMPANION_CSS, '.xv-companion-composer-anchor {');
  assert.match(anchor, /position:\s*absolute/);
  assert.match(anchor, /z-index:\s*20/);
  assert.match(anchor, /bottom:\s*calc\(100%/);
  const mobile = COMPANION_CSS.slice(COMPANION_CSS.indexOf('@media (max-width: 640px)'));
  assert.match(mobile, /\.xv-companion--composer \.xv-companion-trigger\s*\{[^}]*width:\s*3\.45rem/);
  assert.match(mobile, /\.xv-companion-blackhole > button\s*\{[^}]*font-size:\s*\.6rem/);
});

test('Smoky usage escapes workspace clipping in a compact foreground portal', () => {
  assert.match(COMPANION_RUNTIME, /createPortal\([\s\S]*document\.body/);
  assert.match(COMPANION_RUNTIME, /position:\s*'fixed'/);
  assert.match(COMPANION_RUNTIME, /zIndex:\s*1200/);
  const usage = rule(COMPANION_CSS, '.xv-companion-usage {');
  assert.match(usage, /position:\s*fixed/);
  assert.match(usage, /width:\s*236px/);
  assert.match(usage, /z-index:\s*1200/);
});
