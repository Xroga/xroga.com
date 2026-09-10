import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { decodeRepositoryTextBlob } from './githubDeploy.js';

const pipeline = readFileSync(new URL('../../ai/pipeline.ts', import.meta.url), 'utf8');
const github = readFileSync(new URL('./githubDeploy.ts', import.meta.url), 'utf8');

test('universal execution hydrates the repository tree rather than a web filename allow-list', () => {
  const hydration = pipeline.slice(pipeline.indexOf('async function hydratePriorFiles'), pipeline.indexOf('async function callBuilderStream'));
  assert.match(hydration, /fetchRepositoryTextFilesFromGitHub\(userId, repo, branch\)/);
  assert.doesNotMatch(hydration, /UPDATE_HYDRATE_PATHS|fetchBuildFilesFromGitHub/);
  const genericReader = github.slice(github.indexOf('export async function fetchRepositoryTextFilesFromGitHub'), github.indexOf('export async function fetchGitHubFilesByPaths'));
  assert.doesNotMatch(genericReader, /UPDATE_HYDRATE_PATHS|package\.json|index\.html|\.tsx/);
});

test('repository text decoding accepts arbitrary and extensionless source while rejecting binary blobs', () => {
  for (const content of ['def normalize(value):\n    return value.strip()\n', 'fn main() {}\n', '#!/usr/bin/env future-runtime\nrun\n']) {
    assert.equal(decodeRepositoryTextBlob(Buffer.from(content).toString('base64'), 'base64'), content);
  }
  assert.equal(decodeRepositoryTextBlob(Buffer.from([1, 0, 2]).toString('base64'), 'base64'), null);
  assert.equal(decodeRepositoryTextBlob('plain', 'utf8'), null);
});
