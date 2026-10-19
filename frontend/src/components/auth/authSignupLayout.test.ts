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
    'Succeed everywhere',
    'Success verified',
    'Repaired and tested',
    'Long projects keep moving',
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

test('the story uses five optimized image cards plus twenty real integration marks', () => {
  for (const image of [
    'publish-everywhere-clean.webp',
    'connected-work-clean.webp',
    'research-travel-clean.webp',
    'xroga-employees-clean.webp',
    'seo-aeo-geo-clean.webp',
  ]) {
    assert.ok(showcase.includes(`/brand/auth-stories/${image}`), `${image} is missing from the story`);
    const imageUrl = new URL(`../../../public/brand/auth-stories/${image}`, import.meta.url);
    assert.ok(existsSync(imageUrl), `${image} does not exist in public assets`);
    assert.ok(statSync(imageUrl).size < 200_000, `${image} was not optimized for signup delivery`);
  }

  assert.doesNotMatch(showcase, /idea-to-business-clean\.webp/, 'the first slide must stay image-free');
  assert.doesNotMatch(showcase, /ai-testing-clean\.webp/, 'the responsive success image now owns repair and testing');

  for (const mark of [
    'siGmail', 'siGooglecalendar', 'siGoogledrive', 'siGithub', 'siGitlab',
    'siNotion', 'siHubspot', 'siStripe', 'siShopify', 'siVercel',
    'siSupabase', 'siAirtable', 'siDropbox', 'siDiscord', 'siJira',
    'siAsana', 'siTrello', 'siFigma', 'siCloudflare', 'siNetlify',
  ]) {
    assert.ok(showcase.includes(mark), `${mark} is missing from the app grid`);
  }
  assert.match(showcase, /const APP_MARKS: readonly SimpleIcon\[\] = \[/);
  const appMarks = showcase.split('const APP_MARKS: readonly SimpleIcon[] = [')[1]?.split('] as const;')[0] ?? '';
  assert.equal((appMarks.match(/\n  si[A-Za-z]+,/g) ?? []).length, 20);
  assert.match(showcase, /Twenty popular supported apps/);
  assert.match(showcase, /20 shown/);
  assert.match(showcase, /1,500\+ available/);
  assert.match(showcase, /\/brand\/xroga-orb-mark-v2\.webp/);
  assert.doesNotMatch(showcase, /https?:\/\//);
});

test('the panel renders graphs, counts, and percentages without animating imagery', () => {
  for (const phrase of ['94%', '128', 'checks passed', '0', 'blockers', '42%', '78%', '+31%']) {
    assert.ok(showcase.includes(phrase), `${phrase} is missing from the metrics`);
  }
  assert.match(showcase, /function TrendChart/);
  assert.match(styles, /\.trendChart/);
  assert.doesNotMatch(styles, /@keyframes|animation\s*:/);
  assert.doesNotMatch(styles, /\.artImage[^}]*transition|\.artImage[^}]*transform/s);
});

test('every slide shares the black-to-violet gradient and keeps text above and below its image card', () => {
  assert.match(styles, /--story-gradient:/);
  assert.match(styles, /linear-gradient\(180deg, #000004 0%, #05000f 31%, #260064 58%, #793cff 78%, #f4efff 100%\)/);
  assert.match(styles, /\.buildSlide,\s*\n\.connectSlide,\s*\n\.growthSlide \{ background: var\(--story-gradient\); \}/);
  assert.match(showcase, /styles\.introFooter/);
  assert.equal((showcase.match(/styles\.sceneFooter/g) ?? []).length, 3);
});

test('the capability panel stays usable on phones and respects reduced motion', () => {
  assert.match(styles, /\.introSlide/);
  assert.match(styles, /\.buildSlide/);
  assert.match(styles, /\.connectSlide/);
  assert.match(styles, /\.growthSlide/);
  assert.match(styles, /\.slide\.active/);
  assert.match(styles, /@media \(max-width: 480px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /\.slide,\s*\n\s*\.dots button span \{ transition: none; \}/);
});
