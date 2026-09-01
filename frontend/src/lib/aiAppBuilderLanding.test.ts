import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const LANDING = read('../components/marketing/AiAppBuilderLanding.tsx');
const PROMPT = read('../components/marketing/AiAppBuilderPrompt.tsx');
const REVEAL = read('../components/marketing/AiAppBuilderScrollStatement.tsx');
const HERO = read('../components/marketing/AiAppBuilderHero.module.css');
const CSS = read('../styles/ai-app-builder-landing.css');
const COMPANION = read('../styles/companion.css');

test('the AI app builder hero contains only the header, headline, and working composer', () => {
  const hero = LANDING.slice(LANDING.indexOf('<section className="xab-hero">'), LANDING.indexOf('<AiAppBuilderScrollStatement'));
  assert.match(hero, /<AiAppBuilderHeader \/>/);
  assert.match(hero, /Describe an app/);
  assert.match(hero, /Xroga builds it/);
  assert.match(hero, /<AiAppBuilderPrompt \/>/);
  assert.doesNotMatch(hero, /Tell Xroga what you want to make|Your repository|xab-hero__media|xab-hero__scrim/);
  assert.doesNotMatch(PROMPT, /SUGGESTIONS|heroSubtitle|Scroll to explore/);
  assert.match(PROMPT, /router\.push/);
});

test('the ownership statement reveals in both scroll directions', () => {
  assert.match(LANDING, /<AiAppBuilderScrollStatement \/>/);
  assert.match(REVEAL, /Tell Xroga what you want to make/);
  assert.match(REVEAL, /Your repository\. Your credentials\. Your product\./);
  assert.match(REVEAL, /window\.addEventListener\('scroll', sync, \{ passive: true \}\)/);
  assert.match(REVEAL, /classList\.toggle\('is-clear', index < clearThrough\)/);
  assert.match(REVEAL, /--xab-copy-progress/);
  assert.doesNotMatch(REVEAL, /observer\.disconnect/);
  assert.match(CSS, /\.xab-manifesto__word\s*\{[^}]*filter:\s*blur\(8px\)/);
  assert.match(CSS, /\.xab-manifesto__word\.is-clear\s*\{[^}]*filter:\s*blur\(0\)/);
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
