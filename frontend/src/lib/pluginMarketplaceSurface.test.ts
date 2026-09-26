import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const panel = read('../components/integrations/IntegrationsPanel.tsx');
const marketplace = read('../components/integrations/PluginMarketplace.tsx');
const route = read('../app/(shell)/dashboard/integrations/page.tsx');
const settings = read('../components/settings/SettingsView.tsx');

test('Plugins is the user-facing marketplace without the old ship stack', () => {
  assert.match(panel, /PluginMarketplace/);
  assert.doesNotMatch(panel, /ConnectShipWizard/);
  assert.doesNotMatch(panel, /UserOwnedPublishPanel/);
  assert.doesNotMatch(panel, /wishlist Plugins/);
});

test('Plugins no longer gates the marketplace on GitHub', () => {
  assert.match(marketplace, /No Plugins connected yet/);
  assert.match(marketplace, /api\.github\.status/);
  assert.doesNotMatch(marketplace, /Connect GitHub to start building/);
  assert.doesNotMatch(marketplace, /if \(!githubConnected\)/);
});

test('Plugins exposes discovery, connected, developer, custom and responsive catalogue UI', () => {
  for (const label of ['Discover', 'Connected', 'Developer', 'Custom', 'Popular', 'Categories', 'All Plugins']) {
    assert.equal(marketplace.includes(label), true, label);
  }
  assert.match(marketplace, /sm:grid-cols-2 xl:grid-cols-3/);
  assert.match(route, /max-w-7xl/);
});

test('Settings links to the canonical Plugins marketplace instead of embedding it', () => {
  assert.match(settings, /Open Plugins/);
  assert.match(settings, /href="\/dashboard\/integrations"/);
  assert.doesNotMatch(settings, /<IntegrationsPanel/);
});
