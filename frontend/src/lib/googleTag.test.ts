import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const LAYOUT = read('../app/layout.tsx');
const TAG = read('../components/analytics/GoogleTag.tsx');
const CONFIG = read('../../next.config.mjs');

test('the requested Google tag is installed once at the root', () => {
  assert.match(TAG, /G-WJJQ8RPJHE/);
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

test('the content security policy permits the Google tag and GA4 collection endpoints', () => {
  assert.match(CONFIG, /scriptSources[\s\S]*https:\/\/www\.googletagmanager\.com/);
  assert.match(CONFIG, /connectSources[\s\S]*https:\/\/\*\.google-analytics\.com/);
  assert.match(CONFIG, /connectSources[\s\S]*https:\/\/\*\.analytics\.google\.com/);
  assert.match(CONFIG, /connectSources[\s\S]*https:\/\/www\.googletagmanager\.com/);
});
