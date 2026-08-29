import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const DOCK = read('../components/terminal/TerminalDock.tsx');
const REPO = read('../components/terminal/RepoContextBar.tsx');
const COMPANION = read('../components/companion/CompanionSurfaces.tsx');
const COMPANION_RUNTIME = read('../components/companion/XrogaCompanion.tsx');
const GLOBALS = read('../app/globals.css').replace(/\/\*[\s\S]*?\*\//g, '');
const COMPANION_CSS = read('../styles/companion.css').replace(/\/\*[\s\S]*?\*\//g, '');

function rule(css: string, selector: string): string {
  const start = css.indexOf(selector);
  assert.notEqual(start, -1, `${selector} is missing`);
  return css.slice(start, css.indexOf('}', start) + 1);
}

test('Black Hole V is attached to the composer companion, not the repo strip', () => {
  const strip = DOCK.slice(DOCK.indexOf('xv-chatbar-context-strip'), DOCK.indexOf('</div>', DOCK.indexOf('xv-chatbar-context-strip')));
  assert.doesNotMatch(strip, /BlackHoleVButton/, 'Black Hole V still creates a wide gap in the repo row');
  assert.match(COMPANION, /<XrogaCompanion variant="composer" \/>[\s\S]*<BlackHoleVButton compact className="xv-companion-blackhole" \/>/);
  assert.doesNotMatch(COMPANION, /xv-companion-composer-label|>Smoky</, 'the companion name is still printed over the workspace');
  assert.doesNotMatch(COMPANION_RUNTIME, /message:\s*'Smoky\b/, 'the workspace status still exposes the companion name');
});

test('the compact repo control hugs its content on desktop and uses a solid theme surface', () => {
  const classes = /\? '([^']*xv-repo-chip--compact[^']*)'/.exec(REPO)?.[1].split(/\s+/) ?? [];
  assert.ok(!classes.includes('w-full'), 'the repo row still forces full width');
  assert.match(rule(GLOBALS, '.xv-chatbar-context-strip > :first-child'), /flex:\s*0 1 auto/);
  assert.match(rule(GLOBALS, '.xv-repo-chip--compact .xv-repo-identity'), /flex:\s*0 1 auto/);
  const compact = rule(GLOBALS, '.xv-repo-chip--compact {');
  assert.match(compact, /width:\s*auto/);
  assert.match(compact, /background:\s*var\(--card\)/, 'the compact row is transparent again');
});

test('mobile keeps clear short actions, repository, and branch in one compact row', () => {
  assert.match(REPO, /xv-repo-intent-label-short/);
  assert.match(REPO, /aria-label=\{selectedRepo \? 'Update current' : 'Pick to update'\}/);
  const mobile = GLOBALS.slice(GLOBALS.indexOf('@media (max-width: 560px)'));
  assert.match(mobile, /\.xv-repo-chip--compact\s*\{[^}]*width:\s*100%/);
  assert.match(mobile, /\.xv-repo-intent-label-full\s*\{\s*display:\s*none/);
  assert.match(mobile, /\.xv-repo-intent-label-short\s*\{\s*display:\s*inline/);
  assert.match(mobile, /\.xv-repo-chip--compact \.xv-repo-branch\s*\{[^}]*display:\s*block/);
});

test('the companion cluster keeps Black Hole V as a tiny caption below the character', () => {
  const chip = rule(COMPANION_CSS, '.xv-companion-blackhole > button {');
  assert.match(chip, /background:\s*transparent/);
  assert.match(chip, /border:\s*0/);
  assert.match(chip, /box-shadow:\s*none/);
  assert.match(chip, /font-size:\s*\.48rem/);
  const anchor = rule(COMPANION_CSS, '.xv-companion-composer-anchor {');
  assert.match(anchor, /bottom:\s*calc\(100% - \.3rem\)/);
  assert.match(anchor, /z-index:\s*340/);
  assert.match(anchor, /flex-direction:\s*column/);
  const mobile = COMPANION_CSS.slice(COMPANION_CSS.indexOf('@media (max-width: 640px)'));
  assert.match(mobile, /\.xv-companion--composer \.xv-companion-trigger\s*\{[^}]*width:\s*2\.75rem/);
  assert.match(mobile, /\.xv-companion-blackhole > button\s*\{[^}]*font-size:\s*\.44rem/);
});
