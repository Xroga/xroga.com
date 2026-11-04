import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('recovery requires an email token before showing the new-password form', () => {
  const page = read('../../app/auth/reset-password/ResetPasswordForm.tsx');
  assert.match(page, /get\('token_hash'\)/);
  assert.match(page, /verifyOtp\(\{[\s\S]*type: 'recovery'/);
  assert.match(page, /!ready && recoveryToken[\s\S]*Verify email and continue/);
  assert.match(page, /password !== confirm/);
  assert.match(page, /auth\.updateUser\(\{ password \}\)/);
  assert.match(page, /auth\.signOut\(\)/);
  assert.doesNotMatch(page, /getUser\(\)[\s\S]*setReady\(Boolean/);
});
