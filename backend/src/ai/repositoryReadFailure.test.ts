import assert from 'node:assert/strict';
import test from 'node:test';
import {
  describeRepositoryReadFailure,
  SafeRepositoryReadError,
} from './pipeline.js';

test('preserves bounded GitHub repository diagnoses for actionable user feedback', () => {
  assert.equal(
    describeRepositoryReadFailure(
      new SafeRepositoryReadError('GitHub authorization cannot inspect the target repository'),
    ),
    'GitHub authorization cannot inspect the target repository',
  );
  assert.equal(
    describeRepositoryReadFailure(
      new SafeRepositoryReadError('GitHub branch feature/arbitrary-name was not found'),
    ),
    'GitHub branch feature/arbitrary-name was not found',
  );
});

test('continues to sanitize untrusted upstream errors', () => {
  assert.equal(
    describeRepositoryReadFailure(new Error('raw provider response body')),
    'unknown provider failure',
  );
});
