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


test('hero shows checked-in brand logos but no row of pill badges below the buttons', () => {
  const hero = integration.slice(integration.indexOf('<section className="xi-hero"'), integration.indexOf('<section className="xi-section xi-directory"'));
  assert.match(hero, /HERO_BRAND_MARKS\.map/);
  assert.match(integration, /logo=\{LOCAL_PUBLIC_INTEGRATION_LOGOS\[app\.id\]\}/);
  assert.doesNotMatch(hero, /xi-hero-app-strip|xi-hero-app"/);
  assert.match(hero, /xi-hero-actions/);
  const actual = [
    'github', 'supabase', 'vercel', 'openai', 'gitlab', 'anthropic',
  ];
  for (const id of actual) {
    assert.match(integration, new RegExp("\\{ id: '" + id + "', name:"));
  }
});
