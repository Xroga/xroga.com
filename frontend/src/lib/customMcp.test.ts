import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  canUserAccessComposioToolkit,
  canUserAccessComposioToolSlug,
  xrogaCustomToolkitPrefix,
} from '../../../backend/src/services/integrations/composioClient';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

test('Custom MCP namespaces are stable and isolated per Xroga user', () => {
  const alice = xrogaCustomToolkitPrefix('alice-user');
  const bob = xrogaCustomToolkitPrefix('bob-user');

  assert.notEqual(alice, bob);
  assert.match(alice, /^custom_xroga_[a-f0-9]{12}_$/);

  const aliceToolkit = `${alice}internal_crm`;
  const bobToolkit = `${bob}internal_crm`;

  assert.equal(canUserAccessComposioToolkit('alice-user', aliceToolkit), true);
  assert.equal(canUserAccessComposioToolkit('alice-user', bobToolkit), false);
  assert.equal(canUserAccessComposioToolkit('alice-user', 'gmail'), true);
  assert.equal(canUserAccessComposioToolkit('alice-user', 'custom_unscoped'), false);

  assert.equal(
    canUserAccessComposioToolSlug('alice-user', `${aliceToolkit}_search_contacts`),
    true,
  );
  assert.equal(
    canUserAccessComposioToolSlug('alice-user', `${bobToolkit}_search_contacts`),
    false,
  );
});

test('Custom MCP lifecycle creates auth configs and supports sync/delete', () => {
  const runtime = source('backend/src/services/integrations/composioClient.ts');
  const routes = source('backend/src/routes/integrations.ts');
  const client = source('frontend/src/lib/xrogaConnect.ts');

  assert.match(runtime, /\/custom\/toolkits\/upsert/);
  assert.match(runtime, /is_enabled_for_tool_router:\s*true/);
  assert.match(runtime, /authScheme:[\s\S]*'API_KEY'/);
  assert.match(runtime, /'DCR_OAUTH'/);
  assert.match(runtime, /\/custom\/toolkits\/sync/);
  assert.match(runtime, /method:\s*'DELETE'/);

  assert.match(routes, /\/xroga-connect\/custom-mcp/);
  assert.match(routes, /filterComposioCatalogForUser/);
  assert.match(routes, /canUserAccessComposioToolkit/);

  assert.match(client, /customMcp:\s*\{/);
  assert.match(client, /create:/);
  assert.match(client, /sync:/);
  assert.match(client, /remove:/);
});

test('Plugins UI exposes compact Custom MCP creation without a full-screen redirect', () => {
  const marketplace = source('frontend/src/components/integrations/PluginMarketplace.tsx');
  const manager = source('frontend/src/components/integrations/CustomMcpManager.tsx');

  assert.match(marketplace, /className="max-w-\[460px\]"/);
  assert.match(marketplace, /CustomMcpCreateForm/);
  assert.match(manager, /Custom MCP server/);
  assert.match(manager, /No authentication/);
  assert.match(manager, /API key/);
  assert.match(manager, /Dynamic Client Registration/);
  assert.match(manager, /Create Plugin/);
  assert.match(manager, /MCP tools synced/);
  assert.doesNotMatch(marketplace, /Custom MCP server[\s\S]{0,300}Unavailable/);
});

test('user-facing Plugin surfaces avoid upstream vendor branding', () => {
  const marketplace = source('frontend/src/components/integrations/PluginMarketplace.tsx');
  const detail = source('frontend/src/components/integrations/PluginDetail.tsx');
  const manager = source('frontend/src/components/integrations/CustomMcpManager.tsx');

  for (const file of [marketplace, detail, manager]) {
    assert.doesNotMatch(file, />[^<]*Composio[^<]*</);
  }
});
