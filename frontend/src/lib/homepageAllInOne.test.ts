import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const PAGE = read('../app/page.tsx');
const COMPONENT = read('../components/homepage/HomepageAllInOne.tsx');
const CSS = read('../styles/homepage-coding.css');
const sectionStart = CSS.indexOf('/* Xroga all-in-one scroll deck.');
const sectionEnd = CSS.indexOf('/* END XROGA ALL-IN-ONE */', sectionStart);
const SECTION_CSS = CSS.slice(sectionStart, sectionEnd);

test('the all-in-one story appears directly after the workspace', () => {
  const workspace = PAGE.indexOf('<HomepageWorkspaceTour loggedIn={loggedIn} />');
  const allInOne = PAGE.indexOf('<HomepageAllInOne />');
  const intelligence = PAGE.indexOf('<XrogaIntelligenceSection />');
  assert.ok(workspace !== -1 && workspace < allInOne && allInOne < intelligence);
  const workspaceEnd = workspace + '<HomepageWorkspaceTour loggedIn={loggedIn} />'.length;
  assert.doesNotMatch(PAGE.slice(workspaceEnd, allInOne), /<Homepage[A-Z]/);
});

test('six scroll cards cover real product work without copying the reference copy', () => {
  assert.equal((COMPONENT.match(/kicker: '/g) || []).length, 6);
  for (const phrase of ['PRODUCT INTERFACE', 'DATA & LOGIC', 'AUTHENTICATION', 'CONNECTED SERVICES', 'EXISTING REPOSITORIES', 'VERIFICATION & RELEASE']) {
    assert.ok(COMPONENT.includes(phrase), `${phrase} is missing`);
  }
  assert.match(COMPONENT, /provider and permissions you authorize/);
  assert.match(COMPONENT, /diffs, checks, and blockers visible/);
  assert.match(COMPONENT, /authorize consequential handoffs/);
  assert.doesNotMatch(COMPONENT, /Anything builds|No keys needed|instant dev and production|1GB\+ free/i);
});

test('the generated repository and release visuals are bundled locally', () => {
  for (const image of [
    '/homepage/all-in-one/xroga-existing-repo-review-20260902.png',
    '/homepage/all-in-one/xroga-authorized-release-20260902.png',
  ]) {
    assert.ok(existsSync(new URL(`../../public${image}`, import.meta.url)), `${image} is missing`);
    assert.ok(COMPONENT.includes(image));
  }
  assert.match(COMPONENT, /from 'next\/image'/);
});

test('the cards form a reversible sticky scroll deck with a static reduced-motion layout', () => {
  assert.match(SECTION_CSS, /\.xv-home-coding \.xv-aio-card\s*\{[\s\S]*position:\s*sticky/);
  assert.match(SECTION_CSS, /\.xv-home-coding \.xv-aio__deck\s*\{[^}]*gap:\s*20svh/);
  assert.match(SECTION_CSS, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.xv-home-coding \.xv-aio-card \{ position: relative; top: auto; \}/);
});

test('the new section stays within the homepage three-family system', () => {
  assert.doesNotMatch(SECTION_CSS, /font-family:\s*var\(--(?:hc-font-mono|hc-font-coding|font-coding|font-xv-mono)/);
  assert.doesNotMatch(SECTION_CSS, /font-family:\s*var\(--hc-font-pixel/);
  assert.match(SECTION_CSS, /font-family:\s*var\(--hc-font-sans\)/);
  assert.match(SECTION_CSS, /font-family:\s*var\(--hc-font-serif\)/);
});
