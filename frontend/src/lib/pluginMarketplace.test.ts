import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canonicalPluginId,
  mergePluginRecords,
  pluginCategoryFor,
  pluginFromSeed,
  pluginFromToolkit,
  rankPlugins,
  seedForPlugin,
} from './pluginMarketplace';

test('canonical Plugin IDs collapse provider aliases', () => {
  assert.equal(canonicalPluginId('google_calendar'), 'google-calendar');
  assert.equal(canonicalPluginId('GoogleCalendar'), 'google-calendar');
  assert.equal(canonicalPluginId('quickbooks_online'), 'quickbooks');
  assert.equal(canonicalPluginId('cloudflare_r2'), 'cloudflare');
});

test('human Plugin categories hide raw provider taxonomy', () => {
  assert.equal(pluginCategoryFor('Developer & Code', 'github', 'GitHub'), 'Engineering');
  assert.equal(pluginCategoryFor('E-commerce & Payments', 'shopify', 'Shopify'), 'Commerce');
  assert.equal(pluginCategoryFor('Finance & Banking', 'xero', 'Xero'), 'Finance');
});

test('native and Composio records merge into one canonical Plugin', () => {
  const nativeSeed = seedForPlugin('github');
  assert.ok(nativeSeed);

  const native = pluginFromSeed(nativeSeed, {
    connected: false,
    resolved: true,
  });

  const remote = pluginFromToolkit({
    toolkit: 'github',
    name: 'GitHub',
    description: 'Repository tools',
    connected: true,
    logo: 'https://example.test/github.svg',
  });

  const merged = mergePluginRecords([native], [remote]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 'github');
  assert.equal(merged[0].source, 'native');
  assert.equal(merged[0].connected, true);
  assert.equal(merged[0].logo, 'https://example.test/github.svg');
});

test('intent search ranks relevant Plugins without requiring an exact app name', () => {
  const quickBooksSeed = seedForPlugin('quickbooks');
  const stripeSeed = seedForPlugin('stripe');
  const githubSeed = seedForPlugin('github');
  assert.ok(quickBooksSeed);
  assert.ok(stripeSeed);
  assert.ok(githubSeed);

  const results = rankPlugins(
    [
      pluginFromSeed(githubSeed),
      pluginFromSeed(stripeSeed),
      pluginFromSeed(quickBooksSeed),
    ],
    'customer invoice',
  );

  assert.equal(results.some((plugin) => plugin.id === 'quickbooks'), true);
  assert.equal(results.some((plugin) => plugin.id === 'stripe'), true);
  assert.equal(results.some((plugin) => plugin.id === 'github'), false);
});

test('live toolkit metadata carries connection and capability state', () => {
  const plugin = pluginFromToolkit(
    {
      toolkit: 'gmail',
      name: 'Gmail',
      connected: true,
      logo: 'https://example.test/gmail.svg',
    },
    [
      { slug: 'GMAIL_SEARCH', toolkit: 'gmail' },
      { slug: 'GMAIL_GET', toolkit: 'gmail' },
    ],
  );

  assert.equal(plugin.id, 'gmail');
  assert.equal(plugin.connected, true);
  assert.equal(plugin.capabilityCount, 2);
  assert.equal(plugin.category, 'Productivity');
});
