import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PUBLIC_URL_INVENTORY } from './publicUrlInventory';

test('OS preview routes are inventoried without becoming indexable', () => {
  const expected = new Map([
    ['/os-preview', 'PUBLIC_NOINDEX'],
    ['/os-preview/[section]', 'PUBLIC_NOINDEX'],
    ['/os-preview/journey', 'PUBLIC_NOINDEX'],
    ['/os-preview/access-denied', 'PUBLIC_NOINDEX'],
    ['/os-preview/founder', 'PRIVATE'],
  ]);
  for (const [path, classification] of expected) {
    const record = PUBLIC_URL_INVENTORY.find((item) => item.path === path);
    assert.equal(record?.classification, classification, path);
    assert.equal(record?.sitemap, false, path);
    assert.equal(record?.canonical, null, path);
  }
});
