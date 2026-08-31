import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const RAIL = read('../components/terminal/ChatTurnRail.tsx');
const CSS = read('../app/globals.css').replace(/\/\*[\s\S]*?\*\//g, '');
const HOMEPAGE_CSS = read('../styles/homepage-coding.css').replace(/\/\*[\s\S]*?\*\//g, '');

test('conversation navigation keeps its large click targets mounted while the flyout opens', () => {
  const flyout = RAIL.indexOf('{expanded ? (');
  const collapsed = RAIL.indexOf('className="xv-chat-turn-collapsed');

  assert.ok(flyout !== -1 && collapsed > flyout, 'the permanent rail should follow the optional flyout');
  assert.match(RAIL, /\) : null\}\s*<div className="xv-chat-turn-collapsed/);
  assert.match(RAIL, /aria-label="Jump to previous prompt"/);
  assert.match(RAIL, /aria-label="Jump to next prompt"/);
  assert.match(RAIL, /onClick=\{\(\) => jumpRelative\(-1\)\}/);
  assert.match(RAIL, /onClick=\{\(\) => jumpRelative\(1\)\}/);
  assert.match(CSS, /\.xv-chat-turn-tick\s*\{[^}]*width:\s*34px[^}]*height:\s*18px/);
  assert.match(CSS, /\.xv-chat-turn-flyout\s*\{[^}]*position:\s*absolute[^}]*right:\s*calc\(100% \+ \.7rem\)/);
  assert.match(CSS, /\.xv-chat-turn-track::before\s*\{[\s\S]*?repeating-linear-gradient/);
});

test('mobile intelligence cards form a reversible sticky scroll deck', () => {
  assert.match(HOMEPAGE_CSS, /@media\(max-width:600px\)/);
  assert.match(HOMEPAGE_CSS, /\.xv-intelligence__grid\{display:block;padding-bottom:8svh\}/);
  assert.match(HOMEPAGE_CSS, /position:sticky;top:calc\(4\.5rem \+ var\(--xv-stack-index\) \* \.48rem\)/);
  for (const index of [2, 3, 4, 5]) {
    assert.match(HOMEPAGE_CSS, new RegExp(`\\.xv-intelligence-card:nth-child\\(${index}\\)\\{--xv-stack-index:${index - 1}`));
  }
  assert.match(HOMEPAGE_CSS, /animation-timeline:view\(\)/);
  assert.match(HOMEPAGE_CSS, /animation-range:entry 0% entry 70%/);
});
