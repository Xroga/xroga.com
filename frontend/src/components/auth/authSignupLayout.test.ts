import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const shell = read('./AuthShell.tsx');
const showcase = read('./AuthShowcase.tsx');
const styles = read('./AuthPowerPanel.module.css');

test('signup is a focused black two-column surface without the duplicate login panel', () => {
  assert.match(shell, /mode === 'signup'\s*\? 'black'/);
  assert.match(shell, /max-w-\[1380px\] xl:grid-cols-\[minmax\(440px,0\.88fr\)_minmax\(560px,1\.12fr\)\]/);
  assert.match(shell, /mode === 'login'\s*\? 'flex'\s*: 'hidden'/);

  const loginAside = shell.split('* SIGN IN')[1] ?? '';
  assert.doesNotMatch(loginAside, /xl:flex/, 'desktop utilities must not override the signup-only hidden state');
});

test('the signup story rotates through four focused Xroga capability scenes', () => {
  assert.match(showcase, /const SLIDE_COUNT = 4/);
  assert.match(showcase, /const INTRO_DURATION_MS = 5200/);
  assert.match(showcase, /const FEATURE_DURATION_MS = 6400/);
  assert.match(showcase, /window\.setTimeout/);
  assert.match(showcase, /window\.clearTimeout/);
  assert.match(showcase, /if \(reducedMotion\) return/);
  assert.match(showcase, /aria-roledescription="carousel"/);
  assert.match(showcase, /Choose a capability slide/);
  assert.doesNotMatch(showcase, /Pause capability slides|Resume capability slides|slideCount/);

  for (const phrase of [
    'Imagine it',
    'Launch everywhere',
    '1,500+ apps',
    'Research',
    'Your AI team',
    'SEO',
    'AEO',
    'GEO',
  ]) {
    assert.ok(showcase.includes(phrase), `${phrase} is missing from the signup power panel`);
  }
});

test('the story uses seven optimized generated images plus local official integration marks', () => {
  for (const image of [
    'idea-to-business.webp',
    'publish-everywhere.webp',
    'ai-testing.webp',
    'connected-work.webp',
    'research-travel.webp',
    'xroga-employees.webp',
    'seo-aeo-geo.webp',
  ]) {
    assert.ok(showcase.includes(`/brand/auth-stories/${image}`), `${image} is missing from the story`);
    const imageUrl = new URL(`../../../public/brand/auth-stories/${image}`, import.meta.url);
    assert.ok(existsSync(imageUrl), `${image} does not exist in public assets`);
    assert.ok(statSync(imageUrl).size < 200_000, `${image} was not optimized for signup delivery`);
  }

  for (const logo of ['github.svg', 'vercel.svg', 'supabase.svg', 'openai.svg', 'gitlab.svg', 'anthropic.svg']) {
    assert.ok(showcase.includes(`/brand/logos/${logo}`), `${logo} is missing`);
    assert.ok(
      existsSync(new URL(`../../../public/brand/logos/${logo}`, import.meta.url)),
      `${logo} does not exist in public assets`,
    );
  }
  assert.doesNotMatch(showcase, /https?:\/\//);
  assert.doesNotMatch(showcase, /\bgraph\b|\bchart\b|Code2|browserMock/i);
});

test('the capability panel stays usable on phones and respects reduced motion', () => {
  assert.match(styles, /\.introSlide/);
  assert.match(styles, /\.buildSlide/);
  assert.match(styles, /\.connectSlide/);
  assert.match(styles, /\.growthSlide/);
  assert.match(styles, /\.slide\.active/);
  assert.match(styles, /@media \(max-width: 480px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /\.fullBleedArt,\s*\n\s*\.secondaryArt \{ animation: none; \}/);
});
