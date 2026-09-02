import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const PAGE = read('../app/page.tsx');
const PROOF = read('../components/homepage/HomepageOwnershipProof.tsx');
const AUDIENCE = read('../components/homepage/HomepageAudienceSlider.tsx');
const COMPANION = read('../components/companion/CompanionSurfaces.tsx');
const CSS = read('../styles/homepage-coding.css');
const COMPANION_CSS = read('../styles/companion.css');

test('the audience selector is the last product section before FAQ', () => {
  assert.doesNotMatch(PROOF, /THE REAL GAP IS AFTER THE PROMPT|THE DIFFERENCE IS WHAT YOU KEEP/);
  assert.doesNotMatch(PROOF, /xv-home-proof__brief-card|xv-home-proof__compact-row|HomepageBuildStrip/);
  assert.match(PROOF, /<HomepageAudienceSlider \/>/);
  const audience = PAGE.indexOf('<HomepageOwnershipProof />');
  const faq = PAGE.indexOf('<HomepageFaqSection />');
  assert.ok(audience !== -1 && faq !== -1 && audience < faq, 'audience must render before FAQ');
  assert.doesNotMatch(PAGE.slice(audience, faq), /<Homepage(?:Showcase|ShipStack|EnterpriseProof|WorkspaceTour)/);
});

test('workspace follows the hero and intelligence follows the workspace', () => {
  const heroEnd = PAGE.indexOf('</section>', PAGE.indexOf('className="xv-hc-hero"'));
  const workspace = PAGE.indexOf('<HomepageWorkspaceTour loggedIn={loggedIn} />');
  const intelligence = PAGE.indexOf('<XrogaIntelligenceSection />');
  assert.ok(heroEnd !== -1 && heroEnd < workspace && workspace < intelligence);
  assert.doesNotMatch(PAGE.slice(heroEnd, workspace), /<Homepage[A-Z]/);
});

test('the audience selector covers founders, developers, non-coders, and teams', () => {
  for (const label of ['Founders', 'Developers', 'Non-coders', 'Product teams']) {
    assert.ok(AUDIENCE.includes(label), `${label} is missing`);
  }
  assert.match(AUDIENCE, /Start fresh or bring an existing repository/);
  assert.match(AUDIENCE, /useState\(1\)/, 'Developers should be the initial visible audience');
  assert.match(AUDIENCE, /role="tablist"/);
  assert.match(AUDIENCE, /aria-selected=\{active === index\}/);
  assert.match(AUDIENCE, /event\.key === 'ArrowRight'/);
  assert.match(AUDIENCE, /event\.key === 'ArrowLeft'/);
  assert.match(AUDIENCE, /AUTO_ADVANCE_MS = 6_000/);
  assert.match(AUDIENCE, /prefers-reduced-motion: reduce/);
});

test('the generated audience portrait strip is local and displayed in every tab', () => {
  const image = '/homepage/audiences/xroga-audience-portraits-20260901.png';
  assert.ok(existsSync(new URL(`../../public${image}`, import.meta.url)), `${image} is missing`);
  assert.match(CSS, new RegExp(image.replaceAll('/', '\\/')));
  for (const position of ['0%', '33.333%', '66.667%', '100%']) {
    assert.ok(CSS.includes(`background-position-x: ${position}`), `portrait crop ${position} is missing`);
  }
});

test('audience controls and copy stay compact across desktop and mobile', () => {
  assert.match(CSS, /xv-audience\s*\{[\s\S]*grid-template-columns/);
  assert.match(CSS, /@media \(max-width: 620px\)[\s\S]*xv-audience__tabs \{[^}]*overflow-x:\s*auto/);
  assert.match(CSS, /xv-audience__tabs button\s*\{[\s\S]*min-height:\s*58px/);
});

test('Smoky remains attached to the homepage chatbar', () => {
  assert.doesNotMatch(COMPANION, /xroga-smoky-position|pointermove|onPointerDown/);
  assert.match(COMPANION, /<div className="xv-home-companion-stage">/);
  assert.match(COMPANION_CSS, /\.xv-home-companion-stage\s*\{[^}]*position:\s*absolute/);
  assert.doesNotMatch(COMPANION_CSS, /\.xv-home-companion-stage\s*\{[^}]*position:\s*fixed/);
});
