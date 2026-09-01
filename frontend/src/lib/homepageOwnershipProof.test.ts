import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const PAGE = read('../app/page.tsx');
const STATEMENT = read('../components/homepage/HomepageScrollStatement.tsx');
const PROOF = read('../components/homepage/HomepageOwnershipProof.tsx');
const COMPANION = read('../components/companion/CompanionSurfaces.tsx');
const CSS = read('../styles/homepage-coding.css');
const COMPANION_CSS = read('../styles/companion.css');

test('the truthful product statement reveals in its own section directly after the hero', () => {
  const chat = PAGE.indexOf('<HomepageChatBar />');
  const heroClose = PAGE.indexOf('</section>', chat);
  const statement = PAGE.indexOf('<HomepageScrollStatement />');
  const intelligence = PAGE.indexOf('<XrogaIntelligenceSection />');
  assert.ok(
    chat !== -1 && heroClose > chat && statement > heroClose && intelligence > statement,
    'the statement belongs in its own section directly after the homepage hero',
  );
  assert.match(STATEMENT, /when you authorize it/);
  assert.match(STATEMENT, /Your repository\. Your credentials\. Your product\./);
  assert.match(STATEMENT, /window\.addEventListener\('scroll', sync, \{ passive: true \}\)/);
  assert.match(STATEMENT, /classList\.toggle\('is-clear', index < clearThrough\)/);
  assert.match(CSS, /\.xv-home-coding \.xv-home-editorial__lead\s*\{[^}]*font-family:\s*var\(--hc-font-serif\)/);
  assert.match(CSS, /\.xv-home-coding \.xv-home-editorial__word\s*\{[^}]*filter:\s*blur\(9px\)/);
  assert.match(CSS, /\.xv-home-coding \.xv-home-editorial__word\.is-clear\s*\{[^}]*filter:\s*blur\(0\)/);
});

test('the value section uses original Xroga wording and makes no invented proof claim', () => {
  assert.match(PAGE, /<HomepageOwnershipProof \/>/);
  assert.doesNotMatch(PROOF, /Why Choose Us/i);
  assert.match(PROOF, /The work doesn&apos;t disappear/);
  assert.match(PROOF, /changed files, checks, blockers, and preview evidence/);
  assert.match(PROOF, /When you authorize shipping/);
  assert.doesNotMatch(PROOF, /\$[\d,.]+|\d+%|customers|users trust|award-winning/i);
});

test('all three generated illustrations are project assets rendered with next image', () => {
  assert.match(PROOF, /from 'next\/image'/);
  const images = [...PROOF.matchAll(/image: '(\/homepage\/proof\/[^']+)'/g)].map((match) => match[1]);
  assert.equal(images.length, 3);
  for (const image of images) {
    assert.ok(existsSync(new URL(`../../public${image}`, import.meta.url)), `${image} is missing`);
  }
});

test('Smoky is attached to the homepage chatbar instead of floating around the viewport', () => {
  assert.doesNotMatch(COMPANION, /xroga-smoky-position|pointermove|onPointerDown/);
  assert.match(COMPANION, /<div className="xv-home-companion-stage">/);
  assert.match(COMPANION_CSS, /\.xv-home-companion-stage\s*\{[^}]*position:\s*absolute/);
  assert.doesNotMatch(COMPANION_CSS, /\.xv-home-companion-stage\s*\{[^}]*position:\s*fixed/);
  assert.match(CSS, /\.xv-home-coding \.xv-hc-chat\s*\{[^}]*position:\s*relative/);
});
