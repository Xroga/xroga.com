import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';

import express from 'express';

import type { ReconcileReport } from '../storage/storageService.js';
import { createStorageReconcileRouter } from './storageReconcileScheduler.js';

const REPORT: ReconcileReport = {
  expiredReservations: 2, abandonedCleaned: 1, reverified: 3, deletionsFinished: 0,
  missingObjects: [{ objectId: 'secret-object-id' }], orphanKeys: ['tenant/key'], usageDrift: [], errors: [],
};

describe('scheduled Drive reconciliation', () => {
  let server: ReturnType<ReturnType<typeof express>['listen']>;
  let base = '';
  const env: Record<string, string | undefined> = {};
  let drive: { reconcile: (options: { limit?: number; scanOrphans?: boolean }) => Promise<ReconcileReport> } | null = null;
  const calls: Array<{ limit?: number; scanOrphans?: boolean }> = [];

  before(async () => {
    const app = express();
    app.use('/internal/storage', createStorageReconcileRouter({
      drive: () => drive,
      env: env as NodeJS.ProcessEnv,
      verify: async (authorization, config) => authorization === 'Bearer good-token' && config.audience === 'https://api.example/internal/storage/reconcile' && config.serviceAccountEmail === 'scheduler@project.iam.gserviceaccount.com',
    }));
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/internal/storage/reconcile`;
  });
  after(() => { server.close(); });

  const post = (authorization?: string) => fetch(base, { method: 'POST', headers: authorization ? { authorization } : {} });
  const enable = () => { Object.assign(env, { XROGA_STORAGE_RECONCILE_MODE: 'cloud', XROGA_STORAGE_RECONCILE_AUDIENCE: 'https://api.example/internal/storage/reconcile', XROGA_STORAGE_RECONCILE_SERVICE_ACCOUNT: 'scheduler@project.iam.gserviceaccount.com' }); };

  it('is off by default, and nothing is reconciled while it is off', async () => {
    drive = { reconcile: async (options) => { calls.push(options); return REPORT; } };
    assert.equal((await post('Bearer good-token')).status, 503);
    assert.equal(calls.length, 0);
  });

  it('refuses a missing, malformed or wrong token before touching Drive', async () => {
    enable();
    for (const header of [undefined, 'Bearer wrong', 'Basic good-token', 'good-token']) assert.equal((await post(header)).status, 401, String(header));
    assert.equal(calls.length, 0);
  });

  it('runs a bounded reconcile for the named scheduler and returns counts only', async () => {
    enable();
    const response = await post('Bearer good-token');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { expiredReservations: 2, abandonedCleaned: 1, reverified: 3, deletionsFinished: 0, missingObjects: 1, usageDrift: 0, errors: 0 });
    assert.deepEqual(calls, [{ limit: 200, scanOrphans: false }], 'bounded, and never scans the whole bucket');
  });

  it('reports an unconfigured Drive and a failing reconcile without leaking anything', async () => {
    enable();
    drive = null;
    assert.equal((await post('Bearer good-token')).status, 503);
    drive = { reconcile: async () => { throw new Error('connection string postgres://user:pass@host/db failed'); } };
    const failed = await post('Bearer good-token');
    assert.equal(failed.status, 503);
    assert.ok(!/postgres|pass/.test(await failed.text()));
  });
});
