import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_REPOSITORY_VISIBILITY,
  classifyRepoCreateFailure,
  describeRepoCreateFailure,
  mayAdoptUnselectedRepository,
  nextCandidateName,
  readRepositoryResponse,
} from './githubRepoCreation.js';

/**
 * Cover for two repository-creation defects.
 *
 * `createRepo` sent `private: false`, so every repository Xroga created was public with
 * no user choice anywhere in the product.
 *
 * And every `422` was treated as "this repository already exists" — the code then built
 * `{owner}/{name}` by string interpolation and wrote to it. GitHub returns 422 for
 * invalid names, blocked names and other validation failures too, so after any of those
 * the build would write into whatever that constructed name happened to resolve to,
 * including an unrelated repository the user already owned.
 */

test('repositories default to private', () => {
  assert.equal(DEFAULT_REPOSITORY_VISIBILITY, 'private');
});

test('reproduces the defect: a name collision is distinguished from every other 422', () => {
  const collision = classifyRepoCreateFailure(422, {
    message: 'Repository creation failed.',
    errors: [{ resource: 'Repository', field: 'name', code: 'custom', message: 'name already exists on this account' }],
  });
  assert.equal(collision, 'name_taken');
});

test('an invalid name is not mistaken for an existing repository', () => {
  const invalid = classifyRepoCreateFailure(422, {
    message: 'Repository creation failed.',
    errors: [{ resource: 'Repository', field: 'name', code: 'invalid', message: 'name is not a valid repository name' }],
  });
  assert.equal(invalid, 'invalid_name');
  assert.notEqual(invalid, 'name_taken');
});

test('an unrelated 422 stops rather than presuming a repository exists', () => {
  const other = classifyRepoCreateFailure(422, {
    message: 'Repository creation failed.',
    errors: [{ resource: 'Repository', field: 'description', code: 'too_long', message: 'description is too long' }],
  });
  assert.equal(other, 'validation_failed');
  assert.notEqual(other, 'name_taken');
});

test('auth and rate-limit failures are their own reasons', () => {
  assert.equal(classifyRepoCreateFailure(401, null), 'unauthorized');
  assert.equal(classifyRepoCreateFailure(403, null), 'unauthorized');
  assert.equal(classifyRepoCreateFailure(429, null), 'rate_limited');
});

test('a 422 with no parseable body is not assumed to be a collision', () => {
  // The dangerous default. Unknown must never mean "go ahead and write".
  assert.equal(classifyRepoCreateFailure(422, null), 'validation_failed');
});

test('an unrelated repository is never adopted, whatever the name resolves to', () => {
  assert.equal(mayAdoptUnselectedRepository(), false);
});

test('collision retries produce distinct, still-readable names', () => {
  assert.equal(nextCandidateName('hairmax', 0), 'hairmax');
  assert.equal(nextCandidateName('hairmax', 1), 'hairmax-2');
  assert.equal(nextCandidateName('hairmax', 2), 'hairmax-3');
  // A base that already carries a suffix does not compound it.
  assert.equal(nextCandidateName('hairmax-2', 1), 'hairmax-2');
});

test('the repository identity comes from GitHub, never from a constructed string', () => {
  const repo = readRepositoryResponse({
    id: 42,
    full_name: 'Xroga/hairmax',
    html_url: 'https://github.com/Xroga/hairmax',
    private: true,
    default_branch: 'main',
  });
  assert.equal(repo?.id, 42);
  assert.equal(repo?.owner, 'Xroga');
  assert.equal(repo?.repo, 'hairmax');
  assert.equal(repo?.visibility, 'private');
  assert.equal(repo?.defaultBranch, 'main');
});

test('a malformed response yields null rather than a half-built repository reference', () => {
  assert.equal(readRepositoryResponse(null), null);
  assert.equal(readRepositoryResponse({}), null);
  assert.equal(readRepositoryResponse({ id: 1 }), null);
  assert.equal(readRepositoryResponse({ id: 1, full_name: 'no-slash' }), null);
});

test('visibility is read conservatively — anything not clearly public reads as private', () => {
  assert.equal(
    readRepositoryResponse({ id: 1, full_name: 'a/b', private: false, visibility: 'public' })?.visibility,
    'public',
  );
  assert.equal(readRepositoryResponse({ id: 1, full_name: 'a/b', private: true })?.visibility, 'private');
  // Absent flags must not be optimistically read as public.
  assert.equal(readRepositoryResponse({ id: 1, full_name: 'a/b' })?.visibility, 'private');
});

test('failure messages are actionable and never echo a raw response body', () => {
  for (const reason of ['name_taken', 'invalid_name', 'validation_failed', 'unauthorized', 'rate_limited', 'unknown'] as const) {
    const message = describeRepoCreateFailure(reason, 'hairmax');
    assert.ok(message.length > 10, reason);
    assert.doesNotMatch(message, /\{|\}|"errors"|Bearer |gho_/, reason);
  }
});

test('a stopped creation states that nothing was created', () => {
  assert.match(describeRepoCreateFailure('validation_failed', 'x'), /Nothing was created or modified/);
  assert.match(describeRepoCreateFailure('unknown', 'x'), /Nothing was created or modified/);
});
