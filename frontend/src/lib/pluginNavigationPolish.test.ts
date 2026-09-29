import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

test('Plugin directory is category-first and never renders empty lazy-load instructions', () => {
  const marketplace = source('frontend/src/components/integrations/PluginMarketplace.tsx');

  assert.match(marketplace, /CATEGORY_PREVIEW_LIMIT = 6/);
  assert.match(marketplace, /catalogHydrated/);
  assert.match(marketplace, /if \(catalogHydrated && !sectionPlugins\.length/);
  assert.doesNotMatch(marketplace, /Open this category to load its supported apps/);
  assert.match(marketplace, /specialtyBackfill/);
  assert.match(marketplace, /'commerce-payments': \['stripe', 'shopify', 'whop'/);
  assert.match(marketplace, /'design-media': \['canva', 'figma'/);
  assert.match(marketplace, /'deployment-hosting': \['vercel', 'railway', 'render', 'flyio'/);
});

test('Plugin top controls are compact, segmented, and do not duplicate permissions', () => {
  const marketplace = source('frontend/src/components/integrations/PluginMarketplace.tsx');
  const shelf = source('frontend/src/components/integrations/InstalledPluginsShelf.tsx');
  const frame = source('frontend/src/components/layout/PageFullscreenFrame.tsx');
  const page = source('frontend/src/app/(shell)/dashboard/integrations/page.tsx');

  assert.match(marketplace, /xv-plugin-search-compact/);
  assert.match(marketplace, />\s*Add new plugin\s*</);
  assert.match(marketplace, /xv-plugin-segmented/);
  assert.match(marketplace, /PageFullscreenToggle compact/);
  assert.match(page, /PageFullscreenFrame showToggle=\{false\}/);
  assert.doesNotMatch(marketplace, /PluginPermissionControl/);
  assert.match(shelf, /PluginPermissionControl buttonOnly showFullAccessShortcut/);
  assert.match(frame, /export function PageFullscreenToggle/);
});

test('Add new plugin contains only Custom MCP and Custom no longer contains the credential vault', () => {
  const marketplace = source('frontend/src/components/integrations/PluginMarketplace.tsx');

  assert.match(marketplace, /Create MCP Plugin/);
  assert.match(marketplace, /CustomMcpManager/);
  assert.doesNotMatch(marketplace, /API key or webhook/);
  assert.doesNotMatch(marketplace, /API keys & webhooks/);
  assert.doesNotMatch(marketplace, /CustomCredentialsSection/);
});

test('Needs attention is backed by real connection error states', () => {
  const marketplace = source('frontend/src/components/integrations/PluginMarketplace.tsx');

  assert.match(marketplace, /ConnectedFilter = 'all' \| 'apps' \| 'developer' \| 'attention'/);
  assert.match(marketplace, /plugin\.connectionState === 'needs_attention'/);
  assert.match(marketplace, /plugin\.connectionState === 'error'/);
  assert.match(marketplace, /\['attention', 'Needs attention'\]/);
});

test('Plugin details put task planning before use cases and keep one permission control in connection management', () => {
  const detail = source('frontend/src/components/integrations/PluginDetail.tsx');

  const planner = detail.indexOf('Skills & task planning');
  const useCases = detail.indexOf('Real use cases');

  assert.ok(planner >= 0);
  assert.ok(useCases >= 0);
  assert.ok(planner < useCases);
  assert.match(detail, /xv-plugin-task-shell/);
  assert.match(detail, /xv-plugin-task-action/);
  assert.doesNotMatch(detail, /Sparkles/);
  assert.match(detail, /PageFullscreenToggle compact/);
  assert.match(detail, /xv-plugin-back-btn/);
  assert.equal((detail.match(/<PluginPermissionControl/g) ?? []).length, 1);
});

test('Plugin visual controls use theme-safe interaction classes and motion respects user preference', () => {
  const css = source('frontend/src/app/globals.css');

  assert.match(css, /\.xv-plugin-connect-btn/);
  assert.match(css, /\.xv-plugin-show-more/);
  assert.match(css, /\.xv-plugin-back-btn/);
  assert.match(css, /\.xv-plugin-fullscreen-btn/);
  assert.match(css, /\.xv-plugin-segmented/);
  assert.match(css, /\.xv-plugin-task-shell/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test('prominent brands have official curated or Simple Icons candidates', () => {
  const logos = source('frontend/src/lib/integrationLogos.ts');
  const brand = source('frontend/src/components/integrations/PluginBrandLogo.tsx');

  assert.match(logos, /github: '\/brand\/logos\/github\.svg'/);
  assert.match(logos, /openai: '\/brand\/logos\/openai\.svg'/);
  assert.match(logos, /googlegemini/);
  assert.match(logos, /canva/);
  assert.match(logos, /flydotio/);
  assert.match(logos, /whop/);
  assert.match(brand, /simpleIconCandidates/);
  assert.ok(
    brand.indexOf('simpleIconCandidates(toolkit, name)') <
      brand.indexOf('composioLogoUrl(toolkit)'),
  );
});
