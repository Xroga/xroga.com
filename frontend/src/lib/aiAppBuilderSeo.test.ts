import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const landing = read('../components/marketing/AiAppBuilderLanding.tsx');
const seo = read('../components/marketing/AiAppBuilderSeoContent.tsx');
const css = read('../components/marketing/AiAppBuilderSeoContent.module.css');
const metadata = read('./capabilityPages.ts');

test('AI app builder landing keeps the original hero and mounts one distinct SEO section set', () => {
  assert.match(landing, /Describe an app/);
  assert.match(landing, /Xroga builds it/);
  assert.match(landing, /Free AI App Builder/);
  assert.equal((landing.match(/<AiAppBuilderSeoContent\s*\/>/g) || []).length, 1);
});

test('metadata targets one commercial page with qualified copy', () => {
  const entry = metadata.split("'ai-app-builder':")[1]?.split("'ai-website-builder':")[0] || '';
  for (const term of ['Free AI App Builder', 'AI app maker', 'AI app creator', 'AI app generator']) {
    assert.match(entry.toLowerCase(), new RegExp(term.toLowerCase()));
  }
  assert.match(entry, /prepare deployment or store review/);
  assert.doesNotMatch(entry, /unlimited apps|guaranteed publishing/i);
});

test('SEO editorial content links to the relevant existing product paths and visibly answers AI prompts', () => {
  for (const slug of [
    '/integrations', '/pricing', '/showcase', '/ai-coding-agent',
    '/vercel-ai-deployment', '/blog/best-ai-app-builders', '/auth/signup',
  ]) {
    assert.ok(seo.includes(slug), `Missing ${slug}`);
  }
  for (const phrase of [
    'create an app for free', 'without coding', 'App Store or Google Play',
    'custom MCP', 'automatically test', 'source code',
  ]) {
    assert.ok(seo.toLowerCase().includes(phrase.toLowerCase()), `Missing ${phrase}`);
  }
  assert.match(seo, /developer accounts and store approval stay with you/);
  assert.doesNotMatch(seo, /guaranteed app store approval|unlimited builds|published automatically/i);
});

test('SEO sections support mobile layouts and honor theme and reduced-motion preferences', () => {
  assert.match(css, /var\(--tp-bg\)/);
  assert.match(css, /var\(--tp-panel-solid\)/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
