import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

import { browserVerificationAdapter } from './browserVerificationAdapter.js';
import { gatePermitsVerified } from './webVerificationGate.js';
import { buildEngineeringArtifact } from '../ai/engineeringArtifact.js';
import type { ProjectFile } from '../ai/patches.js';

/**
 * The adapter that gives browser verification a production caller.
 *
 * The one thing these tests must establish beyond the unit rules: the universal path really
 * hands this function to canonical execution, and every path through it either produces real
 * browser evidence or says explicitly that it did not.
 */

const webFiles: ProjectFile[] = [
  {
    path: 'package.json',
    content: JSON.stringify({
      dependencies: { next: '15.0.0', react: '19.0.0' },
      scripts: { dev: 'next dev', build: 'next build' },
    }),
  },
  { path: 'src/app/page.tsx', content: 'export default () => <h1>Hi</h1>;' },
];

const cliFiles: ProjectFile[] = [
  { path: 'package.json', content: JSON.stringify({ bin: { t: 'cli.js' }, scripts: { build: 'tsc' } }) },
];

const input = (files: ProjectFile[], signal?: AbortSignal) => ({
  files, buildPassed: true, testsPassed: null as boolean | null, signal,
});

const available = async () => true;
const unavailable = async () => false;

// ---------------------------------------------------------------------------
// Test 1 — there is a real production caller
// ---------------------------------------------------------------------------

test('productionAdapters supplies browserVerify to canonical execution', () => {
  // Without this, everything else in this slice is dead code with good tests.
  const source = readFileSync(new URL('./productionAdapters.ts', import.meta.url), 'utf8');
  assert.match(source, /browserVerify: browserVerificationAdapter\(/);
  assert.match(source, /import \{ browserVerificationAdapter \}/);
});

// ---------------------------------------------------------------------------
// Test 2 — non-web projects are not browser-verified
// ---------------------------------------------------------------------------

test('a CLI project is reported not_a_web_project and is not blocked', async () => {
  const verify = browserVerificationAdapter({ sandboxAvailable: available, browserPresent: available });
  const result = await verify(input(cliFiles));
  assert.equal(result.status, 'not_checked');
  assert.equal(result.notCheckedReason, 'not_a_web_project');
  // Correct behaviour, not an infrastructure gap — so no blocker is raised.
  assert.equal(result.blocker, null);
});

// ---------------------------------------------------------------------------
// Preconditions each report their own reason
// ---------------------------------------------------------------------------

test('a missing sandbox is reported as such, and never as a pass', async () => {
  const verify = browserVerificationAdapter({ sandboxAvailable: unavailable, browserPresent: available });
  const result = await verify(input(webFiles));
  assert.equal(result.notCheckedReason, 'sandbox_unavailable');
  assert.equal(gatePermitsVerified(result), false);
  assert.match(result.blocker ?? '', /incomplete rather than passed/);
});

test('a missing browser is reported separately from a missing sandbox', async () => {
  // The fixes differ: one is a provider to configure, the other an image to build.
  const verify = browserVerificationAdapter({ sandboxAvailable: available, browserPresent: unavailable });
  const result = await verify(input(webFiles));
  assert.equal(result.notCheckedReason, 'browser_unavailable');
  assert.equal(gatePermitsVerified(result), false);
});

test('a web project declaring no serve script is reported rather than guessed at', async () => {
  const files: ProjectFile[] = [
    { path: 'package.json', content: JSON.stringify({ dependencies: { react: '19' }, scripts: { build: 'vite build' } }) },
    { path: 'index.html', content: '<html></html>' },
  ];
  const verify = browserVerificationAdapter({ sandboxAvailable: available, browserPresent: available });
  const result = await verify(input(files));
  assert.equal(result.notCheckedReason, 'no_start_command');
});

test('cancellation short-circuits before any sandbox or browser work', async () => {
  const controller = new AbortController();
  controller.abort();
  let probed = false;
  const verify = browserVerificationAdapter({
    sandboxAvailable: async () => { probed = true; return true; },
    browserPresent: available,
  });
  const result = await verify(input(webFiles, controller.signal));
  assert.equal(result.notCheckedReason, 'cancelled');
  assert.equal(probed, false, 'a cancelled run must not start sandbox work');
});

test('no precondition failure ever licenses a verified claim', async () => {
  for (const [sandbox, browser, files] of [
    [unavailable, available, webFiles],
    [available, unavailable, webFiles],
    [available, available, cliFiles],
  ] as const) {
    const verify = browserVerificationAdapter({ sandboxAvailable: sandbox, browserPresent: browser });
    assert.equal(gatePermitsVerified(await verify(input([...files]))), false);
  }
});

// ---------------------------------------------------------------------------
// Uncheckable acceptance criteria travel with the result
// ---------------------------------------------------------------------------

test('criteria that cannot be checked are carried, not silently dropped', async () => {
  const verify = browserVerificationAdapter({
    acceptanceCriteria: ['The design should feel premium', 'The page shows "Welcome"'],
    sandboxAvailable: unavailable,
    browserPresent: available,
  });
  const result = await verify(input(webFiles));
  assert.deepEqual(result.criteriaNotChecked, ['The design should feel premium']);
});

// ---------------------------------------------------------------------------
// Artifact integration
// ---------------------------------------------------------------------------

test('the artifact carries browser evidence without breaking v1 consumers', () => {
  const artifact = buildEngineeringArtifact(
    {
      outcome: 'completed', phaseReached: 'complete', verified: true, reason: 'ok',
      blockers: [], files: ['a.ts'], evidence: [],
    },
    {
      browserVerification: {
        status: 'passed',
        url: 'http://localhost:3000',
        passedChecks: ['build', 'http', 'dom', 'page_errors'],
        screenshots: ['/tmp/desktop.png'],
      },
    },
  );
  // v1 shape is unchanged — the version does not move, so existing renderers still accept it.
  assert.equal(artifact.artifactVersion, 1);
  assert.equal(artifact.type, 'engineering_artifact');
  assert.equal(artifact.browserVerification?.status, 'passed');
});

test('an artifact for a run with no browser surface omits the field entirely', () => {
  const artifact = buildEngineeringArtifact({
    outcome: 'completed', phaseReached: 'complete', verified: true, reason: 'ok',
    blockers: [], files: ['a.ts'], evidence: [],
  });
  assert.equal(artifact.browserVerification, undefined);
});

test('a blocked artifact preserves the browser failure alongside the work produced', () => {
  const artifact = buildEngineeringArtifact(
    {
      outcome: 'blocked', phaseReached: 'validation', verified: false,
      reason: 'browser verification failed',
      blockers: ['Uncaught page error: ReferenceError: foo is not defined'],
      commitSha: 'abc1234', files: ['src/a.tsx', 'src/b.tsx'], evidence: [],
    },
    {
      browserVerification: {
        status: 'failed',
        blocker: 'The page threw an uncaught error at runtime.',
        findings: ['Uncaught page error: ReferenceError: foo is not defined'],
      },
    },
  );
  assert.equal(artifact.status, 'blocked');
  assert.equal(artifact.verified, false);
  // The work that did happen survives — the whole point of the blocked artifact.
  assert.equal(artifact.fileCount, 2);
  assert.equal(artifact.commitSha, 'abc1234');
  assert.equal(artifact.browserVerification?.status, 'failed');
  assert.match(artifact.summary, /ReferenceError/);
});

test('a not_checked browser result never makes the artifact claim verification', () => {
  const artifact = buildEngineeringArtifact(
    {
      outcome: 'completed', phaseReached: 'complete', verified: false, reason: 'validation passed',
      blockers: [], files: ['a.ts'], evidence: [],
    },
    { browserVerification: { status: 'not_checked', notCheckedReason: 'sandbox_unavailable' } },
  );
  assert.equal(artifact.verified, false);
  assert.notEqual(artifact.status, 'verified');
});
