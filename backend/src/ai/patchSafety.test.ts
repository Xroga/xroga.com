import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyPatches, type FilePatch, type ProjectFile } from './patches.js';
import { sourceContentHash } from './patchSafety.js';

/**
 * Cover for the patch engine defects.
 *
 * `applySinglePatch` began with `if (!search.trim()) return replace;` — an empty SEARCH
 * against an existing file replaced the whole file with the REPLACE body. A truncated
 * model response produces exactly that shape, so a malformed patch silently wiped
 * working code.
 *
 * Matching was also a chain of progressively looser attempts, each taking the *first*
 * match: exact, then trimmed, then indentation-collapsed, then a flexible-whitespace
 * regex. A snippet occurring twice would silently patch whichever came first.
 */

const EXISTING: ProjectFile[] = [
  {
    path: 'app/page.tsx',
    content: [
      'export default function Page() {',
      '  return (',
      '    <main>',
      '      <h1>Hello</h1>',
      '    </main>',
      '  );',
      '}',
      '',
    ].join('\n'),
  },
];

function patch(over: Partial<FilePatch> = {}): FilePatch {
  return { path: 'app/page.tsx', search: '<h1>Hello</h1>', replace: '<h1>Hi</h1>', ...over };
}

test('reproduces the defect: an empty SEARCH can no longer overwrite an existing file', () => {
  const result = applyPatches(EXISTING, [patch({ search: '', replace: 'WIPED' })]);
  assert.equal(result.applied.length, 0);
  assert.equal(result.failed.length, 1);
  assert.equal(result.files.find((f) => f.path === 'app/page.tsx')?.content, EXISTING[0].content);
  assert.match(result.failureReasons[0], /empty SEARCH/i);
});

test('a whitespace-only SEARCH is treated the same way', () => {
  const result = applyPatches(EXISTING, [patch({ search: '   \n  ', replace: 'WIPED' })]);
  assert.equal(result.applied.length, 0);
  assert.equal(result.files.find((f) => f.path === 'app/page.tsx')?.content, EXISTING[0].content);
});

test('a SEARCH matching twice is refused rather than patching an arbitrary one', () => {
  const duplicated: ProjectFile[] = [
    { path: 'a.ts', content: 'const x = 1;\nconst y = 2;\nconst x = 1;\n' },
  ];
  const result = applyPatches(duplicated, [
    { path: 'a.ts', search: 'const x = 1;', replace: 'const x = 99;' },
  ]);
  assert.equal(result.applied.length, 0);
  assert.equal(result.failed.length, 1);
  assert.match(result.failureReasons[0], /more than one place/i);
  assert.equal(result.files[0].content, duplicated[0].content);
});

test('a SEARCH matching exactly once still applies normally', () => {
  const result = applyPatches(EXISTING, [patch()]);
  assert.equal(result.applied.length, 1);
  assert.match(result.files.find((f) => f.path === 'app/page.tsx')!.content, /<h1>Hi<\/h1>/);
});

test('a SEARCH that matches nothing fails without touching the file', () => {
  const result = applyPatches(EXISTING, [patch({ search: 'not in the file' })]);
  assert.equal(result.applied.length, 0);
  assert.equal(result.files.find((f) => f.path === 'app/page.tsx')?.content, EXISTING[0].content);
});

test('a patch authored against different content is refused as stale', () => {
  const result = applyPatches(EXISTING, [
    patch({ expectedSourceHash: sourceContentHash('completely different content') }),
  ]);
  assert.equal(result.applied.length, 0);
  assert.match(result.failureReasons[0], /changed after the patch was written/i);
});

test('a patch carrying the correct source hash applies', () => {
  const result = applyPatches(EXISTING, [
    patch({ expectedSourceHash: sourceContentHash(EXISTING[0].content) }),
  ]);
  assert.equal(result.applied.length, 1);
});

test('a patch that would delete most of a file is refused', () => {
  const big: ProjectFile[] = [{ path: 'big.ts', content: `${'const line = 1;\n'.repeat(200)}// tail\n` }];
  const result = applyPatches(big, [
    { path: 'big.ts', search: '// tail', replace: '' },
  ]);
  // Removing only the tail is fine — this asserts the check does not fire on a
  // legitimate small edit.
  assert.equal(result.applied.length, 1);

  const destructive = applyPatches(big, [
    { path: 'big.ts', search: big[0].content.slice(0, -8), replace: '' },
  ]);
  assert.equal(destructive.applied.length, 0);
  assert.match(destructive.failureReasons[0], /deleted most of the file/i);
});

test('a deliberate rewrite is allowed when the patch says so', () => {
  const big: ProjectFile[] = [{ path: 'big.ts', content: 'const line = 1;\n'.repeat(200) }];
  const result = applyPatches(big, [
    { path: 'big.ts', search: big[0].content, replace: 'const x = 1;\n', allowDestructive: true },
  ]);
  assert.equal(result.applied.length, 1);
});

test('creating a genuinely new file still works', () => {
  const result = applyPatches(EXISTING, [
    { path: 'app/new.tsx', search: '', replace: 'export const New = () => null;' },
  ]);
  assert.equal(result.applied.length, 1);
  assert.deepEqual(result.createdPaths, ['app/new.tsx']);
  assert.equal(result.files.find((f) => f.path === 'app/new.tsx')?.content, 'export const New = () => null;');
});

test('the explicit new-file markers still work', () => {
  for (const marker of ['<<NEW FILE>>', '(new file)']) {
    const result = applyPatches(EXISTING, [
      { path: `app/${marker.length}.tsx`, search: marker, replace: 'export const X = 1;' },
    ]);
    assert.equal(result.applied.length, 1, marker);
  }
});

test('a patch against a missing file that is not marked new is refused', () => {
  const result = applyPatches(EXISTING, [
    { path: 'app/absent.tsx', search: 'something specific', replace: 'x' },
  ]);
  assert.equal(result.applied.length, 0);
  assert.equal(result.failed.length, 1);
});

test('one failing patch does not corrupt files touched by the others', () => {
  const files: ProjectFile[] = [
    { path: 'a.ts', content: 'const a = 1;\n' },
    { path: 'b.ts', content: 'const b = 2;\n' },
  ];
  const result = applyPatches(files, [
    { path: 'a.ts', search: 'const a = 1;', replace: 'const a = 10;' },
    { path: 'b.ts', search: '', replace: 'WIPED' },
  ]);
  assert.equal(result.applied.length, 1);
  assert.equal(result.failed.length, 1);
  // b.ts must be exactly as it was — the failure may not partially apply.
  assert.equal(result.files.find((f) => f.path === 'b.ts')?.content, 'const b = 2;\n');
});

test('every rejection produces a reason naming the file', () => {
  const result = applyPatches(EXISTING, [
    patch({ search: '', replace: 'x' }),
    patch({ search: 'nowhere' }),
  ]);
  assert.equal(result.failureReasons.length, 2);
  for (const reason of result.failureReasons) {
    assert.match(reason, /app\/page\.tsx/);
  }
});
