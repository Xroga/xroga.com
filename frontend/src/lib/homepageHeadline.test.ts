import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const PAGE = read('../components/homepage/HomepageClient.tsx');
const ROUTE = read('../app/page.tsx');
const CSS = read('../styles/homepage-coding.css');

test('the first screen states the product category and ownership value', () => {
  assert.match(PAGE, /AI APP BUILDER \+ CODING AGENT/);
  assert.match(PAGE, /<h1 className="xv-hc-headline">AI app builder that builds, tests and ships <em>code you own\.<\/em><\/h1>/);
  assert.match(PAGE, /existing repository/);
  assert.match(PAGE, /Build free/);
  assert.match(PAGE, /href="#ship-loop"[^>]*>How it works/);
  assert.doesNotMatch(PAGE, /href="#ship-loop"[^>]*>[^<]*<(?:Play|Video)/);
});

test('the black homepage owns responsive cinematic art without changing the chatbar component', () => {
  assert.match(CSS, /body\.theme-black \.xv-home-coding \.xv-hc-bg-image[\s\S]*xroga-black-portal-hero\.webp/);
  assert.match(CSS, /@media \(max-width: 640px\)[\s\S]*xroga-black-portal-hero-mobile\.webp/);
  assert.match(PAGE, /<HomepageChatBar \/>/);
});

test('homepage metadata carries the primary and secondary search intent', () => {
  assert.match(ROUTE, /AI App Builder & Coding Agent for Real Software \| Xroga/);
  assert.match(ROUTE, /keywords: \['AI app builder', 'AI coding agent'/);
  assert.match(ROUTE, /path: '\/'/);
});

test('the semantic headline uses the Xroga display system and theme tokens', () => {
  const shell = CSS.indexOf('Search-first homepage shell');
  const start = CSS.indexOf('.xv-home-coding .xv-hc-headline {', shell);
  assert.notEqual(start, -1);
  const body = CSS.slice(start, CSS.indexOf('}', start));
  assert.match(body, /font-family:\s*var\(--font-claude-serif\)/);
  assert.match(body, /color:\s*var\(--marketing-heading\)/);
  assert.match(body, /font-size:\s*clamp\(/);
  assert.match(CSS.slice(start), /\.xv-home-coding \.xv-hc-headline em[\s\S]*var\(--marketing-heading-accent\)/);
});

test('the mobile headline and reduced-motion behavior are deliberate', () => {
  assert.match(CSS, /@media \(max-width: 760px\)[\s\S]*\.xv-home-coding \.xv-hc-headline \{ font-size:/);
  assert.match(CSS, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.xv-home-coding \.xv-hc-headline-block/);
});
