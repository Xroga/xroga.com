import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveLandingRecoveryRepo } from './landingRecoveryRepo';

test('uses the terminal repository when a legacy compact message lost its repo fields', () => {
  assert.equal(
    resolveLandingRecoveryRepo(undefined, undefined, 'Xroga/orbit-coffee'),
    'Xroga/orbit-coffee'
  );
});

test('prefers repository evidence stored on the artifact', () => {
  assert.equal(
    resolveLandingRecoveryRepo('Xroga/artifact', 'Xroga/message', 'Xroga/terminal'),
    'Xroga/artifact'
  );
});

test('rejects unscoped repository names', () => {
  assert.equal(resolveLandingRecoveryRepo('orbit', 'coffee', 'site'), '');
});
