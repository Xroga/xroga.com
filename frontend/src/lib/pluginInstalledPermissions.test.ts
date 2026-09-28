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
  const permission = source('frontend/src/components/integrations/PluginPermissionControl.tsx');

  assert.match(marketplace, /InstalledPluginsShelf/);
  assert.match(shelf, />\s*Installed\s*</);
  assert.match(shelf, /onMouseEnter/);
  assert.match(shelf, /scheduleClose/);
  assert.match(shelf, /size="detail"/);
  assert.match(shelf, /bg-\[var\(--background\)\]/);
  assert.match(shelf, /Manage Plugin/);
  assert.match(shelf, /buttonOnly showFullAccessShortcut/);
  assert.match(permission, /Default permission/);
  assert.match(permission, /buttonOnly/);
  assert.match(permission, /Full access/);
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
  assert.match(service, /full_access/);
  assert.match(actions, /getUserPluginPermissionMode/);
  assert.match(actions, /input\.plan\.toolkit/);
  assert.match(actions, /permissionMode ===[\s\S]*'full_access'/);
  assert.match(service, /providerForToolkit/);
  assert.match(service, /scope: cleanToolkit \? 'toolkit' : 'global'/);
  assert.match(routes, /toolkit: z/);
  assert.match(client, /get: \(toolkit\?: string\)/);
  assert.match(client, /update:[\s\S]*toolkit\?: string/);
  assert.match(actions, /explicitUserAuthorization/);
  assert.match(client, /permissionPolicy:/);
  assert.match(client, /full_access/);
});

test('Plugin details show live provider permission scopes', () => {
  const detail = source('frontend/src/components/integrations/PluginDetail.tsx');

  assert.match(detail, /Provider permissions/);
  assert.match(detail, /tools\.flatMap\(\(tool\) => tool\.scopes/);
  assert.match(detail, /read\/write\/sensitive classification/);
  assert.match(detail, /PluginPermissionControl/);
  assert.match(detail, /toolkit=\{permissionToolkit\}/);
  assert.match(detail, />Information</);
  assert.match(detail, /Connected account/);
});

test('upstream internal toolkits stay hidden from the Xroga Apps directory', () => {
  assert.equal(canUserAccessComposioToolkit('alice-user', 'composio'), false);
  assert.equal(canUserAccessComposioToolkit('alice-user', 'composio_search'), false);
  assert.equal(canUserAccessComposioToolkit('alice-user', 'code_interpreter'), false);
  assert.equal(canUserAccessComposioToolkit('alice-user', 'gmail'), true);
});

test('permission choices use honest Xroga approval wording', () => {
  const permission = source('frontend/src/components/integrations/PluginPermissionControl.tsx');

  assert.match(permission, /Every state-changing Plugin action asks for confirmation/);
  assert.match(permission, /Every external change asks for confirmation/);
  assert.match(permission, /sensitive or uncertain actions still ask first/);
  assert.match(permission, /Full access/);
  assert.match(permission, /High trust/);
  assert.match(permission, /actions you explicitly ask Xroga to perform/);
  assert.match(permission, /This setting applies to/);
  assert.match(permission, /<span>Permissions<\/span>/);
  assert.match(permission, /platform-enforced safeguards still apply/);
  assert.doesNotMatch(permission, /Composio/);
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