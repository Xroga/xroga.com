import assert from 'node:assert/strict';
import { test } from 'node:test';
import { safeAuthNextPath } from './oauthReturn';

test('OAuth return accepts only app-relative paths', () => {
  assert.equal(safeAuthNextPath('/workspace?tab=1'), '/workspace?tab=1');
  for (const value of ['https://evil.example', '//evil.example', '/\\evil.example', '/workspace\nLocation:evil']) {
    assert.equal(safeAuthNextPath(value), '/workspace');
  }
});
