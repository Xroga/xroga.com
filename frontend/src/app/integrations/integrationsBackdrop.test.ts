import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, 'frontend/src', path), 'utf8');
const integration = read('app/integrations/IntegrationsMarketplace.tsx');
const css = read('app/integrations/integrations.css');
const homepage = read('components/homepage/HomepageClient.tsx');
const backdrop = read('components/homepage-next/backdrop/SharedDotBackdrop.tsx');
const backdropCss = read('components/homepage-next/backdrop/SharedDotBackdrop.module.css');

test('integrations mounts exactly the same homepage SharedDotBackdrop once across all sections', () => {
  assert.match(integration, /import \{ SharedDotBackdrop \} from '@\/components\/homepage-next\/backdrop\/SharedDotBackdrop';/);
  assert.equal(integration.split('<SharedDotBackdrop />').length - 1, 1);
  assert.match(homepage, /<SharedDotBackdrop \/>/);
  const rootIndex = integration.indexOf('<div className="xi-root">');
  const backdropIndex = integration.indexOf('<SharedDotBackdrop />');
  const heroIndex = integration.indexOf('<section className="xi-hero"');
  const closingIndex = integration.indexOf('<section className="xi-cta"');
  assert.ok(rootIndex >= 0 && rootIndex < backdropIndex);
  assert.ok(backdropIndex < heroIndex && heroIndex < closingIndex);
  assert.equal(integration.indexOf('<footer'), -1, 'existing marketing footer remains outside integration root');
});

test('all landing sections sit above one continuous 25px dot field', () => {
  assert.match(css, /\.xi-root\s*>\s*section\s*\{/);
  assert.match(css, /z-index:\s*1/);
  assert.match(css, /\.xi-hero::after\s*\{\s*display:\s*none\s*!important\s*;/);
  assert.match(css, /background:\s*transparent\s*!important/);
  assert.match(backdropCss, /--pitch: 25px/);
  assert.match(backdropCss, /background-color: #050607/);
  assert.match(backdrop, /pointermove/);
  assert.match(backdrop, /prefers-reduced-motion: reduce/);
});


test('hero uses ten bundled authentic brand marks, five per side, without badge pills', () => {
  const hero = integration.slice(integration.indexOf('<section className="xi-hero"'), integration.indexOf('<section className="xi-section xi-directory"'));
  assert.match(hero, /HERO_BRAND_MARKS\.map/);
  assert.match(hero, /src=\{app\.src\}/);
  assert.doesNotMatch(hero, /xi-hero-app-strip|xi-hero-app"/);
  assert.match(hero, /xi-hero-actions/);
  const names = [
    'Google Sheets', 'Gmail', 'Slack', 'Notion', 'Airtable',
    'OpenAI', 'Claude', 'Vercel', 'HubSpot', 'GitHub',
  ];
  for (const name of names) assert.match(integration, new RegExp("name: '" + name + "'"));
  assert.equal((integration.match(/\{ id: '[a-z]+', name: '[^']+', src: '\/brand\//g) || []).length, 10);
});

test('the fixed headline rotates only apps, agents and tools, with reduced-motion fallback', () => {
  assert.match(integration, /Connect your favorite\{' '\}/);
  assert.match(integration, /with Xroga AI\./);
  assert.match(integration, /xi-hero-word--apps/);
  assert.match(integration, /xi-hero-word--agents/);
  assert.match(integration, /xi-hero-word--tools/);
  assert.match(css, /@keyframes xi-hero-word-blur/);
  assert.match(css, /\.xi-hero-rotating\{display:inline-grid/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});

test('hero and closing CTA share dots and have no three full-width divider borders', () => {
  assert.doesNotMatch(css, /border-bottom:1px solid rgba\(144,178,227,\.08\)/);
  assert.doesNotMatch(css, /border-top:1px solid rgba\(255,255,255,\.11\)/);
  assert.doesNotMatch(css, /border-top:1px solid rgba\(128,171,240,\.19\)/);
  assert.match(css, /\.xi-root\{border-radius:0 0 34px 34px/);
  assert.match(css, /\.xi-cta\{[\s\S]*?border-radius:0 0 34px 34px/);
  assert.match(css, /background:transparent!important/);
});

test('Claude occupies the right rail with the legacy left offset cleared', () => {
  const correction = css.slice(css.indexOf('Follow-up polish:'));
  assert.ok(integration.includes("id: 'claude', name: 'Claude'"));
  assert.ok(correction.includes('.xi-hero-logos .xi-orbit-logo-7{'));
  assert.ok(correction.includes('top:28%;'));
  assert.ok(correction.includes('right:1.5%;'));
  assert.ok(correction.includes('left:auto;'));
  assert.ok(correction.includes('.xi-orbit-logo-10{'));
});

test('final signup section has opaque dot-free background and prominent bottom corners', () => {
  const correction = css.slice(css.indexOf('Follow-up polish:'));
  assert.ok(correction.includes('.xi-root > section.xi-cta{'));
  assert.ok(correction.includes('background:#0a0a0a!important;'));
  assert.ok(correction.includes('135deg,'));
  assert.ok(correction.includes('#f7f7f7 25%,'));
  assert.ok(correction.includes('#080808 50%,'));
  assert.ok(correction.includes('.xi-root > section.xi-cta::before{'));
  assert.ok(correction.includes('background:radial-gradient('));
  assert.ok(correction.includes('.xi-root > section.xi-cta > :is(h2,p,a){'));
  assert.ok(correction.includes('z-index:1;'));
  assert.ok(correction.includes('background-size:40px 40px!important;'));
  assert.ok(correction.includes('animation:xi-cta-diagonal-move 4s linear infinite;'));
  assert.ok(correction.includes('@keyframes xi-cta-diagonal-move'));
  assert.ok(correction.includes('100%{background-position:40px 40px}'));
  assert.ok(correction.includes('@media(prefers-reduced-motion:reduce)'));
  assert.ok(correction.includes('.xi-root > section.xi-cta{animation:none}'));
  assert.ok(correction.includes('border-radius:0 0 52px 52px;'));
  assert.ok(correction.includes('border-bottom-left-radius:32px;'));
  assert.ok(correction.includes('border-bottom-right-radius:32px;'));
  assert.ok(integration.includes('Start in minutes.'));
  assert.ok(integration.includes('Try Xroga for free.'));
  assert.ok(integration.includes('href="/auth/signup"'));
  assert.ok(integration.includes('<SharedDotBackdrop />'));
});

test('public app cards use original logo sources and the dashboard canonical logo fallback', () => {
  const brand = read('components/integrations/PluginBrandLogo.tsx');
  assert.match(integration, /fallbackLogo=\{composioLogoUrl\(item\.id\)\}/);
  assert.match(integration, /logo=\{item\.logoUrl\}/);
  assert.match(brand, /WHITE_FOREGROUND_LOCAL_SVGS/);
  assert.match(brand, /github.*vercel.*openai.*cursor/);
  assert.match(brand, /backgroundColor: darkLogoTile \? '#141414' : '#fff'/);
  assert.match(brand, /verifiedOnly \&\& WHITE_FOREGROUND_LOCAL_SVGS/);
  assert.match(brand, /onError=\{\(\) => setIndex\(\(current\) => current \+ 1\)\}/);
});

test('unavailable public catalog cannot be misrepresented as the full marketplace', () => {
  assert.match(integration, /label: 'Featured apps'/);
  assert.match(integration, /The full provider directory is not available on this preview yet/);
  assert.match(integration, /const directoryItems = liveItems \?\? items;/);
  assert.match(integration, /liveIntegrationCategories\(liveItems\)/);
});
