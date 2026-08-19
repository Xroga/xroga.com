import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ENGINEERING_ARTIFACT_TYPE,
  SUPPORTED_ARTIFACT_VERSION,
  browserVerificationLine,
  engineeringArtifactToText,
  isEngineeringArtifact,
  isRenderableArtifact,
  type EngineeringArtifact,
} from './engineeringArtifact';
import { swarmOutputToText } from './swarm';

const artifact = (over: Partial<EngineeringArtifact> = {}): EngineeringArtifact => ({
  type: ENGINEERING_ARTIFACT_TYPE,
  artifactVersion: 1,
  summary: 'Blocked at validation. 2 files were produced, but TS2345 in src/app/page.tsx',
  status: 'blocked',
  verified: false,
  outcome: 'blocked',
  phaseReached: 'validation',
  reason: 'typecheck failed',
  blockers: ['TS2345 in src/app/page.tsx'],
  files: [{ path: 'src/app/page.tsx', added: 40, removed: 2 }, { path: 'src/lib/util.ts' }],
  fileCount: 2,
  repository: { owner: 'acme', repo: 'site', branch: 'xroga/run-1', commitSha: 'deadbeef1234' },
  commitSha: 'deadbeef1234',
  verificationEvidence: [{ phase: 'implementation', statement: '2 files written', detail: '' }],
  preview: null,
  nextAction: 'The generated code did not pass validation. Review the blockers below.',
  ...over,
});

// ---------------------------------------------------------------------------
// Phase 9.1 / 9.2 — the artifact is recognized
// ---------------------------------------------------------------------------

test('the frontend recognizes the artifact type', () => {
  assert.equal(isEngineeringArtifact(artifact()), true);
  assert.equal(isRenderableArtifact(artifact()), true);
});

test('a future artifact version is declined rather than mis-rendered', () => {
  // For a result that reports whether someone's code was verified, "I cannot display this"
  // beats a confident wrong answer produced by a renderer guessing at an unknown shape.
  const future = artifact({ artifactVersion: SUPPORTED_ARTIFACT_VERSION + 1 });
  assert.equal(isEngineeringArtifact(future), true, 'it is still an artifact');
  assert.equal(isRenderableArtifact(future), false, 'but this frontend must not render it');
});

test('non-artifacts are rejected', () => {
  for (const value of [null, undefined, 'x', 42, {}, { type: 'landing_page' }, { type: 'engineering_artifact' }]) {
    assert.equal(isRenderableArtifact(value), false, JSON.stringify(value));
  }
});

// ---------------------------------------------------------------------------
// Phase 9.6 — the text fallback carries real engineering information
// ---------------------------------------------------------------------------

test('an engineering run never degrades to "Swarm task complete."', () => {
  // The exact defect: swarmOutputToText fell through every branch and returned that string
  // for a run that had produced files and a commit.
  const text = swarmOutputToText(artifact());
  assert.notEqual(text, 'Swarm task complete.');
  assert.ok(text.length > 40, `text was only ${text.length} chars`);
});

test('the text fallback carries blockers, files, repository and commit', () => {
  const text = engineeringArtifactToText(artifact());
  assert.match(text, /TS2345 in src\/app\/page\.tsx/);
  assert.match(text, /src\/lib\/util\.ts/);
  assert.match(text, /acme\/site/);
  assert.match(text, /deadbeef1234/);
  assert.match(text, /Files changed \(2\)/);
});

test('a verified run reports its verification and commit', () => {
  const text = engineeringArtifactToText(
    artifact({
      status: 'verified',
      verified: true,
      outcome: 'completed',
      phaseReached: 'complete',
      summary: 'Verified. 2 files changed, committed as deadbee.',
      blockers: [],
      nextAction: 'Review the commit, then deploy when ready.',
      verificationEvidence: [{ phase: 'validation', statement: 'npm run build succeeded', detail: 'exit 0' }],
    }),
  );
  assert.match(text, /Verified/);
  assert.match(text, /npm run build succeeded/);
  assert.match(text, /Review the commit/);
});

test('a run error recorded alongside the artifact is shown, not hidden', () => {
  // failRun now merges the failure onto the artifact rather than replacing it.
  const text = engineeringArtifactToText(
    artifact({ error: 'Provider timed out while publishing', code: 'BUILD_FAILED' }),
  );
  assert.match(text, /Provider timed out while publishing/);
  // …and the work that did happen is still reported.
  assert.match(text, /deadbeef1234/);
});

test('the text output stays bounded for a large file manifest', () => {
  // A transcript line must not become a thousand-line dump.
  const many = artifact({
    files: Array.from({ length: 400 }, (_, index) => ({ path: `src/generated/file-${index}.ts` })),
    fileCount: 400,
});
  const text = engineeringArtifactToText(many);
  assert.ok(text.length < 3_000, `text was ${text.length} chars`);
  assert.match(text, /and 380 more/);
});

test('an artifact with nothing to report still says something honest', () => {
  const bare = artifact({
    status: 'failed',
    summary: 'Did not produce changes. The run stopped before implementation.',
    blockers: [],
    files: [],
    fileCount: 0,
    repository: null,
    commitSha: null,
    verificationEvidence: [],
    nextAction: null,
});
  const text = engineeringArtifactToText(bare);
  assert.match(text, /Did not produce changes/);
  assert.notEqual(text.trim(), '');
});

// ---------------------------------------------------------------------------
// Regression guard — other output types are untouched
// ---------------------------------------------------------------------------

test('existing output types still render as before', () => {
  assert.equal(swarmOutputToText({ type: 'chat', content: 'hello' }), 'hello');
  assert.equal(swarmOutputToText({ type: 'landing_page' }), '');
  assert.equal(swarmOutputToText({ message: 'a message' }), 'a message');
  assert.equal(swarmOutputToText({ type: 'something_unknown' }), 'Swarm task complete.');
});

// ---------------------------------------------------------------------------
// Browser verification rendering
// ---------------------------------------------------------------------------

  const base = {
    type: 'engineering_artifact' as const,
    artifactVersion: 1,
    summary: 'Blocked at complete. 2 files were produced, but browser verification did not run.',
    status: 'blocked' as const,
    verified: false,
    outcome: 'completed',
    phaseReached: 'complete',
    reason: 'browser verification did not run',
    blockers: [],
    files: [{ path: 'a.tsx' }],
    fileCount: 1,
    repository: null,
    commitSha: 'abc1234',
    verificationEvidence: [],
    preview: null,
    nextAction: null,
  };

test('browser verification: states the reason a check did not run, in the user\'s words', () => {
    const line = browserVerificationLine({
      status: 'not_checked',
      notCheckedReason: 'sandbox_unavailable',
    });
    assert.equal(line, 'Browser verification: not completed — no isolated environment was available to run it in');
    // The one word it must never contain.
    assert.ok(!/passed|verified/i.test(line ?? ''));
});

test('browser verification: says nothing for a project a browser could not judge anyway', () => {
    assert.equal(
      browserVerificationLine({ status: 'not_checked', notCheckedReason: 'not_a_web_project' }),
      null,
    );
});

test('browser verification: carries the exact finding when the page failed', () => {
    const line = browserVerificationLine({
      status: 'failed',
      findings: ['Uncaught page error: TypeError: cart.map is not a function'],
    });
    assert.match(line ?? '', /cart\.map is not a function/);
});

test('browser verification: reports a pass plainly', () => {
    assert.equal(browserVerificationLine({ status: 'passed' }), 'Browser verification: passed');
});

test('browser verification: renders nothing at all for an artifact from a backend that never sent the field', () => {
    assert.equal(browserVerificationLine(undefined), null);
});

test('browser verification: puts the reason and the unchecked criteria into the text form', () => {
    const text = engineeringArtifactToText({
      ...base,
      browserVerification: {
        status: 'not_checked',
        notCheckedReason: 'browser_unavailable',
        criteriaNotChecked: ['The design should feel premium'],
      },
    });
    assert.match(text, /not completed — no browser was available/);
    assert.match(text, /Acceptance criteria not checked:/);
    assert.match(text, /The design should feel premium/);
});

test('browser verification: an unknown future status is ignored rather than guessed at', () => {
    assert.equal(browserVerificationLine({ status: 'something_new' }), null);
});
