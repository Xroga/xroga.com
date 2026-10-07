import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const page = read('../components/homepage/HomepageClient.tsx');
const stories = read('../components/homepage/HomepagePowerStories.tsx');
const css = read('../styles/homepage-power-stories.css');

test('the six-part capability story follows browser employees and precedes the workspace tour', () => {
  const browser = page.indexOf('<HomepageBrowserEmployeesExact />');
  const powerStories = page.indexOf('<HomepagePowerStories />');
  const workspace = page.indexOf('<HomepageWorkspaceTour loggedIn={loggedIn} />');
  assert.ok(browser !== -1 && browser < powerStories && powerStories < workspace);
  assert.equal((stories.match(/<StorySection/g) ?? []).length, 6);
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
});

test('the redesign is one connected editorial system rather than a stack of dashboard cards', () => {
  assert.match(stories, /Connect the tools you already use/);
  assert.match(stories, /Ask anything in plain words/);
  assert.match(stories, /Hand off the busywork/);
  assert.match(stories, /xps-input-demo__frame/);
  assert.match(stories, /xps-automation-demo__panels/);
  assert.match(css, /--xps-black:\s*#080908/);
  assert.match(css, /\.xps-story\s*\{[\s\S]*border-radius:\s*0/);
  assert.match(css, /\.xps-automation-demo__panels\s*\{[\s\S]*grid-template-columns:\s*repeat\(3, 1fr\)/);
});
