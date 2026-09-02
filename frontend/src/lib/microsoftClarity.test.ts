import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const LAYOUT = read('../app/layout.tsx');
const CLARITY = read('../components/analytics/MicrosoftClarity.tsx');
const CONFIG = read('../../next.config.mjs');

test('Microsoft Clarity is installed exactly once at the root', () => {
  assert.match(CLARITY, /yc1lzmq4k4/);
  assert.match(CLARITY, /https:\/\/www\.clarity\.ms\/tag\//);
  assert.match(CLARITY, /window, document, "clarity", "script"/);
  assert.equal([...LAYOUT.matchAll(/<MicrosoftClarity \/>/g)].length, 1);
  assert.equal([...LAYOUT.matchAll(/import \{ MicrosoftClarity \}/g)].length, 1);
});

test('Clarity uses the non-blocking Next script loader', () => {
  assert.match(CLARITY, /from 'next\/script'/);
  assert.match(CLARITY, /id="xroga-microsoft-clarity"/);
  assert.match(CLARITY, /strategy="afterInteractive"/);
  assert.doesNotMatch(CLARITY, /<script/);
});

test('the content security policy permits Clarity collection', () => {
  assert.match(CONFIG, /scriptSources[\s\S]*https:\/\/www\.clarity\.ms/);
  assert.match(CONFIG, /scriptSources[\s\S]*https:\/\/\*\.clarity\.ms/);
  assert.match(CONFIG, /connectSources[\s\S]*https:\/\/\*\.clarity\.ms/);
  assert.match(CONFIG, /connectSources[\s\S]*https:\/\/c\.bing\.com/);
});
