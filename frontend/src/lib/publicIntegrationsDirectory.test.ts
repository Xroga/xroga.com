import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PLUGIN_DEFINITIONS } from './pluginCatalog';
import { getIntegrationLogo } from './integrationLogos';
import {
  PUBLIC_INTEGRATION_CARDS,
  PUBLIC_INTEGRATION_CATEGORIES,
  PUBLIC_INTEGRATION_COUNT,
  matchesPublicIntegrationCategory,
} from './publicIntegrationsDirectory';

test('public fallback uses verified plugin definitions, not the unrelated generated technology list', () => {
  const source = PLUGIN_DEFINITIONS.filter(p => p.description.trim());
  assert.equal(PUBLIC_INTEGRATION_COUNT, source.length);
  assert.deepEqual(PUBLIC_INTEGRATION_CARDS.map(p => p.id), source.map(p => p.id));
  assert.equal(new Set(PUBLIC_INTEGRATION_CARDS.map(p => p.id)).size, source.length);
  for (const app of PUBLIC_INTEGRATION_CARDS) {
    const original = source.find(p => p.id === app.id);
    assert.ok(original);
    assert.equal(app.description, original.description.trim());
    assert.equal(app.logoUrl, getIntegrationLogo(app.id));
    assert.ok(!/A listed technology for software and workflow projects/i.test(app.description));
    assert.equal(app.href, '/dashboard/integrations/' + encodeURIComponent(app.id));
    assert.ok(!Object.hasOwn(app,'connected'));
    assert.ok(app.mode === 'native' || app.mode === 'app-guide');
  }
});

test('fallback category filters include all categories in the verified plugin definitions', () => {
  const ids = PUBLIC_INTEGRATION_CATEGORIES.map(c => c.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const original of new Set(PLUGIN_DEFINITIONS.map(p => p.category))) {
    assert.ok(ids.includes('source:' + original), 'missing category ' + original);
    const matches = PUBLIC_INTEGRATION_CARDS.filter(app =>
      matchesPublicIntegrationCategory(app, 'source:' + original));
    assert.ok(matches.every(app => app.sourceCategory === original));
  }
});

test('known plugin pages retain deep links and own summaries', () => {
  const shopify = PUBLIC_INTEGRATION_CARDS.find(p => p.id === 'shopify');
  const github = PUBLIC_INTEGRATION_CARDS.find(p => p.id === 'github');
  assert.equal(shopify?.href, '/dashboard/integrations/shopify');
  assert.equal(github?.href, '/dashboard/integrations/github');
  assert.equal(github?.mode,'native');
  assert.ok(shopify?.description?.length);
});
