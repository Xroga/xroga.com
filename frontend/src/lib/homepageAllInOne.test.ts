import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const PAGE = read('../components/homepage/HomepageClient.tsx');
const COMPONENT = read('../components/homepage/HomepageAllInOne.tsx');
const CSS = read('../styles/homepage-coding.css');

test('the universal workflow appears directly after the workspace', () => {
  const workspace = PAGE.indexOf('<HomepageWorkspaceTour loggedIn={loggedIn} />');
  const allInOne = PAGE.indexOf('<HomepageAllInOne />');
  const intelligence = PAGE.indexOf('<XrogaIntelligenceSection />');
  assert.ok(workspace !== -1 && workspace < allInOne && allInOne < intelligence);
});

test('the workflow uses varied product scenarios instead of a real-estate special case', () => {
  for (const product of ['SaaS', 'Mobile app', 'API', 'Browser extension', 'Existing repo', 'Automation']) {
    assert.ok(COMPONENT.includes(`category: '${product}'`), `${product} scenario is missing`);
  }
  assert.doesNotMatch(COMPONENT, /Harbourline|property search|mortgage|Dubai|real estate/i);
  assert.match(COMPONENT, /Any product\. One clear path from request to tested result\./);
});

test('the demonstration exposes a complete and honest workflow', () => {
  for (const stage of ['Understand', 'Research', 'Plan', 'Build', 'Verify', 'Ready']) {
    assert.ok(COMPONENT.includes(`name: '${stage}'`), `${stage} stage is missing`);
  }
  assert.match(COMPONENT, /Checks and blockers stay visible/);
  assert.match(COMPONENT, /Plan capacity is shown before work/);
  assert.match(COMPONENT, /External actions require permission/);
  assert.match(COMPONENT, /Illustrative workflow/);
});

test('workflow animation cleans up its timer and respects reduced motion', () => {
  assert.match(COMPONENT, /window\.setInterval/);
  assert.match(COMPONENT, /window\.clearInterval/);
  assert.match(COMPONENT, /prefers-reduced-motion: reduce/);
  assert.match(CSS, /\.xv-home-coding \.xv-uw__workspace/);
  assert.match(CSS, /@keyframes xv-uw-enter/);
  assert.match(CSS, /prefers-reduced-motion: reduce[\s\S]*\.xv-home-coding \.xv-uw__workspace/);
});

test('all hero themes share rails, glass controls, and a moving category strip', () => {
  assert.match(CSS, /body:not\(\.theme-black\) \.xv-home-coding \.xv-hc-hero::before/);
  assert.match(CSS, /body:not\(\.theme-black\) \.xv-home-coding \.xv-hc-hero-actions a[\s\S]*backdrop-filter/);
  assert.match(PAGE, /xv-hc-category-track/);
  assert.match(PAGE, /Browser extensions/);
  assert.match(PAGE, /Data pipelines/);
  assert.match(CSS, /@keyframes xv-category-marquee/);
  assert.match(CSS, /animation: xv-category-marquee 34s linear infinite/);
  assert.match(CSS, /xv-hc-category-group\[aria-hidden='true'\]/);
});

test('the section remains in the homepage typography and theme system', () => {
  assert.match(COMPONENT, /What can you build <em>with Xroga\?<\/em>/);
  assert.doesNotMatch(COMPONENT, /style=\{\{/);
  assert.match(CSS, /\.xv-home-coding \.xv-uw/);
  assert.match(CSS, /font-family: var\(--hc-font-serif\)/);
  assert.match(CSS, /var\(--hc-surface-solid\)/);
});
