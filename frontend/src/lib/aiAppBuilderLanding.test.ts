import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const LANDING = read('../components/marketing/AiAppBuilderLanding.tsx');
const PROMPT = read('../components/marketing/AiAppBuilderPrompt.tsx');
const HERO = read('../components/marketing/AiAppBuilderHero.module.css');
const CSS = read('../styles/ai-app-builder-landing.css');
const COMPANION = read('../styles/companion.css');

test('the AI app builder hero contains only the header, headline, and working composer', () => {
  const hero = LANDING.slice(LANDING.indexOf('<section className="xab-hero">'), LANDING.indexOf('BLUE PRODUCT SECTION'));
  assert.match(hero, /<AiAppBuilderHeader \/>/);
  assert.match(hero, /Describe an app/);
  assert.match(hero, /Xroga builds it/);
  assert.match(hero, /<AiAppBuilderPrompt \/>/);
  assert.doesNotMatch(hero, /Tell Xroga what you want to make|Your repository|xab-hero__media|xab-hero__scrim/);
  assert.doesNotMatch(PROMPT, /SUGGESTIONS|heroSubtitle|Scroll to explore/);
  assert.match(PROMPT, /router\.push/);
});

test('homepage editorial copy is not duplicated on the app-builder route', () => {
  assert.doesNotMatch(LANDING, /AiAppBuilderScrollStatement|Tell Xroga what you want to make|Your credentials/);
  assert.doesNotMatch(CSS, /xab-manifesto/);
});

test('all app-builder surfaces and controls inherit the active theme', () => {
  for (const token of ['--tp-bg', '--tp-ink', '--tp-accent', '--tp-panel-solid', '--tp-border']) {
    assert.match(HERO, new RegExp(token.replace('--', '--')));
  }
  assert.doesNotMatch(HERO, /rgba\(0, 8, 35|#041024|#0546c8|text-shadow/);
  assert.match(CSS, /\.xab-page \.xab-blue\s*\{[^}]*var\(--tp-bg\)/);
  assert.match(CSS, /\.xab-page \.xab-footer__media\s*\{\s*display:\s*none/);
});

test('the companion hover keeps only the character silhouette', () => {
  assert.match(COMPANION, /\.xv-companion-trigger:hover\s*\{[^}]*filter:\s*none/);
  assert.match(COMPANION, /\.xv-smoky-sprite\s*\{[^}]*filter:none/);
  assert.doesNotMatch(COMPANION, /\.xv-companion-trigger:hover[^}]*drop-shadow/);
});
