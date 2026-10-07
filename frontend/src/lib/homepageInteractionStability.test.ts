import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const capabilities = read('../components/homepage/HomepageCapabilitiesMosaic.tsx');
const providers = read('../components/providers/RootProviders.tsx');
const clickFeedback = read('../components/ui/PointerClickFeedback.tsx');
const globalCss = read('../app/globals.css');
const capabilitiesCss = read('../styles/homepage-capabilities.css');
const homepageCss = read('../styles/homepage-coding.css');

test('the coding demo changes stages only when the visitor asks it to', () => {
  const workingCard = capabilities.slice(
    capabilities.indexOf('function WorkingCard()'),
    capabilities.indexOf('function EveryoneCard()'),
  );

  assert.doesNotMatch(workingCard, /setInterval|setTimeout|scrollIntoView|scrollTo/);
  assert.match(workingCard, /onChange=\{\(\) => setPhase\(value\)\}/);
  assert.match(capabilitiesCss, /\.xcap-card--working\s*\{[\s\S]*overflow-anchor:none/);
  assert.match(homepageCss, /html:has\(\.xv-home-coding\)[\s\S]*scroll-behavior:\s*auto;[\s\S]*overflow-anchor:\s*none/);
  assert.doesNotMatch(homepageCss, /html:has\(\.xv-home-coding\)\s*\{\s*scroll-behavior:\s*smooth/);
});

test('the native cursor stays visible and only click feedback is animated', () => {
  assert.doesNotMatch(providers, /LightMousePointer|HomepageCursorGlitter/);
  assert.match(providers, /<PointerClickFeedback \/>/);
  assert.doesNotMatch(globalCss, /data-xroga-pointer|cursor:\s*none\s*!important|xv-light-pointer/);
  assert.doesNotMatch(clickFeedback, /pointermove|mousemove/);
  assert.match(clickFeedback, /pointerdown/);
  assert.match(clickFeedback, /feedback\.animate/);
});
