import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  PLUGIN_CATEGORY_GROUPS,
  catalogPrimaryCategory,
  groundedUseCasePrompt,
} from './pluginCatalog';
import type { XrogaConnectCatalogToolkit, XrogaConnectTool } from './xrogaConnect';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

function toolkit(
  overrides: Partial<XrogaConnectCatalogToolkit> = {},
): XrogaConnectCatalogToolkit {
  return {
    slug: 'example',
    name: 'Example',
    authSchemes: [],
    managedAuthSchemes: [],
    noAuth: false,
    categories: [],
    triggersCount: 0,
    toolsCount: 4,
    deprecated: false,
    ...overrides,
  };
}

test('Plugins expose a small human category system instead of raw provider category spam', () => {
  assert.deepEqual(
    PLUGIN_CATEGORY_GROUPS.slice(0, 5).map((item) => item.label),
    ['All', 'Productivity', 'Communication', 'Engineering', 'AI & Automation'],
  );

  assert.equal(
    catalogPrimaryCategory(
      toolkit({
        name: '3D Design Suite',
        categories: [
          { id: '3d-modeling', name: '3D Modeling' },
          { id: '3d-printing', name: '3D Printing' },
        ],
      }),
    ),
    'Design & Media',
  );

  const marketplace = source(
    'frontend/src/components/integrations/PluginMarketplace.tsx',
  );
  assert.match(marketplace, /DISCOVERY_SECTIONS\.map/);
  assert.match(marketplace, /Developer Tools/);
  assert.match(marketplace, /Business & Operations/);
  assert.match(marketplace, /Small Business/);
  assert.match(marketplace, /Creativity/);
  assert.match(marketplace, /Education & Research/);
  assert.match(marketplace, /Scientific Research/);
  assert.match(marketplace, /Security/);
  assert.match(marketplace, /Finance/);
  assert.match(marketplace, /Healthcare/);
  assert.match(marketplace, /Travel/);
  assert.match(marketplace, /Entertainment/);
  assert.match(marketplace, /aria-expanded=\{expanded\}/);
  assert.doesNotMatch(marketplace, /categories\.slice\(0, 10\)/);
});

test('expandable category sections query the complete catalog through server-side Xroga groups', () => {
  const route = source('backend/src/routes/integrations.ts');
  const service = source(
    'backend/src/services/integrations/composioClient.ts',
  );
  const client = source('frontend/src/lib/xrogaConnect.ts');

  assert.match(route, /listComposioCatalogGroup/);
  assert.match(route, /'design-media'/);
  assert.match(route, /'education-research'/);
  assert.match(route, /'scientific-research'/);
  assert.match(route, /'security'/);
  assert.match(route, /'healthcare'/);
  assert.match(route, /'travel'/);
  assert.match(route, /'entertainment'/);
  assert.match(service, /xrogaCatalogGroupFor/);
  assert.match(service, /catalog:group:/);
  assert.match(client, /group\?:/);

  const marketplace = source(
    'frontend/src/components/integrations/PluginMarketplace.tsx',
  );
  assert.match(marketplace, /loadDiscoverySection/);
  assert.match(marketplace, /limit: 250/);
  assert.match(marketplace, /while \(cursor && pages < 20\)/);
});

test('search result mode stays above browse navigation', () => {
  const marketplace = source(
    'frontend/src/components/integrations/PluginMarketplace.tsx',
  );
  const results = marketplace.indexOf('Search results');
  const navigation = marketplace.indexOf('aria-label="Plugin views"');

  assert.ok(results >= 0);
  assert.ok(navigation >= 0);
  assert.ok(results < navigation);
  assert.match(marketplace, /exact brands first, then capability matches/);
});

test('user-facing Plugin surfaces keep the upstream provider brand private', () => {
  const marketplace = source(
    'frontend/src/components/integrations/PluginMarketplace.tsx',
  );
  const detail = source(
    'frontend/src/components/integrations/PluginDetail.tsx',
  );

  const forbidden = [
    'live Composio catalogue',
    'current Composio integrations',
    'Composio action catalogue',
    'Composio’s live tool search',
    'current live Composio catalogue',
    'Composio AI-action connection',
  ];

  for (const phrase of forbidden) {
    assert.equal(marketplace.includes(phrase), false, phrase);
    assert.equal(detail.includes(phrase), false, phrase);
  }
});

test('every Plugin can render grounded real use cases from current actions', () => {
  const tool: XrogaConnectTool = {
    slug: 'EXAMPLE_SEARCH_RECORDS',
    toolkit: 'example',
    name: 'Search records',
    description: 'Search records by text.',
    risk: 'read',
    requiresConfirmation: false,
  };

  assert.equal(
    groundedUseCasePrompt(tool, 'Example'),
    'Use Example to search records and show me the most relevant results.',
  );

  const detail = source(
    'frontend/src/components/integrations/PluginDetail.tsx',
  );
  const css = source('frontend/src/app/globals.css');

  assert.match(detail, /xv-plugin-usecases/);
  assert.match(detail, /size="micro"/);
  assert.match(detail, /groundedUseCasePrompt/);
  assert.match(css, /#0ed2da/);
  assert.match(css, /#5f29c7/);
  assert.match(css, /var\(--surface-raised\)/);
});

test('brand logos use toolkit metadata then the official toolkit logo CDN and never fake a brand', () => {
  const logo = source(
    'frontend/src/components/integrations/PluginBrandLogo.tsx',
  );

  assert.match(logo, /logo,/);
  assert.match(logo, /fallbackLogo,/);
  assert.match(logo, /composioLogoUrl\(toolkit\)/);
  assert.match(logo, /IntegrationLogo/);
  assert.doesNotMatch(logo, /<Plug/);
  assert.doesNotMatch(logo, /google\.com\/s2\/favicons/);
});

test('Add Plugin opens a compact anchored menu before deeper setup dialogs', () => {
  const marketplace = source(
    'frontend/src/components/integrations/PluginMarketplace.tsx',
  );

  assert.match(marketplace, /role="menu"/);
  assert.match(marketplace, /aria-label="Add Plugin"/);
  assert.match(marketplace, /w-\[270px\]/);
  assert.doesNotMatch(marketplace, /Find an Xroga App/);
  assert.match(marketplace, /Create MCP App/);
  assert.match(marketplace, /API key or webhook/);
  assert.match(marketplace, /open=\{addPluginOpen && addPluginMode !== 'menu'\}/);
  assert.match(marketplace, /aria-label="Add new Plugin"/);
  assert.doesNotMatch(marketplace, /router\.push\('\/dashboard\/integrations\/custom/);
});

test('upstream platform app is not exposed as an Xroga App', () => {
  const runtime = source(
    'backend/src/services/integrations/composioClient.ts',
  );

  assert.match(runtime, /clean === 'composio'/);
  assert.match(runtime, /return false/);
});

test('category shelves stay compact, prioritize key brands, and keep all leftovers in Other', () => {
  const marketplace = source(
    'frontend/src/components/integrations/PluginMarketplace.tsx',
  );

  assert.match(marketplace, /CATEGORY_PREVIEW_LIMIT = 6/);
  assert.match(marketplace, /creativity: \['canva', 'figma'\]/);
  assert.match(marketplace, /expanded \? plugins : plugins\.slice\(0, CATEGORY_PREVIEW_LIMIT\)/);
  assert.match(marketplace, /section\.id === 'other'/);
  assert.match(marketplace, /!claimedCategories\.has\(plugin\.category\)/);
  assert.match(marketplace, /if \(isExpanded\) next\.delete\(section\.id\)/);
  assert.match(marketplace, /else next\.add\(section\.id\)/);
  assert.match(marketplace, /lg:grid-cols-2/);
  assert.match(marketplace, /Explore/);
  assert.match(marketplace, /\.slice\(0, 6\)/);
});

test('discover hydrates the full app metadata in the background without rendering one giant grid', () => {
  const marketplace = source(
    'frontend/src/components/integrations/PluginMarketplace.tsx',
  );

  assert.match(marketplace, /while \(active && cursor && pages < 20\)/);
  assert.match(marketplace, /setCatalogItems\(\[\.\.\.hydrated\]\)/);
  assert.doesNotMatch(marketplace, />All Plugins</);
});

test('search and connected-management polish stay theme-safe and list-based', () => {
  const marketplace = source(
    'frontend/src/components/integrations/PluginMarketplace.tsx',
  );
  const css = source('frontend/src/app/globals.css');

  assert.match(marketplace, /xv-plugin-search-shell/);
  assert.match(marketplace, /ConnectedPluginList/);
  assert.match(marketplace, /PluginPermissionControl/);
  assert.match(css, /\.xv-plugin-search-shell/);
  assert.match(css, /body\.theme-black \.xv-plugin-search-shell/);
  assert.match(css, /body\.theme-gray \.xv-plugin-search-shell/);
  assert.match(css, /body\.theme-beige \.xv-plugin-search-shell/);
});

test('optional product credential shelf is removed from Plugins while the custom vault remains', () => {
  const marketplace = source(
    'frontend/src/components/integrations/PluginMarketplace.tsx',
  );

  assert.doesNotMatch(marketplace, /ConnectedServicesSection/);
  assert.doesNotMatch(marketplace, /Optional product credentials/);
  assert.match(marketplace, /CustomCredentialsSection/);
});