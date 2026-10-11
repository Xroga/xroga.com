import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PUBLIC_URL_INVENTORY } from './publicUrlInventory';

test('OS preview routes are inventoried as private and never indexable', () => {
  const expected = new Map([
    ['/os-preview', 'PRIVATE'],
    ['/os-preview/[section]', 'PRIVATE'],
    ['/os-preview/journey', 'PRIVATE'],
    ['/os-preview/rich-results', 'PRIVATE'],
    ['/os-preview/access-denied', 'PRIVATE'],
    ['/os-preview/founder', 'PRIVATE'],
  ]);
  for (const [path, classification] of expected) {
    const record = PUBLIC_URL_INVENTORY.find((item) => item.path === path);
    assert.equal(record?.classification, classification, path);
    assert.equal(record?.sitemap, false, path);
    assert.equal(record?.canonical, null, path);
  }
});
