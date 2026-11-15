import assert from 'node:assert/strict';
import { test } from 'node:test';
import { INTEGRATIONS, INTEGRATION_CATEGORIES } from './integrations';
import {
  PUBLIC_INTEGRATION_CARDS,
  PUBLIC_INTEGRATION_CATEGORIES,
  PUBLIC_INTEGRATION_COUNT,
  matchesPublicIntegrationCategory,
} from './publicIntegrationsDirectory';

test('public integrations list comes from the complete canonical technology catalog', () => {
  assert.equal(PUBLIC_INTEGRATION_COUNT, INTEGRATIONS.length);
  assert.equal(PUBLIC_INTEGRATION_CARDS.length, INTEGRATIONS.length);
  assert.ok(PUBLIC_INTEGRATION_COUNT > 700);
  assert.deepEqual(PUBLIC_INTEGRATION_CARDS.map(app => app.id), INTEGRATIONS.map(app => app.id));
  assert.equal(new Set(PUBLIC_INTEGRATION_CARDS.map(app => app.id)).size, PUBLIC_INTEGRATION_CARDS.length);
  for (const app of PUBLIC_INTEGRATION_CARDS) {
    assert.ok(app.name);
    assert.ok(app.description);
    assert.ok(app.href.startsWith('/dashboard/integrations/'));
    assert.ok(app.href.length > '/dashboard/integrations/'.length);
    assert.ok(['native', 'app-guide', 'technology'].includes(app.mode));
    assert.ok(app.capabilityHint);
    assert.ok(app.authHint);
  }
});

test('preserves all source category filters and requested subject groups', () => {
  const ids = new Set(PUBLIC_INTEGRATION_CATEGORIES.map(category => category.id));
  assert.equal(ids.size, PUBLIC_INTEGRATION_CATEGORIES.length);
  for (const source of INTEGRATION_CATEGORIES) {
    assert.ok(ids.has('source:' + source), 'source category missing: ' + source);
    const matches = PUBLIC_INTEGRATION_CARDS.filter(app =>
      matchesPublicIntegrationCategory(app, 'source:' + source));
    assert.equal(matches.length, INTEGRATIONS.filter(app => app.category === source).length);
  }
  for (const requested of [
    'All apps', 'Artificial Intelligence (AI)', 'Business Management', 'Commerce',
    'Communication', 'CRM', 'Data Analytics', 'Databases', 'Developer Tools',
    'Entertainment', 'File Storage', 'Help Desk & Support', 'Human Resources',
    'Infrastructure & Cloud', 'Language Tools', 'Learning & Education',
  ]) {
    assert.ok(PUBLIC_INTEGRATION_CATEGORIES.some(option => option.label === requested), 'missing UX category: ' + requested);
  }
});

test('app cards navigate to existing generic detail route, including Shopify', () => {
  const shopify = PUBLIC_INTEGRATION_CARDS.find(app => app.id === 'shopify');
  const github = PUBLIC_INTEGRATION_CARDS.find(app => app.id === 'github');
  assert.equal(shopify?.href, '/dashboard/integrations/shopify');
  assert.equal(github?.href, '/dashboard/integrations/github');
  assert.equal(github?.mode, 'native');
  assert.ok(shopify?.mode !== 'technology');
});

test('static catalog status is never treated as authenticated user connection', () => {
  const staticConnected = INTEGRATIONS.filter(app => app.status === 'connected');
  assert.ok(staticConnected.length > 0, 'fixture requires a legacy connected catalog value');
  for (const source of staticConnected) {
    const publicCard = PUBLIC_INTEGRATION_CARDS.find(item => item.id === source.id);
    assert.ok(publicCard);
    assert.ok(!Object.hasOwn(publicCard, 'connected'));
    assert.ok(!publicCard.description.includes('your account is connected'));
    assert.ok(publicCard.capabilityHint !== 'Connected');
  }
});
