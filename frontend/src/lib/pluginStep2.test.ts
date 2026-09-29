import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  PLUGIN_DEFINITIONS,
  canonicalPluginId,
  groupCapabilities,
  prettyToolName,
} from './pluginCatalog';
import type { XrogaConnectTool } from './xrogaConnect';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

test('Plugin aliases normalize to one canonical provider identity', () => {
  assert.equal(canonicalPluginId('Google Calendar'), 'google-calendar');
  assert.equal(canonicalPluginId('google_calendar'), 'google-calendar');
  assert.equal(canonicalPluginId('QuickBooks Online'), 'quickbooks');
  assert.equal(canonicalPluginId('GitHub App'), 'github');
});

test('Plugin capabilities are humanized and grouped without changing raw tool ids', () => {
  const tools: XrogaConnectTool[] = [
    {
      slug: 'GMAIL_SEARCH_MESSAGES',
      toolkit: 'gmail',
      description: 'Search email messages',
      risk: 'read',
      requiresConfirmation: false,
    },
    {
      slug: 'GMAIL_SEND_EMAIL',
      toolkit: 'gmail',
      description: 'Send an email message',
      risk: 'write',
      requiresConfirmation: false,
    },
    {
      slug: 'GMAIL_DELETE_MESSAGE',
      toolkit: 'gmail',
      description: 'Delete an email message',
      risk: 'destructive',
      requiresConfirmation: true,
    },
  ];

  const groups = groupCapabilities(tools);
  const flattened = groups.flatMap((group) => group.capabilities);

  assert.equal(prettyToolName(tools[0]!), 'Search messages');
  assert.equal(flattened.find((item) => item.rawToolSlug === 'GMAIL_SEND_EMAIL')?.risk, 'write');
  assert.equal(
    flattened.find((item) => item.rawToolSlug === 'GMAIL_DELETE_MESSAGE')?.requiresConfirmation,
    true,
  );
  assert.ok(groups.some((group) => group.name === 'Search & read'));
  assert.ok(groups.some((group) => group.name === 'Draft & send'));
});

test('curated Plugins have stable ids and never duplicate the same provider', () => {
  const ids = PLUGIN_DEFINITIONS.map((plugin) => plugin.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes('gmail'));
  assert.ok(ids.includes('github'));
  assert.ok(ids.includes('vercel'));
  assert.ok(ids.includes('supabase'));
});

test('Step 2 detail routing is explicit and Connect remains a separate action', () => {
  const marketplace = source('frontend/src/components/integrations/PluginMarketplace.tsx');
  const detail = source('frontend/src/components/integrations/PluginDetail.tsx');
  const route = source('frontend/src/app/(shell)/dashboard/integrations/[plugin]/page.tsx');

  assert.match(marketplace, /detailHref\(plugin\)/);
  assert.match(marketplace, /aria-label=\{\`Connect \$\{plugin\.name\}\`\}/);
  assert.match(detail, /Real use cases/);
  assert.match(detail, /Advanced · all raw actions/);
  assert.match(detail, /Permissions & safety/);
  assert.match(route, /PluginDetail pluginId=/);
});

test('Step 2 keeps connection removal conservative while Custom MCP now uses real lifecycle APIs', () => {
  const marketplace = source('frontend/src/components/integrations/PluginMarketplace.tsx');
  const detail = source('frontend/src/components/integrations/PluginDetail.tsx');
  const runtime = source('backend/src/services/integrations/composioClient.ts');

  assert.match(runtime, /enable_connection_removal:\s*false/);
  assert.match(detail, /definition\.source !== 'native'/);
  assert.match(marketplace, /Create MCP Plugin/);
  assert.match(marketplace, /CustomMcpCreateForm/);
  assert.match(runtime, /createUserCustomMcpToolkit/);
  assert.match(runtime, /syncUserCustomMcpToolkit/);
  assert.match(runtime, /deleteUserCustomMcpToolkit/);
});

test('Step 2 exposes metadata-only action discovery and connected toolkit listing', () => {
  const route = source('backend/src/routes/integrations.ts');
  const client = source('frontend/src/lib/xrogaConnect.ts');

  assert.match(route, /\/xroga-connect\/action-search/);
  assert.match(route, /searchComposioActionTools/);
  assert.match(route, /\/xroga-connect\/toolkits/);
  assert.match(route, /listConnectedComposioToolkits/);
  assert.match(client, /actionSearch:/);
  assert.match(client, /toolkits:/);
});