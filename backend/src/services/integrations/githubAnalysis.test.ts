import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inferRepositoryTechStack, repositoryBuildEvidencePaths } from './githubDeploy.js';

test('README-only repositories do not claim hypothetical static build files', () => {
  assert.deepEqual(repositoryBuildEvidencePaths(['README.md']), []);
});

test('repository analysis reports only build evidence that is actually present', () => {
  assert.deepEqual(
    repositoryBuildEvidencePaths(['README.md', 'packages/client/package.json', 'packages/client/app/page.tsx']),
    ['packages/client/app/page.tsx', 'packages/client/package.json'],
  );
});

test('repository analysis recognizes source language without declaring a fresh scaffold', () => {
  assert.deepEqual(
    inferRepositoryTechStack(['README.md', 'normalize.py', 'tests/test_normalize.py']),
    ['Python'],
  );
  assert.deepEqual(
    inferRepositoryTechStack(['README.md', 'source.unknown']),
    ['No framework or runtime inferred from the sampled tree'],
  );
});
