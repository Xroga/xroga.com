import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  canUserAccessComposioToolkit,
} from '../../../backend/src/services/integrations/composioClient';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

test('Discover uses a compact Installed shelf instead of connected cards', () => {
  const marketplace = source('frontend/src/components/integrations/PluginMarketplace.tsx');
  const shelf = source('frontend/src/components/integrations/InstalledPluginsShelf.tsx');

  assert.match(marketplace, /InstalledPluginsShelf/);
  assert.match(shelf, />\s*Installed\s*</);
  assert.match(shelf, /onMouseEnter/);
  assert.match(shelf, /Click to manage/);
  assert.match(shelf, /Default permission/);
});

test('Plugin permission policy is persisted and enforced for ordinary writes', () => {
  const routes = source('backend/src/routes/integrations.ts');
  const service = source('backend/src/services/integrations/pluginPermissionPolicy.ts');
  const actions = source('backend/src/services/integrations/businessAction.ts');
  const client = source('frontend/src/lib/xrogaConnect.ts');

  assert.match(routes, /\/xroga-connect\/permission-policy/);
  assert.match(service, /always_ask/);
  assert.match(service, /read_only/);
  assert.match(service, /low_risk/);
  assert.match(actions, /getUserPluginPermissionMode/);
  assert.match(actions, /permissionMode !==[\s\S]*'low_risk'/);
  assert.match(client, /permissionPolicy:/);
});

test('Plugin details show live provider permission scopes', () => {
  const detail = source('frontend/src/components/integrations/PluginDetail.tsx');

  assert.match(detail, /Provider permissions/);
  assert.match(detail, /tools\.flatMap\(\(tool\) => tool\.scopes/);
  assert.match(detail, /read\/write\/sensitive classification/);
});

test('upstream internal toolkits stay hidden from the Xroga Apps directory', () => {
  assert.equal(canUserAccessComposioToolkit('alice-user', 'composio'), false);
  assert.equal(canUserAccessComposioToolkit('alice-user', 'composio_search'), false);
  assert.equal(canUserAccessComposioToolkit('alice-user', 'code_interpreter'), false);
  assert.equal(canUserAccessComposioToolkit('alice-user', 'gmail'), true);
});

test('permission choices use honest Xroga approval wording', () => {
  const shelf = source('frontend/src/components/integrations/InstalledPluginsShelf.tsx');

  assert.match(shelf, /Every state-changing Plugin action asks for confirmation/);
  assert.match(shelf, /Every external change asks for confirmation/);
  assert.match(shelf, /sensitive or uncertain actions still ask first/);
  assert.doesNotMatch(shelf, /Composio/);
});


test('no-auth apps stay Ready without appearing as Installed connections', () => {
  const catalog = source('frontend/src/lib/pluginCatalog.ts');
  const marketplace = source('frontend/src/components/integrations/PluginMarketplace.tsx');

  assert.match(catalog, /connected: Boolean\(options\.connected\)/);
  assert.doesNotMatch(catalog, /connected: Boolean\(options\.connected \|\| toolkit\.noAuth\)/);
  assert.doesNotMatch(
    marketplace,
    /plugin\.connected \|\|\s*plugin\.noAuth \|\|\s*plugin\.connectionState === 'needs_attention'/,
  );
});
