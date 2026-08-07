import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewBuildOutput, buildReviewBatches } from './qa.js';
import type { ProjectFile } from './patches.js';
import type { ChatResult } from './openaiCompat.js';

function reply(text: string, inputTokens: number, outputTokens: number): ChatResult {
  return {
    text,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    modelId: 'deepseek_v4_flash',
    apiModel: 'deepseek-chat',
    provider: 'deepseek',
  };
}


/**
 * A project static validation accepts, so that `ok` reflects the reviewer's verdict and
 * not a missing `package.json`. Without this the fail-closed tests would pass for the
 * wrong reason and the `ok: true` case could never pass at all.
 */
const FILES: ProjectFile[] = [
  { path: 'package.json', content: '{\n  "name": "app",\n  "version": "1.0.0"\n}\n' },
  { path: 'src/index.ts', content: 'import { serve } from "./serve.js";\nserve();\n' },
  { path: 'src/serve.ts', content: 'export function serve() { return 1; }\n' },
  { path: 'README.md', content: '# App\n\nThis is the readme.\n' },
];

/** Bulk fixtures need the same, or static validation masks what the test is measuring. */
function projectOf(count: number, bytesEach: number): ProjectFile[] {
  return [
    { path: 'package.json', content: '{\n  "name": "app",\n  "version": "1.0.0"\n}\n' },
    ...Array.from({ length: count }, (_, i) => ({
      path: `src/file${i}.ts`,
      content: `export const thing${i} = ${i};\n`.repeat(bytesEach),
    })),
  ];
}

test('fail-closed: missing ok is not a pass', async () => {
  const result = await reviewBuildOutput({
    prompt: 'build a thing',
    html: '<main>ok</main>',
    css: '',
    js: '',
    files: FILES,
    completion: async () => (reply(JSON.stringify({ issues: [], fixHints: [] }), 10, 10)),
  });
  assert.equal(result.ok, false, 'reviewer returned no verdict — must not pass');
  assert.ok(result.issues.some((i) => /no verdict|missing status/i.test(i)));
});

test('fail-closed: empty response is not a pass', async () => {
  const result = await reviewBuildOutput({
    prompt: 'build a thing',
    html: '<main>ok</main>',
    css: '',
    js: '',
    files: FILES,
    completion: async () => (reply('   ', 10, 10)),
  });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => /returned nothing/i.test(i)));
});

test('fail-closed: only explicit ok:true passes', async () => {
  const result = await reviewBuildOutput({
    prompt: 'build a thing',
    html: '<main>ok</main>',
    css: '',
    js: '',
    files: FILES,
    changedFiles: FILES.map(f => f.path),
    completion: async () => (reply(JSON.stringify({ ok: true, issues: [], fixHints: [], findings: [] }), 10, 10)),
  });
  assert.equal(result.ok, true);
});

test('batching: every changed file goes into some batch', () => {
  const files = projectOf(20, 50);
  const { batches, omitted } = buildReviewBatches(files, files.map((f) => f.path));
  const covered = new Set(batches.flatMap((b) => b.paths));
  for (const file of files) {
    assert.ok(covered.has(file.path) || omitted.includes(file.path), `${file.path} must be in a batch or omitted`);
  }
});

test('batching: deterministic — same input produces same batches', () => {
  const files = projectOf(10, 30);
  const first = buildReviewBatches(files, files.map((f) => f.path));
  const second = buildReviewBatches(files, files.map((f) => f.path));
  assert.deepEqual(first.batches.map((b) => b.paths), second.batches.map((b) => b.paths));
});

test('batching: respects per-file byte limit', () => {
  const huge = { path: 'huge.ts', content: 'x'.repeat(20000) };
  const { batches } = buildReviewBatches([huge], [huge.path], { perFileBytes: 2000 });
  assert.ok(batches[0].sample.length < 3000, 'the file must be truncated');
  assert.ok(batches[0].truncated.includes('huge.ts'));
});

test('batching: omits beyond max batches', () => {
  const files = projectOf(50, 100);
  const { batches, omitted } = buildReviewBatches(files, files.map((f) => f.path), { maxBatches: 3 });
  assert.equal(batches.length, 3);
  assert.ok(omitted.length > 0, 'files beyond the batch limit must be omitted');
});

test('multi-batch review: makes one call per batch', async () => {
  const files = projectOf(15, 80);
  let callCount = 0;
  const result = await reviewBuildOutput({
    prompt: 'build a system',
    html: '',
    css: '',
    js: '',
    files,
    changedFiles: files.map((f) => f.path),
    completion: async () => {
      callCount += 1;
      return reply(JSON.stringify({ ok: true, issues: [], fixHints: [], findings: [] }), 100, 50);
    },
  });
  assert.ok(callCount > 1, 'large change must make multiple reviewer calls');
  assert.equal(result.inputTokens, callCount * 100);
  assert.equal(result.outputTokens, callCount * 50);
});

test('multi-batch review: one batch fails means the review fails', async () => {
  const files = projectOf(15, 80);
  let callIndex = 0;
  const result = await reviewBuildOutput({
    prompt: 'build',
    html: '',
    css: '',
    js: '',
    files,
    changedFiles: files.map((f) => f.path),
    completion: async () => {
      callIndex += 1;
      const ok = callIndex !== 2;
      return reply(JSON.stringify({
          ok,
          issues: ok ? [] : ['batch 2 failed'],
          fixHints: [],
          findings: [],
        }), 10, 10);
    },
  });
  assert.equal(result.ok, false);
  assert.ok(result.issues.includes('batch 2 failed'));
});

test('scope: records commit SHA when provided', async () => {
  const result = await reviewBuildOutput({
    prompt: 'build',
    html: '<div></div>',
    css: '',
    js: '',
    files: FILES,
    commitSha: 'abc123',
    completion: async () => (reply(JSON.stringify({ ok: true, issues: [], fixHints: [], findings: [] }), 10, 10)),
  });
  assert.equal(result.scope.commitSha, 'abc123');
});

test('scope: records examined, truncated, and omitted files', async () => {
  const files: ProjectFile[] = [
    { path: 'a.ts', content: 'x'.repeat(100) },
    { path: 'b.ts', content: 'y'.repeat(100) },
  ];
  const result = await reviewBuildOutput({
    prompt: 'build',
    html: '',
    css: '',
    js: '',
    files,
    changedFiles: ['a.ts', 'b.ts'],
    completion: async () => (reply(JSON.stringify({ ok: true, issues: [], fixHints: [], findings: [] }), 10, 10)),
  });
  assert.ok(result.scope.examinedFiles.includes('a.ts'));
  assert.ok(result.scope.examinedFiles.includes('b.ts'));
  assert.equal(result.scope.totalFiles, 2);
});

test('fail-closed: a provider failure is not a pass', async () => {
  // The old catch path returned `staticResult.ok`, so a build whose LLM review never
  // happened could still come back reviewed and passing.
  const result = await reviewBuildOutput({
    prompt: 'build a thing',
    html: '<main>ok</main>',
    css: '',
    js: '',
    files: FILES,
    changedFiles: FILES.map((f) => f.path),
    completion: async () => {
      throw new Error('provider unreachable');
    },
  });
  assert.equal(result.ok, false, 'an unreachable reviewer must not pass the build');
  assert.ok(result.issues.some((i) => /could not be reached/i.test(i)));
});

test('fail-closed: a non-boolean verdict is not a pass', async () => {
  for (const verdict of ['true', 1, {}, []]) {
    const result = await reviewBuildOutput({
      prompt: 'build a thing',
      html: '<main>ok</main>',
      css: '',
      js: '',
      files: FILES,
      changedFiles: FILES.map((f) => f.path),
      completion: async () => (reply(JSON.stringify({ ok: verdict, issues: [], fixHints: [], findings: [] }), 10, 10)),
    });
    assert.equal(result.ok, false, `${JSON.stringify(verdict)} must not be read as a pass`);
  }
});

test('fail-closed: malformed JSON is not a pass', async () => {
  const result = await reviewBuildOutput({
    prompt: 'build a thing',
    html: '<main>ok</main>',
    css: '',
    js: '',
    files: FILES,
    changedFiles: FILES.map((f) => f.path),
    completion: async () => (reply('I reviewed it and it looks fine to me!', 10, 10)),
  });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => /could not be parsed/i.test(i)));
});

test('findings without a file are attributed to the batch that produced them', async () => {
  const result = await reviewBuildOutput({
    prompt: 'build',
    html: '',
    css: '',
    js: '',
    files: FILES,
    changedFiles: FILES.map((f) => f.path),
    commitSha: 'deadbeef',
    completion: async () => (reply(JSON.stringify({
        ok: false,
        issues: ['something is wrong'],
        fixHints: [],
        findings: [{ severity: 'high', title: 'no file named', evidence: 'somewhere' }],
      }), 10, 10)),
  });
  assert.equal(result.findings.length, 1);
  assert.ok(result.findings[0].affectedFiles.length > 0, 'a finding must name where it is');
  assert.equal(result.scope.commitSha, 'deadbeef');
});

test('omitted files block verification', async () => {
  const files = projectOf(100, 100);
  const result = await reviewBuildOutput({
    prompt: 'build',
    html: '',
    css: '',
    js: '',
    files,
    changedFiles: files.map((f) => f.path),
    completion: async () => (reply(JSON.stringify({ ok: true, issues: [], fixHints: [], findings: [] }), 10, 10)),
  });
  assert.equal(result.ok, false, 'omitted changed files must block verification');
  assert.ok(result.issues.some((i) => /did not cover.*changed file/i.test(i)));
  assert.ok(result.scope.unexaminedFiles.length > 0);
});
