import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTemplateFiles,
  isSafeRepoPath,
  isShowcaseTemplateId,
  normalizeTargetDirectory,
  resolveTemplateSource,
} from './templateSources.js';

const ALLOWED = [
  'business-website',
  'real-estate-platform',
  'booking-platform',
  'android-app',
  'ai-saas',
  'web-game',
];

test('only the allow-listed template ids resolve', () => {
  for (const id of ALLOWED) {
    assert.equal(isShowcaseTemplateId(id), true, id);
    assert.ok(resolveTemplateSource(id), id);
  }
});

test('a browser cannot smuggle a source path through the template id', () => {
  for (const attempt of [
    '',
    '../../../etc/passwd',
    '/etc/passwd',
    'C:\\Windows\\System32',
    'backend/src/services',
    'business-website/../../secret',
    'BUSINESS-WEBSITE',
    'business_website',
    '__proto__',
    'constructor',
    'toString',
    'hasOwnProperty',
    'prototype',
  ]) {
    assert.equal(isShowcaseTemplateId(attempt), false, attempt);
    assert.equal(resolveTemplateSource(attempt), null, attempt);
  }
});

test('non-string template ids are rejected without throwing', () => {
  for (const attempt of [undefined, null, 0, 1, true, {}, [], () => {}, Symbol('x')]) {
    assert.equal(isShowcaseTemplateId(attempt), false, String(attempt));
  }
});

test('template files are freshly built so the shared source is never mutated', () => {
  const first = buildTemplateFiles({ templateId: 'business-website', projectName: 'One' });
  const second = buildTemplateFiles({ templateId: 'business-website', projectName: 'Two' });
  assert.ok(first && second);
  assert.notEqual(first.files, second.files);

  // Mutating one export must not be visible in the next.
  const before = second.files.length;
  first.files.push({ path: 'injected.txt', content: 'x' });
  first.files[0].content = 'tampered';
  const third = buildTemplateFiles({ templateId: 'business-website', projectName: 'Three' });
  assert.ok(third);
  assert.equal(third.files.length, before);
  assert.ok(!third.files.some((file) => file.path === 'injected.txt'));
  assert.notEqual(third.files[0].content, 'tampered');
});

test('every allow-listed template produces its declared critical paths', () => {
  for (const id of ALLOWED) {
    const built = buildTemplateFiles({ templateId: id, projectName: 'Sample' });
    assert.ok(built, id);
    assert.ok(built.files.length > 0, id);
    for (const critical of built.source.criticalPaths) {
      assert.ok(built.files.some((file) => file.path === critical), `${id} missing ${critical}`);
    }
    // Nothing a template ships may itself be an unsafe path.
    for (const file of built.files) {
      assert.equal(isSafeRepoPath(file.path), true, `${id}: ${file.path}`);
    }
  }
});

test('an unknown template id yields no files rather than a partial export', () => {
  assert.equal(buildTemplateFiles({ templateId: 'nope', projectName: 'X' }), null);
});

test('safe repository paths are accepted', () => {
  for (const path of [
    'package.json',
    'app/page.tsx',
    'src/components/Nav.tsx',
    'apps/site/app/layout.tsx',
    'public/logo.svg',
    'README.md',
    '.gitignore',
    '.eslintrc.json',
    'a-b_c.1/d.txt',
    // Placeholder env files list variable names only; they are how a scaffold
    // documents its required configuration.
    '.env.example',
    'apps/site/.env.example',
  ]) {
    assert.equal(isSafeRepoPath(path), true, path);
  }
});

test('traversal is rejected in every encoding we can normalise', () => {
  for (const path of [
    '..',
    '../x',
    'a/../b',
    'a/../../b',
    'a/..',
    './a',
    '.',
    'a/./b',
    '..\\windows',
    'a\\..\\b',
    'a/....//b',
    '....//etc',
  ]) {
    assert.equal(isSafeRepoPath(path), false, path);
  }
});

test('absolute paths and drive letters are rejected', () => {
  for (const path of ['/etc/passwd', '/a', 'C:/Windows', 'c:\\windows', 'D:/data', '\\\\server\\share']) {
    assert.equal(isSafeRepoPath(path), false, path);
  }
});

test('protected locations are rejected at the root and when nested', () => {
  for (const path of [
    '.github/workflows/deploy.yml',
    '.github/dependabot.yml',
    '.git/config',
    '.git/HEAD',
    '.env',
    '.env.local',
    '.env.production',
    '.env.anything',
    'apps/site/.env',
    'apps/site/.env.local',
    'nested/deep/.git/config',
  ]) {
    assert.equal(isSafeRepoPath(path), false, path);
  }
});

test('a real env file is still blocked when it sits beside an allowed example', () => {
  assert.equal(isSafeRepoPath('.env.example'), true);
  assert.equal(isSafeRepoPath('.env.exampleX'), false);
  assert.equal(isSafeRepoPath('.env.example.local'), false);
});

test('empty, blank, null-byte and non-string paths are rejected', () => {
  for (const path of ['', '   ', 'a\0b', 'a//b', 'dir/', '//x']) {
    assert.equal(isSafeRepoPath(path), false, JSON.stringify(path));
  }
  for (const path of [undefined, null, 0, {}, []]) {
    assert.equal(isSafeRepoPath(path as unknown as string), false, String(path));
  }
});

test('target directory normalisation strips wrapping slashes but keeps the path', () => {
  assert.equal(normalizeTargetDirectory('apps/site'), 'apps/site');
  assert.equal(normalizeTargetDirectory('/apps/site/'), 'apps/site');
  assert.equal(normalizeTargetDirectory('apps\\site'), 'apps/site');
});

test('an omitted target directory means "repository root", not an error', () => {
  for (const input of [undefined, null, '', '/', '///']) {
    assert.equal(normalizeTargetDirectory(input), undefined, JSON.stringify(input));
  }
});

test('an unsafe target directory is rejected rather than sanitised into something else', () => {
  for (const input of ['../escape', 'a/../../b', '.github/workflows', '.git', '.env', 'C:/x', 123, {}, true]) {
    assert.equal(normalizeTargetDirectory(input), null, String(input));
  }
});
