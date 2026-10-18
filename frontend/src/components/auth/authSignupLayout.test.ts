import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
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
  assert.match(showcase, /const FEATURE_DURATION_MS = 6200/);
  assert.match(showcase, /window\.setTimeout/);
  assert.match(showcase, /window\.clearTimeout/);
  assert.match(showcase, /if \(paused \|\| reducedMotion\) return/);
  assert.match(showcase, /aria-roledescription="carousel"/);
  assert.match(showcase, /Pause capability slides/);
  assert.match(showcase, /Choose a capability slide/);

  for (const phrase of [
    'Convert your ideas into',
    'simple conversation',
    'Ship it everywhere',
    '1,500+ apps',
    'Web &amp; X research',
    'Xroga AI Employees',
    'SEO, AEO, and GEO',
  ]) {
    assert.ok(showcase.includes(phrase), `${phrase} is missing from the signup power panel`);
  }
});

test('integration marks are local official assets and the growth percentage is labelled illustrative', () => {
  for (const logo of ['github.svg', 'vercel.svg', 'supabase.svg', 'openai.svg', 'gitlab.svg', 'anthropic.svg']) {
    assert.ok(showcase.includes(`/brand/logos/${logo}`), `${logo} is missing`);
    assert.ok(
      existsSync(new URL(`../../../public/brand/logos/${logo}`, import.meta.url)),
      `${logo} does not exist in public assets`,
    );
  }
  assert.match(showcase, /Illustrative discoverability trend/);
  assert.match(showcase, /Illustrative visibility signals/);
  assert.doesNotMatch(showcase, /https?:\/\//);
});

test('the capability panel stays usable on phones and respects reduced motion', () => {
  assert.match(styles, /\.introSlide/);
  assert.match(styles, /\.buildSlide/);
  assert.match(styles, /\.connectSlide/);
  assert.match(styles, /\.growthSlide/);
  assert.match(styles, /\.slide\.active/);
  assert.match(styles, /@media \(max-width: 480px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /\.graphLine \{ stroke-dashoffset: 0; \}/);
});
