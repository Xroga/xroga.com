import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  composioLogoUrl,
  pluginSearchScore,
  type RuntimePlugin,
} from './pluginCatalog';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

function plugin(overrides: Partial<RuntimePlugin>): RuntimePlugin {
  return {
    id: 'slack',
    name: 'Slack',
    description: 'Messaging for teams',
    category: 'Communication',
    source: 'composio',
    connected: false,
    toolkit: 'slack',
    ...overrides,
  };
}

test('Step 4 uses the official Composio logo CDN and never guesses a domain', () => {
  assert.equal(composioLogoUrl('slack'), 'https://logos.composio.dev/api/slack');

  const logoSource = source('frontend/src/lib/integrationLogos.ts');
  assert.doesNotMatch(logoSource, /google\.com\/s2\/favicons/);
  assert.doesNotMatch(logoSource, /slugToDomain/);
});

test('Plugin search ranks exact brand matches above capability-only matches', () => {
  const exact = plugin({ name: 'Slack', toolkit: 'slack' });
  const semantic = plugin({
    id: 'teams',
    name: 'Microsoft Teams',
    toolkit: 'microsoft_teams',
    description: 'Send Slack-like team messages',
  });

  const semanticSet = new Set(['microsoft_teams']);
  assert.ok(
    pluginSearchScore(exact, 'slack', semanticSet) >
      pluginSearchScore(semantic, 'slack', semanticSet),
  );
});

test('Step 4 makes Composio the canonical browsable catalog', () => {
  const route = source('backend/src/routes/integrations.ts');
  const client = source('frontend/src/lib/xrogaConnect.ts');
  const marketplace = source('frontend/src/components/integrations/PluginMarketplace.tsx');

  assert.match(route, /\/xroga-connect\/catalog/);
  assert.match(route, /listComposioCatalog/);
  assert.match(client, /catalog:/);
  assert.match(client, /catalogCategories:/);
  assert.match(client, /catalogToolkit:/);
  assert.match(marketplace, /catalogTotal\.toLocaleString\(\)/);
  assert.match(marketplace, /Show more Plugins/);
});

test('search results render before browse navigation and use live capability search', () => {
  const marketplace = source('frontend/src/components/integrations/PluginMarketplace.tsx');
  const searchIndex = marketplace.indexOf('Search results');
  const navIndex = marketplace.indexOf('aria-label="Plugin views"');

  assert.ok(searchIndex >= 0);
  assert.ok(navIndex >= 0);
  assert.ok(searchIndex < navIndex);
  assert.match(marketplace, /xrogaConnect\.search\(clean/);
  assert.match(marketplace, /pluginSearchScore/);
});

test('every Plugin detail can load full live actions, triggers and Composio skills', () => {
  const detail = source('frontend/src/components/integrations/PluginDetail.tsx');

  assert.match(detail, /fetchAllTools/);
  assert.match(detail, /catalogTools/);
  assert.match(detail, /fetchAllTriggers/);
  assert.match(detail, /catalogTriggers/);
  assert.match(detail, /Skills & task planning/);
  assert.match(detail, /recommendedPlanSteps/);
  assert.match(detail, /knownPitfalls/);
  assert.match(detail, /Advanced · all raw actions/);
  assert.match(detail, /toolDetails/);
  assert.match(detail, /Input schema/);
  assert.match(detail, /Output schema/);
});

test('Composio runtime remains server-authoritative and does not preload every tool', () => {
  const composio = source('backend/src/services/integrations/composioClient.ts');

  assert.match(composio, /search:\s*\{\s*enable:\s*true/);
  assert.match(composio, /enable_multi_execute:\s*false/);
  assert.match(composio, /enable_connection_removal:\s*false/);
  assert.match(composio, /classifyComposioToolRisk/);
  assert.match(composio, /COMPOSIO_ACTION_CONFIRMATION_REQUIRED/);
});

test('Xroga AI runtime still routes connected-app reads and actions through Composio', () => {
  const phase1 = source('backend/src/routes/phase1.ts');
  const businessRead = source('backend/src/services/integrations/businessRead.ts');
  const businessAction = source('backend/src/services/integrations/businessAction.ts');

  assert.match(phase1, /readBusinessData/);
  assert.match(phase1, /prepareBusinessAction/);
  assert.match(businessRead, /searchComposioTools/);
  assert.match(businessRead, /executeComposioReadTool/);
  assert.match(businessAction, /searchComposioActionTools/);
  assert.match(businessAction, /executeComposioActionTool/);
});

test('full action schemas are metadata-only and loaded on demand', () => {
  const route = source('backend/src/routes/integrations.ts');
  const client = source('frontend/src/lib/xrogaConnect.ts');

  assert.match(route, /\/xroga-connect\/tool-details\/:toolSlug/);
  assert.match(route, /getComposioToolDetails/);
  assert.match(client, /toolDetails:/);
});
