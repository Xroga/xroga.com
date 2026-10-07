import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const page = read('../components/homepage/HomepageClient.tsx');
const stories = read('../components/homepage/HomepagePowerStories.tsx');
const browserEmployees = read('../components/homepage/HomepageBrowserEmployeesExact.tsx');
const css = read('../styles/homepage-power-stories.css');
const homepageCss = read('../styles/homepage-coding.css');

test('the six-part capability story follows browser employees and precedes the workspace tour', () => {
  const browser = page.indexOf('<HomepageBrowserEmployeesExact />');
  const powerStories = page.indexOf('<HomepagePowerStories />');
  const workspace = page.indexOf('<HomepageWorkspaceTour loggedIn={loggedIn} />');
  assert.ok(browser !== -1 && browser < powerStories && powerStories < workspace);
  assert.equal((stories.match(/<StorySection/g) ?? []).length, 5);
  assert.match(stories, /<section className="xps-story xps-story--inputs"/);
});

test('the six sections cover input, research, devices, agents, automation, and verified shipping', () => {
  for (const phrase of [
    'START WITH ANYTHING',
    'RESEARCH WITH RECEIPTS',
    'BUILD FOR EVERY SCREEN',
    'A TEAM BEHIND ONE REQUEST',
    'CONNECT · AUTOMATE · GROW',
    'VERIFY, THEN SHIP',
  ]) {
    assert.ok(stories.includes(phrase), `${phrase} is missing`);
  }
  assert.match(stories, /task graph → sandbox → evidence → tests → browser → review → repair → approval → commit/);
  assert.match(stories, /1,500\+ apps, APIs, and custom MCP connections/);
});

test('the story deck is interactive, responsive, and motion-safe', () => {
  assert.match(stories, /role="tablist"/);
  assert.match(stories, /aria-selected=/);
  assert.match(stories, /prefers-reduced-motion: reduce/);
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /@media \(max-width: 620px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /content-visibility:\s*auto/);
  assert.match(stories, /new IntersectionObserver/);
  assert.match(stories, /observer\.disconnect\(\)/);
  assert.match(stories, /xps-motion-ready/);
  assert.match(css, /\.xps-motion-ready \.xps-story\.is-visible/);
});

test('the redesign is one connected editorial system rather than a stack of dashboard cards', () => {
  assert.match(stories, /Connect the tools you already use/);
  assert.match(stories, /Ask anything in plain words/);
  assert.match(stories, /Hand off the busywork/);
  assert.match(stories, /xps-input-demo__card/);
  assert.match(stories, /CONNECT_APPS\.map/);
  assert.match(stories, /INPUT_EXAMPLES/);
  assert.match(stories, /xps-automation-demo__panels/);
  assert.match(stories, /className="xps-band"/);
  assert.match(css, /\.xps-band\s*\{[\s\S]*background:\s*#050607 !important/);
  assert.match(css, /--xps-black:\s*#080908/);
  assert.match(css, /\.xps-suite\s*\{[\s\S]*width:\s*min\(1180px,[\s\S]*border-radius:\s*0/);
  assert.match(css, /repeating-linear-gradient\([\s\S]*135deg,[\s\S]*rgba\(255,255,255,\.16\)/);
  assert.match(css, /box-shadow:\s*none/);
  assert.match(browserEmployees, /useState\(640\)/);
  assert.match(browserEmployees, /Math\.max\(420, Math\.min\(2600/);
  assert.doesNotMatch(browserEmployees, /Math\.max\(720/);
  assert.match(css, /--xps-signal:\s*#4f8cff/);
  assert.match(css, /\.xps-suite, \.xps-suite \*\s*\{\s*text-shadow:\s*none !important/);
  assert.match(css, /\.xps-story--inputs\s*\{[\s\S]*background:\s*var\(--xps-black\)/);
  assert.match(css, /\.xps-input-demo\s*\{[\s\S]*grid-template-columns:\s*repeat\(3, 1fr\)/);
  assert.match(css, /\.xps-story\s*\{[\s\S]*border-radius:\s*0/);
  assert.match(css, /\.xps-automation-demo__panels\s*\{[\s\S]*grid-template-columns:\s*repeat\(3, 1fr\)/);
  assert.match(css, /\.xps-input-demo__card,[\s\S]*background:\s*#080908/);
  assert.match(css, /\.xps-story::before\s*\{[\s\S]*display:\s*none/);
  for (const theme of ['white', 'beige', 'gray', 'black']) {
    assert.match(homepageCss, new RegExp(`body\\.theme-${theme} \\.xv-home-coding > :not\\(\\.xv-hc-hero\\)`));
  }
  assert.match(homepageCss, /\.xv-home-coding > :not\(\.xv-hc-hero\)\s*\{\s*background-image:\s*none!important/);
  assert.match(css, /body\.theme-white \.xv-home-coding\.xv-homepage\s*\{[\s\S]*background-image:\s*none !important/);
  assert.match(homepageCss, /\.xv-home-coding \.xv-hc-hero > \.xv-hc-bg-image\s*\{[\s\S]*position:\s*absolute!important/);
  assert.doesNotMatch(css, /filter:\s*blur/);
});

test('the supplied premium interaction ideas are adapted into all six native product scenes', () => {
  for (const hook of [
    'xps-mini-browser',
    'xps-lattice-status',
    'xps-compare-surface',
    'xps-device-shell',
    'xps-branch-menu',
    'xps-radio-island',
    'xps-card-swap',
    'xps-code-window',
    'xps-status-mark',
    'xps-repo-button',
  ]) {
    assert.ok(stories.includes(hook), `${hook} is missing`);
    assert.ok(css.includes(`.${hook}`), `${hook} has no styling`);
  }
  assert.match(stories, /Build from GitHub/);
  assert.match(stories, /Compare raw research with the grounded result/);
  assert.match(css, /--xps-signal:\s*#4f8cff/);
  assert.match(css, /\.xps-mini-browser,[\s\S]*border-radius:\s*0/);
});

test('homepage motion is viewport-scoped and no cursor particle canvas competes with scrolling', () => {
  assert.doesNotMatch(page, /HomepageCursorGlitter/);
  assert.match(stories, /suiteInView/);
  assert.match(stories, /document\.hidden/);
  assert.match(stories, /stopTimer\(\)/);
  assert.match(stories, /classList\.toggle\('is-inview'/);
  assert.match(css, /\.xps-motion-ready \.xps-story:not\(\.is-inview\)[\s\S]*animation-play-state:\s*paused !important/);
  assert.doesNotMatch(stories, /gsap|requestAnimationFrame|getUserMedia|<canvas/);
});
