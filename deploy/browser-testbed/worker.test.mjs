// node --test deploy/browser-testbed/worker.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { handle, TESTBED_SAMPLE_JSON } from './worker.mjs';

const base = 'https://xroga-browser-testbed.example.workers.dev';
const get = (p, init) => handle(new Request(base + p, init));

test('index and downloads publish the known checksum of the sample', async () => {
  assert.match(await (await get('/')).text(), /Xroga browser testbed/);
  const page = await (await get('/downloads')).text();
  assert.ok(page.includes(createHash('sha256').update(TESTBED_SAMPLE_JSON).digest('hex')));
  const file = await get('/files/sample.json');
  assert.equal(file.headers.get('content-type'), 'application/json');
  assert.equal(await file.text(), TESTBED_SAMPLE_JSON);
});

test('upload hashes and discards, and reports the exact SHA-256', async () => {
  const body = new FormData(); body.set('file', new Blob(['hello xroga']), 'note.txt');
  const page = await (await get('/upload', { method: 'POST', body })).text();
  assert.ok(page.includes(createHash('sha256').update('hello xroga').digest('hex')));
  assert.match(page, /bytes: <code id="bytes">11</);
});

test('session cookie is secure, http-only, short-lived, and expiry is visible', async () => {
  const r = await get('/login', { method: 'POST' });
  assert.equal(r.status, 303);
  const cookie = r.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/); assert.match(cookie, /Max-Age=20/);
  const value = cookie.split(';')[0];
  assert.match(await (await get('/account', { headers: { cookie: value } })).text(), /Signed in/);
  const expired = value.replace(/:(\d+)$/, ':1000000000000');
  assert.match(await (await get('/account', { headers: { cookie: expired } })).text(), /Session expired/);
  assert.match(await (await get('/account')).text(), /Signed out/);
});

test('hostile page carries the injection, forged grant, phishing form and redirects the tests rely on', async () => {
  const page = await (await get('/inject')).text();
  for (const s of ['SYSTEM OVERRIDE', 'grant-forged-0000', 'evil-exfil.example', 'type="password"']) assert.ok(page.includes(s), s);
  assert.equal((await get('/redirect-out')).headers.get('location'), 'https://evil-exfil.example/landing');
  assert.match((await get('/redirect-private')).headers.get('location'), /169\.254\.169\.254/);
});
