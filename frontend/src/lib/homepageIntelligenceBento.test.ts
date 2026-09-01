import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const COMPONENT = read('../components/homepage/XrogaIntelligenceSection.tsx');
const CSS = read('../styles/homepage-coding.css');

test('the intelligence story is a wide card with two supporting cards', () => {
  assert.match(COMPONENT, /xv-intelligence-bento__grid/);
  assert.equal([...COMPONENT.matchAll(/layout: '(?:wide|standard)'/g)].length, 3);
  assert.equal([...COMPONENT.matchAll(/layout: 'wide'/g)].length, 1);
  assert.match(CSS, /\.xv-home-coding \.xv-intelligence-panel\[data-layout='wide'\][\s\S]*grid-column:\s*1 \/ -1/);
  assert.match(CSS, /\.xv-home-coding \.xv-intelligence-bento__grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2/);
});

test('the generated Xroga visuals are bundled and rendered through next image', () => {
  assert.match(COMPONENT, /from 'next\/image'/);
  const images = [...COMPONENT.matchAll(/image: '(\/homepage\/intelligence\/[^']+)'/g)].map((match) => match[1]);
  assert.equal(images.length, 3);
  assert.equal(new Set(images).size, 3);
  for (const image of images) {
    assert.ok(existsSync(new URL(`../../public${image}`, import.meta.url)), `${image} is missing`);
  }
});

test('the copy describes real Xroga behavior without fabricated outcomes', () => {
  assert.match(COMPONENT, /planning, coding, verification, and handoff/);
  assert.match(COMPONENT, /changed files, checks, blockers, and preview evidence/);
  assert.match(COMPONENT, /only when you authorize the consequential action/);
  assert.doesNotMatch(COMPONENT, /customers|users trust|award-winning|guarantee|\d+%|\$[\d,.]+/i);
});

test('the new panels follow semantic theme surfaces and replace the old five-card markup', () => {
  assert.doesNotMatch(COMPONENT, /xv-intelligence-card--|xv-depth-rail|xv-context-bars|xv-agent-map/);
  const at = CSS.indexOf('.xv-home-coding .xv-intelligence-panel {');
  assert.notEqual(at, -1);
  const body = CSS.slice(CSS.indexOf('{', at) + 1, CSS.indexOf('}', at));
  assert.match(body, /var\(--hc-surface-solid\)/);
  assert.match(body, /var\(--hc-border\)/);
  assert.match(CSS, /body\.theme-black[\s\S]*body\.theme-gray/);
});

test('the phone layout becomes one column without sticky card stacking', () => {
  assert.match(CSS, /@media \(max-width: 700px\)[\s\S]*xv-intelligence-bento__grid[^{]*\{[^}]*grid-template-columns:\s*1fr/);
  assert.doesNotMatch(COMPONENT, /position:\s*sticky|animation-timeline/);
});
