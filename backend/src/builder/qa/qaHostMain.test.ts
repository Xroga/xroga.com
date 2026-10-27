import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';

import { signRequest } from '../../workers/browserCoordinator.js';
import { createQaHostApp } from './qaHostMain.js';
import type { QaDriver } from './types.js';

const SECRET = 'a'.repeat(40);
const plan = { version: 1, checks: [{ id: 'a', title: 'a', category: 'content', viewport: 'desktop', required: true, steps: [{ op: 'goto', path: '/' }], derivedFrom: 't' }], notChecked: [] };

describe('isolated QA host entry point', () => {
  it('refuses to start without a signing secret of at least 32 bytes', () => {
    assert.throws(() => createQaHostApp({} as NodeJS.ProcessEnv), /32 bytes/);
    assert.throws(() => createQaHostApp({ XROGA_QA_HOST_SECRET: 'short' } as NodeJS.ProcessEnv), /32 bytes/);
  });

  it('tests only configured preview hosts, serves health, and answers 503 (not run) when its browser slots are full', async () => {
    let release: () => void = () => undefined;
    const slow: QaDriver = { name: 'slow', browserVersion: async () => null, open: () => new Promise((resolve) => { release = () => resolve({ goto: async () => ({ status: 200 }) } as never); }), close: async () => undefined };
    const app = createQaHostApp({ XROGA_QA_HOST_SECRET: SECRET, XROGA_QA_HOST_ALLOWED_SUFFIXES: '.preview.test', XROGA_QA_HOST_MAX_CONCURRENT: '1' } as NodeJS.ProcessEnv, async () => slow);
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      assert.equal((await fetch(`${base}/healthz`)).status, 200);
      const send = (baseUrl: string) => { const body = JSON.stringify({ version: 1, baseUrl, plan, environment: { database: false } }); return fetch(`${base}/qa`, { method: 'POST', headers: signRequest(SECRET, 'POST', '/qa', body), body }); };
      assert.equal((await send('https://other.example')).status, 403);
      const first = send('https://a.preview.test');
      for (let i = 0; i < 50; i++) { await new Promise((r) => setTimeout(r, 10)); }
      assert.equal((await send('https://a.preview.test')).status, 503, 'a second run while the only slot is busy');
      release();
      await first.catch(() => undefined);
    } finally {
      await new Promise<void>((done) => server.close(() => done()));
    }
  });
});
