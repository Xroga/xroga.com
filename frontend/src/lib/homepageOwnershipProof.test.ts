import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const PAGE = read('../app/page.tsx');
const PROOF = read('../components/homepage/HomepageOwnershipProof.tsx');
const COMPANION = read('../components/companion/CompanionSurfaces.tsx');
const CSS = read('../styles/homepage-coding.css');
const COMPANION_CSS = read('../styles/companion.css');

test('the two removed narrative statements no longer interrupt the homepage', () => {
  assert.match(PAGE, /<HomepageOwnershipProof \/>/);
  assert.doesNotMatch(PROOF, /THE REAL GAP IS AFTER THE PROMPT|Most ideas don&apos;t need another answer/);
  assert.doesNotMatch(PROOF, /THE DIFFERENCE IS WHAT YOU KEEP|The work doesn&apos;t disappear/);
});

test('build range and brief story are the only two compact cards in one row', () => {
  assert.match(PROOF, /xv-home-proof__compact-row/);
  assert.match(PROOF, /<HomepageBuildStrip \/>/);
  assert.match(PROOF, /xv-home-proof__brief-card/);
  assert.match(CSS, /\.xv-home-coding \.xv-home-proof__compact-row\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/);
  assert.doesNotMatch(PROOF, /xv-home-proof__platform-card|xv-home-proof__heading|xv-home-proof__grid/);
});

test('the brief card supports fresh products and existing repositories', () => {
  assert.match(PROOF, /Start a fresh product or connect an existing repository/);
  assert.match(PROOF, /Your brief becomes the build/);
  assert.match(PROOF, /Build the product, not just the answer/);
  assert.match(PROOF, /Scope, interface, data, checks, and release intent/);
  assert.doesNotMatch(PROOF, /customers|users trust|award-winning|guarantee|\d+%|\$[\d,.]+/i);
});

test('the brief illustration is bundled and rendered with next image without a card number', () => {
  assert.match(PROOF, /from 'next\/image'/);
  const image = '/homepage/proof/xroga-brief-to-build-20260901.png';
  assert.match(PROOF, new RegExp(image.replaceAll('/', '\\/')));
  assert.ok(existsSync(new URL(`../../public${image}`, import.meta.url)), `${image} is missing`);
  assert.doesNotMatch(PROOF, /index:|'01'|'02'|'03'/);
});

test('Smoky remains attached to the homepage chatbar', () => {
  assert.doesNotMatch(COMPANION, /xroga-smoky-position|pointermove|onPointerDown/);
  assert.match(COMPANION, /<div className="xv-home-companion-stage">/);
  assert.match(COMPANION_CSS, /\.xv-home-companion-stage\s*\{[^}]*position:\s*absolute/);
  assert.doesNotMatch(COMPANION_CSS, /\.xv-home-companion-stage\s*\{[^}]*position:\s*fixed/);
});
