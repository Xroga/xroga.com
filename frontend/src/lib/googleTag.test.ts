import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const LAYOUT = read('../app/layout.tsx');
const TAG = read('../components/analytics/GoogleTag.tsx');

test('the requested Google tag is installed once at the root', () => {
  assert.match(TAG, /G-7JFW03G2LH/);
  assert.match(TAG, /googletagmanager\.com\/gtag\/js\?id=/);
  assert.match(TAG, /window\.dataLayer = window\.dataLayer \|\| \[\]/);
  assert.match(TAG, /gtag\('config', '\$\{GOOGLE_TAG_ID\}'\)/);
  assert.equal([...LAYOUT.matchAll(/<GoogleTag \/>/g)].length, 1);
  assert.equal([...LAYOUT.matchAll(/import \{ GoogleTag \}/g)].length, 1);
});

test('analytics uses the non-blocking Next script loader', () => {
  assert.match(TAG, /from 'next\/script'/);
  assert.equal([...TAG.matchAll(/strategy="afterInteractive"/g)].length, 2);
  assert.match(TAG, /id="xroga-google-tag"/);
});
