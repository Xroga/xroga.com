import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const PAGE = read('../app/page.tsx');
const STRIP = read('../components/homepage/HomepageBuildStrip.tsx');
const PROOF = read('../components/homepage/HomepageOwnershipProof.tsx');
const CSS = read('../styles/homepage-coding.css');

test('the compact stack story sits immediately after the hero', () => {
  assert.ok(!PAGE.includes('<HomepageBuildStrip />'), 'the stack strip must not compete with the hero composer');
  assert.match(PROOF, /<HomepageBuildStrip \/>/);
  assert.ok(PAGE.indexOf('<HomepageOwnershipProof />') < PAGE.indexOf('<XrogaIntelligenceSection />'));
});

test('integrations and languages have separate continuous lanes', () => {
  assert.match(STRIP, /The tools and languages/);
  assert.match(STRIP, /CONNECTS WITH/);
  assert.match(STRIP, /WRITES AND WORKS IN/);
  assert.match(STRIP, /<IntegrationLogo/);
  assert.match(STRIP, /CODING_LANGUAGES/);
  assert.equal([...STRIP.matchAll(/<IntegrationLane/g)].length, 2);
  assert.equal([...STRIP.matchAll(/<LanguageLane/g)].length, 2);
  assert.match(CSS, /xv-stack-marquee 30s linear infinite/);
  assert.match(CSS, /xv-stack-strip__track--reverse/);
  assert.match(CSS, /prefers-reduced-motion: reduce[\s\S]*xv-stack-strip__track \{ animation: none/);
});

test('the stack composition is not wrapped in one oversized card', () => {
  const at = CSS.lastIndexOf('.xv-home-coding .xv-stack-strip {');
  const body = CSS.slice(CSS.indexOf('{', at) + 1, CSS.indexOf('}', at));
  assert.doesNotMatch(body, /border:|border-radius:|background:|box-shadow:/);
  assert.match(body, /grid-template-columns/);
  assert.match(CSS, /xv-stack-strip__viewport[\s\S]*border-radius:\s*18px/);
});

test('the obsolete build-target wall and motto are gone', () => {
  for (const text of ['Build. Launch.', 'Dashboards', 'Desktop\\nsoftware', 'Debug\\nerror', 'And More']) {
    assert.ok(!STRIP.includes(text), `${text} should not remain in the compact stack strip`);
  }
});

test('the homepage still has one real h1 and no dead hero rotator', () => {
  assert.equal([...PAGE.matchAll(/<h1[\s>]/g)].length, 1);
  for (const trace of ['HERO_BUILD_WORDS', 'buildWordIdx', 'activeBuildWord', 'xv-hc-target-stage']) {
    assert.ok(!PAGE.includes(trace), `${trace} is still in the page`);
  }
});

test('twenty bundled language marks remain available', () => {
  const LANGS = read('./codingLanguages.ts');
  assert.ok(LANGS.includes("from 'simple-icons'"));
  assert.ok(!/cdn\.simpleicons\.org/.test(LANGS));
  const imported = [...LANGS.matchAll(/^\s{2}(si[A-Z]\w*),$/gm)].map((match) => match[1]);
  assert.equal(imported.length, 20);
  assert.equal(new Set(imported).size, 20);
  assert.match(STRIP, /<path d=\{language\.path\}/);
});

test('coding display type remains reserved for the hero', () => {
  assert.match(CSS, /\.xv-home-coding > :not\(\.xv-hc-hero\)[\s\S]*--hc-font-pixel:\s*var\(--hc-font-sans\)/);
  assert.match(CSS, /\.xv-home-coding \.xv-hc-headline__agentic\s*\{[\s\S]*font-family:\s*var\(--hc-font-pixel\)/);
});
