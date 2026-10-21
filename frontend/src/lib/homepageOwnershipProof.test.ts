import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const PAGE = read('../components/homepage/HomepageClient.tsx');
const PROOF = read('../components/homepage/HomepageOwnershipProof.tsx');
const AUDIENCE = read('../components/homepage/HomepageAudienceSlider.tsx');
const CSS = read('../styles/homepage-coding.css');

test('legacy audience and FAQ are unmounted from the founder-approved short homepage', () => {
  assert.doesNotMatch(PROOF, /THE REAL GAP IS AFTER THE PROMPT|THE DIFFERENCE IS WHAT YOU KEEP/);
  assert.doesNotMatch(PROOF, /xv-home-proof__brief-card|xv-home-proof__compact-row|HomepageBuildStrip/);
  assert.match(PROOF, /<HomepageAudienceSlider \/>/);
  assert.doesNotMatch(PAGE, /<HomepageOwnershipProof|<HomepageFaqSection/);
});

test('homepage follows hero through S05 and immediately reaches the retained closing action', () => {
  const tokens = ['<S00Hero />', '<S01CapabilityDeck />', '<S02Work loggedIn={loggedIn} />',
    '<S03Growth loggedIn={loggedIn} />', '<S04Publish loggedIn={loggedIn} />',
    '<S05Capabilities />', 'className="xv-closing-frame"'];
  const positions = tokens.map((token) => PAGE.indexOf(token));
  assert.ok(positions.every((position) => position !== -1));
  assert.ok(positions.every((position, i) => i === 0 || position > positions[i - 1]));
  // the closing card sits directly after S05, inside its graphite horizon environment
  assert.match(PAGE, /<S05Capabilities \/>\s*(?:<\/div>\s*)?(?:\{\/\*[^*]*\*\/\}\s*)?<div className="xv-horizon"[^>]*>\s*<Ambient kind="horizon" \/>\s*<section\s+ref=\{closingRef\}\s+className="xv-closing-frame"/);
});

test('the audience selector covers founders, developers, non-coders, and teams', () => {
  for (const label of ['Founders', 'Developers', 'Non-coders', 'Product teams']) {
    assert.ok(AUDIENCE.includes(label), `${label} is missing`);
  }
  assert.match(AUDIENCE, /Brief, build, checks, and handoff stay connected/);
  assert.match(AUDIENCE, /useState\(1\)/, 'Developers should be the initial visible audience');
  assert.match(AUDIENCE, /role="tablist"/);
  assert.match(AUDIENCE, /aria-selected=\{active === index\}/);
  assert.match(AUDIENCE, /event\.key === 'ArrowRight'/);
  assert.match(AUDIENCE, /event\.key === 'ArrowLeft'/);
  assert.match(AUDIENCE, /AUTO_ADVANCE_MS = 6_000/);
  assert.match(AUDIENCE, /prefers-reduced-motion: reduce/);
});

test('closing community and signup CTA survive while legacy audience FAQ frame is removed', () => {
  assert.doesNotMatch(PAGE, /xv-endgame-frame|<HomepageOwnershipProof|<HomepageFaqSection/);
  assert.match(PAGE, /className="xv-closing-frame"[\s\S]*xv-hc-community[\s\S]*xv-hc-mid-cta[\s\S]*<\/section>/);
  assert.match(CSS, /\.xv-home-coding \.xv-closing-frame\s*\{[\s\S]*grid-template-columns/);
  assert.doesNotMatch(PAGE, /HomepageIntegrationOrbit/);
  assert.doesNotMatch(PAGE, /<span>SOON<\/span>/);
  assert.match(PAGE, /Build what&apos;s/);
  assert.match(PAGE, /Get started — it&apos;s free/);
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

test('the homepage hero stays focused on the product prompt without character art', () => {
  assert.doesNotMatch(PAGE, /HomepageCompanionStage|useCompanionStore|hydrateCompanion/);
  assert.match(PAGE, /<S00Hero \/>/);
});
