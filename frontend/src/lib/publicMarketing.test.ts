import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { hasPublicImageBackground, isPublicMarketingPath, PUBLIC_THEME_BACKGROUNDS } from './publicMarketing';

test('public chrome excludes product, auth, private and preview surfaces', () => {
  for (const path of ['/workspace', '/dashboard/projects/anything', '/admin', '/settings', '/auth/login', '/share/token', '/showcase/example/preview']) {
    assert.equal(isPublicMarketingPath(path), false, path);
  }
  for (const path of ['/', '/features/ai-chat', '/ai-coding-agent', '/pricing', '/blog/arbitrary-slug', '/terms']) {
    assert.equal(isPublicMarketingPath(path), true, path);
  }
});

test('image backgrounds are explicit and never inferred from being public', () => {
  for (const path of ['/pricing', '/features/ai-chat', '/blog/arbitrary-slug', '/compare/a-vs-b', '/docs', '/terms', '/privacy']) {
    assert.equal(hasPublicImageBackground(path), false, path);
  }
  for (const path of ['/', '/about', '/ai-app-builder', '/ai-coding-agent', '/image', '/software']) {
    assert.equal(hasPublicImageBackground(path), true, path);
  }
});

test('all four themes expose distinct desktop and mobile assets', () => {
  const themes = Object.values(PUBLIC_THEME_BACKGROUNDS);
  assert.equal(new Set(themes.map((theme) => theme.desktop)).size, 4);
  assert.equal(new Set(themes.map((theme) => theme.mobile)).size, 4);
});

test('the public background controller toggles image and token classes separately', () => {
  const source = readFileSync(new URL('../components/layout/PublicThemeBackground.tsx', import.meta.url), 'utf8');
  assert.match(source, /classList\.toggle\('xv-public-theme', isPublic\)/);
  assert.match(source, /classList\.toggle\('xv-public-image-background'/);
});
