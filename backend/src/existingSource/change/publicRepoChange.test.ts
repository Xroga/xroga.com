import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runPublicRepoChange } from './publicRepoChange.js';
import type { ExecutionPort } from './testRunner.js';
import { RepoRunError } from '../../sandbox/repoRun.js';

const COMMIT = 'a'.repeat(40);
const URL = 'https://github.com/o/r';
const broken = [
  { path: 'lib/calc.py', content: 'def add(a, b):\n    return a - b\n' },
  { path: 'tests/__init__.py', content: '' },
  { path: 'tests/test_calc.py', content: 'import unittest\n' },
  { path: 'pyproject.toml', content: '[project]\nname="x"\n' },
  { path: '.env', content: 'SECRET=1' },
];
const fixed = [{ ...broken[0], content: 'def add(a, b):\n    return a + b\n' }, ...broken.slice(1)];
const fetcher = (files: typeof broken) => async () => ({ files, omitted: 0, commit: COMMIT });

/** Stands in for the worker: "tests pass" exactly when the add function it was given adds. */
const port = (seen: string[][] = []): ExecutionPort => ({
  async execute(request) {
    seen.push(request.files.map((f) => f.path));
    const adds = request.files.find((f) => f.path === 'lib/calc.py')?.content.includes('a + b');
    const result = { exitCode: adds ? 0 : 1, stdout: '', stderr: adds ? 'OK' : 'FAIL: test_add', timedOut: false, killedForLimit: false, durationMs: 5 };
    return { ...result, stages: [{ ...result, id: request.stages![0]!.id }] };
  },
});

test('a fix to a broken pinned commit: tests fail before, pass after, the diff is returned, and the claim stays "unverified" because the baseline was red', async () => {
  const seen: string[][] = [];
  const out = await runPublicRepoChange({ url: URL, ref: COMMIT, edits: [{ path: 'lib/calc.py', find: 'a - b', replace: 'a + b' }], port: port(seen), fetchFiles: fetcher(broken) });
  assert.equal(out.commit, COMMIT);
  assert.equal(out.baseline.status, 'failed');
  assert.equal(out.after.status, 'passed');
  assert.equal(out.verdict, 'unverified');
  assert.match(out.diff, /-    return a - b/);
  assert.match(out.diff, /\+    return a \+ b/);
  assert.ok(seen.every((paths) => !paths.includes('.env')), 'credential files never reach the sandbox');
});

test('green before and green after is verified; green before and red after is failed', async () => {
  const same = await runPublicRepoChange({ url: URL, ref: COMMIT, edits: [{ path: 'lib/calc.py', find: 'def add(a, b):', replace: 'def add(a, b):  # sum' }], port: port(), fetchFiles: fetcher(fixed) });
  assert.equal(same.baseline.status, 'passed');
  assert.equal(same.verdict, 'verified');
  const worse = await runPublicRepoChange({ url: URL, ref: COMMIT, edits: [{ path: 'lib/calc.py', find: 'a + b', replace: 'a * b' }], port: port(), fetchFiles: fetcher(fixed) });
  assert.equal(worse.baseline.status, 'passed');
  assert.equal(worse.after.status, 'failed');
  assert.equal(worse.verdict, 'failed');
});

test('a pin that does not match, a missing or ambiguous target, and a denied path are refused before anything is reported', async () => {
  const run = (edits: Parameters<typeof runPublicRepoChange>[0]['edits'], ref = COMMIT) => runPublicRepoChange({ url: URL, ref, edits, port: port(), fetchFiles: fetcher(broken) });
  await assert.rejects(run([{ path: 'lib/calc.py', find: 'a', replace: 'b' }], 'b'.repeat(40)), (e: RepoRunError) => e.code === 'REPO_VERSION_MISMATCH');
  await assert.rejects(run([{ path: 'lib/calc.py', find: 'return', replace: 'x' }, { path: 'lib/calc.py', find: 'nope', replace: 'x' }]), (e: RepoRunError) => e.code === 'CHANGE_REFUSED');
  await assert.rejects(run([{ path: 'missing.py', find: 'a', replace: 'b' }]), (e: RepoRunError) => e.code === 'CHANGE_REFUSED');
  await assert.rejects(run([{ path: '.github/workflows/ci.yml', replace: 'x' }]));
  await assert.rejects(run([]), (e: RepoRunError) => e.code === 'CHANGE_EMPTY');
});

test('the untouched commit and the edited copy are tested at the same time, so a change costs one run, and a deadline that has passed stops both', async () => {
  let active = 0; let peak = 0;
  const slow: ExecutionPort = {
    async execute(request) {
      active++; peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 40));
      active--;
      const result = { exitCode: 0, stdout: '', stderr: 'OK', timedOut: false, killedForLimit: false, durationMs: 40 };
      return { ...result, stages: [{ ...result, id: request.stages![0]!.id }] };
    },
  };
  const out = await runPublicRepoChange({ url: URL, ref: COMMIT, edits: [{ path: 'lib/calc.py', find: 'return a + b', replace: 'return b + a' }], port: slow, fetchFiles: fetcher(fixed) });
  assert.equal(peak, 2, 'both runs were in flight together');
  assert.equal(out.verdict, 'verified');
  const aborted = new AbortController(); aborted.abort();
  const late = await runPublicRepoChange({ url: URL, ref: COMMIT, edits: [{ path: 'lib/calc.py', find: 'return a + b', replace: 'return b + a' }], port: slow, fetchFiles: fetcher(fixed), signal: aborted.signal });
  assert.notEqual(late.verdict, 'verified', 'a run stopped at its deadline is never reported as verified');
});
