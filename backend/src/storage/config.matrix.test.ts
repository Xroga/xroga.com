import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { resolveStorageConfig, StorageConfigError, storageReadOrder, storageWriteMode } from './runtime.js';

const CREDS = { XROGA_DRIVE_R2_ACCOUNT_ID: 'a', XROGA_DRIVE_R2_ACCESS_KEY_ID: 'k', XROGA_DRIVE_R2_SECRET_ACCESS_KEY: 's', XROGA_DRIVE_R2_BUCKET: 'xroga-drive', DATABASE_URL: 'postgres://x' };

interface Case { name: string; env: Record<string, string>; write: string; read: string; ok: boolean; problem?: RegExp }
const CASES: Case[] = [
  { name: 'nothing set (production default)', env: {}, write: 'legacy', read: 'legacy,r2', ok: true },
  { name: 'write=legacy explicit', env: { STORAGE_WRITE_MODE: 'legacy' }, write: 'legacy', read: 'legacy,r2', ok: true },
  { name: 'write empty string', env: { STORAGE_WRITE_MODE: '' }, write: 'legacy', read: 'legacy,r2', ok: true },
  { name: 'write=dual, no Drive credentials', env: { STORAGE_WRITE_MODE: 'dual' }, write: 'dual', read: 'legacy,r2', ok: false, problem: /requires XROGA_DRIVE_R2_\*/ },
  { name: 'write=r2, no Drive credentials', env: { STORAGE_WRITE_MODE: 'r2' }, write: 'r2', read: 'legacy,r2', ok: false, problem: /requires XROGA_DRIVE_R2_\*/ },
  { name: 'write=r2, credentials, no database', env: { ...CREDS, DATABASE_URL: '', STORAGE_WRITE_MODE: 'r2' }, write: 'r2', read: 'legacy,r2', ok: false, problem: /database/ },
  { name: 'write=r2, credentials + database', env: { ...CREDS, STORAGE_WRITE_MODE: 'r2' }, write: 'r2', read: 'legacy,r2', ok: true },
  { name: 'write=dual, credentials + database (mixed case)', env: { ...CREDS, STORAGE_WRITE_MODE: ' DUAL ' }, write: 'dual', read: 'legacy,r2', ok: true },
  { name: 'write=banana (invalid value is NOT treated as legacy)', env: { STORAGE_WRITE_MODE: 'banana' }, write: 'legacy', read: 'legacy,r2', ok: false, problem: /not one of legacy\|dual\|r2/ },
  { name: 'write=r2, Drive bucket = legacy public bucket', env: { ...CREDS, XROGA_DRIVE_R2_BUCKET: 'xroga-assets', STORAGE_WRITE_MODE: 'r2' }, write: 'r2', read: 'legacy,r2', ok: false, problem: /dedicated private bucket/ },
  { name: 'write=r2, Drive bucket = custom legacy bucket', env: { ...CREDS, CLOUDFLARE_R2_BUCKET: 'shared', XROGA_DRIVE_R2_BUCKET: 'shared', STORAGE_WRITE_MODE: 'r2' }, write: 'r2', read: 'legacy,r2', ok: false, problem: /dedicated private bucket/ },
  { name: 'read=r2,legacy without credentials (r2 step reports not-migrated, legacy serves)', env: { STORAGE_READ_ORDER: 'r2,legacy' }, write: 'legacy', read: 'r2,legacy', ok: true },
  { name: 'read=r2 only without credentials', env: { STORAGE_READ_ORDER: 'r2' }, write: 'legacy', read: 'legacy,r2', ok: false, problem: /STORAGE_READ_ORDER=r2 requires/ },
  { name: 'read=legacy only', env: { STORAGE_READ_ORDER: 'legacy' }, write: 'legacy', read: 'legacy', ok: true },
  { name: 'read lists a source twice', env: { STORAGE_READ_ORDER: 'legacy,r2,legacy' }, write: 'legacy', read: 'legacy,r2', ok: false, problem: /twice/ },
  { name: 'read has an unknown source', env: { STORAGE_READ_ORDER: 'legacy,s3' }, write: 'legacy', read: 'legacy,r2', ok: false, problem: /unsupported/ },
  { name: 'read empty entries', env: { STORAGE_READ_ORDER: ',' }, write: 'legacy', read: 'legacy,r2', ok: false, problem: /unsupported/ },
];

const results: Array<Record<string, unknown>> = [];

describe('storage configuration matrix (expected vs actual)', () => {
  for (const c of CASES) {
    it(c.name, () => {
      const r = resolveStorageConfig(c.env as never);
      const ok = r.problems.length === 0;
      results.push({ case: c.name, env: Object.keys(c.env).sort(), expectedOk: c.ok, actualOk: ok, writeMode: r.writeMode, readOrder: r.readOrder.join(','), problems: r.problems });
      assert.equal(ok, c.ok, JSON.stringify(r.problems));
      if (c.ok) { assert.equal(r.writeMode, c.write); assert.equal(r.readOrder.join(','), c.read); }
      if (c.problem) assert.match(r.problems.join(' | '), c.problem);
      // the accessors used by the data path agree with the pure validator: invalid => throws, never a default
      if (c.ok) { assert.equal(storageWriteMode(c.env as never), c.write); assert.equal(storageReadOrder(c.env as never).join(','), c.read); }
      else assert.throws(() => (c.problem?.source.includes('READ_ORDER') ? storageReadOrder(c.env as never) : storageWriteMode(c.env as never)), StorageConfigError);
    });
  }
  it('secret values never appear in configuration errors', () => {
    const r = resolveStorageConfig({ ...CREDS, XROGA_DRIVE_R2_SECRET_ACCESS_KEY: 'TOPSECRETVALUE123', XROGA_DRIVE_R2_BUCKET: 'xroga-assets', STORAGE_WRITE_MODE: 'r2' } as never);
    assert.ok(!JSON.stringify(r).includes('TOPSECRETVALUE123'));
  });
  it('writes the matrix evidence when asked', () => {
    if (process.env.CONFIG_MATRIX_OUT) writeFileSync(process.env.CONFIG_MATRIX_OUT, JSON.stringify(results, null, 2));
    assert.equal(results.length, CASES.length);
  });
});
