import assert from 'node:assert/strict';
import test from 'node:test';
import { exportSchema } from './showcase.js';

const VALID = {
  templateId: 'business-website',
  repoFullName: 'octocat/my-site',
  branch: 'xroga/template-modern-business-website-a1b2c3d4',
  projectName: 'My Site',
};

test('a well formed export request is accepted', () => {
  assert.equal(exportSchema.safeParse(VALID).success, true);
  assert.equal(
    exportSchema.safeParse({ ...VALID, userPrompt: 'Make it green', targetDirectory: 'apps/site', baseBranch: 'develop' })
      .success,
    true,
  );
});

test('unknown fields are rejected rather than silently ignored', () => {
  const result = exportSchema.safeParse({ ...VALID, force: true });
  assert.equal(result.success, false);
});

test('only the generated branch namespace is accepted', () => {
  for (const branch of [
    'main',
    'master',
    'refs/heads/main',
    'xroga/template-',
    'xroga/template-site',
    'xroga/template-site-a1b2c3d4/../main',
    'xroga/template-site-A1B2C3D4',
    'xroga/template-site-a1b2c3d4e',
    'Xroga/template-site-a1b2c3d4',
    'xroga/template-si te-a1b2c3d4',
    '../main',
    '',
  ]) {
    assert.equal(exportSchema.safeParse({ ...VALID, branch }).success, false, branch);
  }
});

test('the repository name must be a plain owner/name pair', () => {
  for (const repoFullName of [
    'no-slash',
    '/name',
    'owner/',
    'owner/name/extra',
    'owner/../../etc',
    'owner/name?x=1',
    'owner/name#frag',
    'owner name/repo',
    'owner/na me',
    'https://github.com/owner/name',
    'owner/name%2F..',
  ]) {
    assert.equal(exportSchema.safeParse({ ...VALID, repoFullName }).success, false, repoFullName);
  }
});

test('the base branch cannot carry traversal or ref metacharacters', () => {
  for (const baseBranch of [
    '../main',
    'a/../b',
    '/main',
    'main/',
    'main~1',
    'main^',
    'main:ref',
    'ma in',
    'main?',
    'main*',
    'main[1]',
    'main\\x',
    'refs@{0}',
  ]) {
    assert.equal(exportSchema.safeParse({ ...VALID, baseBranch }).success, false, baseBranch);
  }
  for (const baseBranch of ['main', 'develop', 'release/2026-07', 'v1.2.3']) {
    assert.equal(exportSchema.safeParse({ ...VALID, baseBranch }).success, true, baseBranch);
  }
});

test('oversized fields are bounded', () => {
  assert.equal(exportSchema.safeParse({ ...VALID, projectName: '' }).success, false);
  assert.equal(exportSchema.safeParse({ ...VALID, projectName: 'x'.repeat(121) }).success, false);
  assert.equal(exportSchema.safeParse({ ...VALID, userPrompt: 'x'.repeat(8001) }).success, false);
  assert.equal(exportSchema.safeParse({ ...VALID, targetDirectory: 'x'.repeat(201) }).success, false);
  assert.equal(exportSchema.safeParse({ ...VALID, templateId: 'x'.repeat(65) }).success, false);
});

test('required fields cannot be omitted or sent as the wrong type', () => {
  for (const key of ['templateId', 'repoFullName', 'branch', 'projectName'] as const) {
    const { [key]: _omitted, ...rest } = VALID;
    assert.equal(exportSchema.safeParse(rest).success, false, `missing ${key}`);
    assert.equal(exportSchema.safeParse({ ...VALID, [key]: 123 }).success, false, `numeric ${key}`);
    assert.equal(exportSchema.safeParse({ ...VALID, [key]: null }).success, false, `null ${key}`);
  }
  for (const body of [null, undefined, 'string', 42, []]) {
    assert.equal(exportSchema.safeParse(body).success, false, String(body));
  }
});
