import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { toolkitLogoAssetUrl } from './pluginCatalog';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

test('Plugin marketplace renders compact expandable category shelves', () => {
  const marketplace = source(
    'frontend/src/components/integrations/PluginMarketplace.tsx',
  );
  const service = source(
    'backend/src/services/integrations/composioClient.ts',
  );
  const client = source('frontend/src/lib/xrogaConnect.ts');

  assert.match(marketplace, /MarketplaceShelf/);
  assert.match(marketplace, /Browse by category/);
  assert.match(marketplace, /expandedSection/);
  assert.match(marketplace, /Popular/);
  assert.match(marketplace, /Explore/);
  assert.match(service, /Small Business/);
  assert.match(service, /Business & Operations/);
  assert.match(service, /Data & Analytics/);
  assert.match(service, /Developer Tools/);
  assert.match(service, /Travel/);
  assert.match(service, /Entertainment/);
  assert.match(client, /marketplaceSections:/);
  assert.match(client, /marketplaceSection:/);
});

test('search renders local matches immediately before remote capability enrichment', () => {
  const marketplace = source(
    'frontend/src/components/integrations/PluginMarketplace.tsx',
  );

  const sourceIndex = marketplace.indexOf('const source = mergePlugins([');
  const allIndex = marketplace.indexOf('...allPlugins', sourceIndex);
  const remoteIndex = marketplace.indexOf('...dynamicSearchPlugins', sourceIndex);
  const resultsIndex = marketplace.indexOf('Search results');
  const navIndex = marketplace.indexOf('aria-label="Plugin views"');

  assert.ok(sourceIndex >= 0);
  assert.ok(allIndex > sourceIndex);
  assert.ok(remoteIndex > allIndex);
  assert.ok(resultsIndex >= 0 && resultsIndex < navIndex);
});

test('provider logos use metadata then direct open-source provider assets with a neutral fallback', () => {
  const logo = source(
    'frontend/src/components/integrations/PluginBrandLogo.tsx',
  );

  assert.equal(
    toolkitLogoAssetUrl('slack'),
    'https://cdn.jsdelivr.net/gh/ComposioHQ/logo-cdn@master/src/assets/slack.svg',
  );
  assert.match(logo, /toolkitLogoAssetUrl/);
  assert.match(logo, /logo unavailable/);
  assert.doesNotMatch(logo, /logos\.composio\.dev\/api/);
  assert.doesNotMatch(logo, /google\.com\/s2\/favicons/);
});

test('Add Plugin stays a compact modal and supports real Custom MCP lifecycle', () => {
  const modal = source(
    'frontend/src/components/integrations/AddPluginModal.tsx',
  );
  const routes = source('backend/src/routes/integrations.ts');
  const runtime = source(
    'backend/src/services/integrations/composioClient.ts',
  );
  const registry = source(
    'backend/src/services/integrations/customMcpRegistry.ts',
  );

  assert.match(modal, /max-w-2xl/);
  assert.match(modal, /max-h-\[82vh\]/);
  assert.match(modal, /Create Custom Plugin/);
  assert.match(modal, /Sync tools/);
  assert.match(modal, /API key \/ bearer token/);
  assert.match(modal, /Dynamic OAuth/);
  assert.match(routes, /\/xroga-connect\/custom-mcp/);
  assert.match(runtime, /\/custom\/toolkits\/upsert/);
  assert.match(runtime, /\/custom\/toolkits\/sync/);
  assert.match(runtime, /\/custom\/toolkits\//);
  assert.match(registry, /userScopedCustomMcpSlug/);
  assert.match(registry, /assertCustomMcpOwnership/);
});

test('Custom MCP uses scoped sessions when explicitly selected', () => {
  const runtime = source(
    'backend/src/services/integrations/composioClient.ts',
  );
  const marketplace = source(
    'frontend/src/components/integrations/PluginMarketplace.tsx',
  );
  const detail = source(
    'frontend/src/components/integrations/PluginDetail.tsx',
  );

  assert.match(runtime, /body\.toolkits =/);
  assert.match(runtime, /explicitlyNamedCustom/);
  assert.match(marketplace, /customToolkit \? \{ toolkits: \[toolkit\] \}/);
  assert.match(detail, /customToolkit \? \{ toolkits: \[metadata\.slug\] \}/);
});

test('Plugin UI uses Xroga branding rather than exposing the upstream provider name', () => {
  const marketplace = source(
    'frontend/src/components/integrations/PluginMarketplace.tsx',
  );
  const detail = source(
    'frontend/src/components/integrations/PluginDetail.tsx',
  );
  const modal = source(
    'frontend/src/components/integrations/AddPluginModal.tsx',
  );

  for (const ui of [marketplace, detail, modal]) {
    assert.doesNotMatch(ui, />[^<{]*Composio[^<{]*</);
  }

  assert.match(marketplace, /Xroga Apps/);
  assert.match(detail, /Xroga Apps/);
});

test('real use-case showcase keeps the requested cyan-violet theme-aware treatment', () => {
  const detail = source(
    'frontend/src/components/integrations/PluginDetail.tsx',
  );
  const css = source('frontend/src/app/globals.css');

  assert.match(detail, /Real use cases/);
  assert.match(detail, /xv-plugin-usecase-card/);
  assert.match(detail, /groundedUseCasePrompt/);
  assert.match(css, /#0ed2da/);
  assert.match(css, /#5f29c7/);
  assert.match(css, /color-mix\(in srgb, var\(--surface-raised\)/);
  assert.match(css, /background-size: 50px 100%/);
});
