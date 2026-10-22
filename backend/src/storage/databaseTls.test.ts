import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { databaseTls } from './runtime.js';

const PEM = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----';
describe('database TLS for the storage pool', () => {
  it('verifies the server certificate when a CA is supplied', () => {
    assert.deepEqual(databaseTls({ STORAGE_DB_SSL_CA: PEM }), { rejectUnauthorized: true, ca: PEM });
  });
  it('without a CA keeps the backend-wide encrypted-but-unverified behaviour (documented residual risk)', () => {
    assert.deepEqual(databaseTls({}), { rejectUnauthorized: false });
    assert.deepEqual(databaseTls({ STORAGE_DB_SSL_CA: '   ' }), { rejectUnauthorized: false });
  });
});
