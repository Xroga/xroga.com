import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveStorageConfig, resolveStorageQuota } from './runtime.js';

describe('Drive quota configuration', () => {
  it('unset or blank means tracked and not enforced, which is the documented default', () => {
    for (const value of [undefined, '', '   ']) assert.deepEqual(resolveStorageQuota({ STORAGE_QUOTA_BYTES: value } as NodeJS.ProcessEnv), { quota: null, problem: null });
  });

  it('a whole number of bytes is the limit, zero included', () => {
    assert.deepEqual(resolveStorageQuota({ STORAGE_QUOTA_BYTES: '5368709120' } as NodeJS.ProcessEnv), { quota: 5368709120, problem: null });
    assert.deepEqual(resolveStorageQuota({ STORAGE_QUOTA_BYTES: ' 0 ' } as NodeJS.ProcessEnv), { quota: 0, problem: null });
  });

  it('anything else that is set is a configuration problem and never "unlimited"', () => {
    for (const bad of ['10GB', '-1', '1e9', '5.5', 'unlimited', '0x10', '1'.repeat(16)]) {
      const r = resolveStorageQuota({ STORAGE_QUOTA_BYTES: bad } as NodeJS.ProcessEnv);
      assert.equal(r.quota, null, bad);
      assert.match(r.problem ?? '', /STORAGE_QUOTA_BYTES must be a non-negative whole number/, bad);
      assert.ok(resolveStorageConfig({ STORAGE_QUOTA_BYTES: bad } as NodeJS.ProcessEnv).problems.some((p) => /STORAGE_QUOTA_BYTES/.test(p)), `${bad} reaches the startup and readiness checks`);
    }
  });
});
