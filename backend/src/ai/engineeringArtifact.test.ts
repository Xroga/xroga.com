import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ENGINEERING_ARTIFACT_TYPE,
  ENGINEERING_ARTIFACT_VERSION,
  artifactNextAction,
  artifactStatusFor,
  buildEngineeringArtifact,
  isEngineeringArtifact,
} from './engineeringArtifact.js';

const universalOutput = {
  outcome: 'completed',
  phaseReached: 'complete',
  verified: true,
  reason: 'All validation commands passed.',
  blockers: [],
  commitSha: 'abc1234def5678',
  files: ['src/app/page.tsx', 'src/components/Nav.tsx'],
  evidence: [
    { phase: 'validation', statement: 'npm run build succeeded', detail: 'exit 0' },
    { phase: 'review', statement: 'no blocking findings', detail: '' },
  ],
  repository: {
    owner: 'acme',
    repo: 'site',
    branch: 'xroga/run-1',
    baseBranch: 'main',
    resultingCommitSha: 'abc1234def5678',
    verified: true,
  },
};

// ---------------------------------------------------------------------------
// Phase 9.1 — canonical output has a recognized artifact type
// ---------------------------------------------------------------------------

test('the artifact carries a stable type and version', () => {
  const artifact = buildEngineeringArtifact(universalOutput);
  assert.equal(artifact.type, ENGINEERING_ARTIFACT_TYPE);
  assert.equal(artifact.type, 'engineering_artifact');
  assert.equal(artifact.artifactVersion, ENGINEERING_ARTIFACT_VERSION);
  assert.ok(isEngineeringArtifact(artifact));
});

test('an engineering result is never labelled a landing page', () => {
  // The brief is explicit: generic engineering output must not masquerade as a landing_page,
  // which has an entirely different renderer and set of expectations.
  const artifact = buildEngineeringArtifact(universalOutput);
  assert.notEqual(artifact.type as string, 'landing_page');
});

// ---------------------------------------------------------------------------
// Phase 9.3 / 9.4 — verified and blocked both carry useful information
// ---------------------------------------------------------------------------

test('a verified run reports files, commit and evidence', () => {
  const artifact = buildEngineeringArtifact(universalOutput);
  assert.equal(artifact.status, 'verified');
  assert.equal(artifact.verified, true);
  assert.equal(artifact.fileCount, 2);
  assert.equal(artifact.commitSha, 'abc1234def5678');
  assert.equal(artifact.repository?.owner, 'acme');
  assert.equal(artifact.verificationEvidence.length, 2);
  assert.match(artifact.summary, /Verified/);
  assert.match(artifact.summary, /abc1234/);
});

test('a blocked run stays useful: phase, blocker, files and commit survive', () => {
  // The case that previously rendered as nothing at all. A user must be able to tell a run
  // that did nothing from a run that wrote files and failed its last check.
  const artifact = buildEngineeringArtifact({
    ...universalOutput,
    outcome: 'blocked',
    phaseReached: 'validation',
    verified: false,
    reason: 'typecheck failed',
    blockers: ['TS2345 in src/app/page.tsx'],
  });
  assert.equal(artifact.status, 'blocked');
  assert.equal(artifact.verified, false);
  assert.equal(artifact.fileCount, 2, 'files produced before the block must survive');
  assert.equal(artifact.commitSha, 'abc1234def5678');
  assert.match(artifact.summary, /Blocked at validation/);
  assert.match(artifact.summary, /TS2345/);
  assert.ok(artifact.nextAction, 'a blocked run must suggest something');
});

test('a run that produced nothing is failed, not blocked', () => {
  const artifact = buildEngineeringArtifact({
    outcome: 'refused',
    phaseReached: 'routing',
    verified: false,
    reason: 'no GitHub repository is connected for this project',
    blockers: ['no repository'],
    files: [],
  });
  assert.equal(artifact.status, 'failed');
  assert.equal(artifact.fileCount, 0);
  assert.match(artifact.summary, /Did not produce changes/);
});

// ---------------------------------------------------------------------------
// Phase 9.7 — verified cannot become true without evidence
// ---------------------------------------------------------------------------

test('outcome "completed" without verification is NOT verified', () => {
  // This is the "a model said done" case. `completed` alone must never produce a verified
  // artifact, because the outcome word is the model's phase bookkeeping and `verified` is the
  // system's verdict.
  const artifact = buildEngineeringArtifact({
    ...universalOutput,
    outcome: 'completed',
    verified: false,
  });
  assert.equal(artifact.verified, false);
  assert.equal(artifact.status, 'blocked');
  assert.notEqual(artifact.status as string, 'verified');
});

test('verified status requires both a completed outcome and the verification flag', () => {
  assert.equal(artifactStatusFor('completed', true, 3), 'verified');
  assert.equal(artifactStatusFor('completed', false, 3), 'blocked');
  assert.equal(artifactStatusFor('blocked', true, 3), 'blocked');
  assert.equal(artifactStatusFor('failed', false, 0), 'failed');
});

test('a truthy non-boolean verified value does not count as verification', () => {
  // Defensive: `verified: 'yes'` from a drifting producer must not read as verified.
  const artifact = buildEngineeringArtifact({ ...universalOutput, verified: 'yes' as unknown });
  assert.equal(artifact.verified, false);
});

// ---------------------------------------------------------------------------
// Size discipline — the artifact travels over SSE
// ---------------------------------------------------------------------------

test('the artifact carries a file manifest, never file contents', () => {
  const artifact = buildEngineeringArtifact({
    ...universalOutput,
    files: [{ path: 'src/a.ts', added: 10, removed: 2, contents: 'x'.repeat(500_000) }],
  });
  const serialized = JSON.stringify(artifact);
  assert.ok(serialized.length < 8_000, `artifact serialized to ${serialized.length} bytes`);
  assert.equal(artifact.files[0].path, 'src/a.ts');
  assert.equal(artifact.files[0].added, 10);
  assert.equal((artifact.files[0] as { contents?: unknown }).contents, undefined);
});

// ---------------------------------------------------------------------------
// Robustness — this runs at the end of a build and must not throw
// ---------------------------------------------------------------------------

test('a malformed or empty universal output still produces an artifact', () => {
  // Throwing here would replace a recoverable partial result with no result at all.
  for (const input of [{}, { files: 'not an array' }, { evidence: [null, 3] }, { repository: {} }]) {
    const artifact = buildEngineeringArtifact(input as Record<string, unknown>);
    assert.equal(artifact.type, ENGINEERING_ARTIFACT_TYPE);
    assert.ok(typeof artifact.summary === 'string' && artifact.summary.length > 0);
  }
});

test('files given as plain strings or as records both work', () => {
  const asStrings = buildEngineeringArtifact({ ...universalOutput, files: ['a.ts', 'b.ts'] });
  const asRecords = buildEngineeringArtifact({
    ...universalOutput,
    files: [{ path: 'a.ts' }, { path: 'b.ts', added: 1 }],
  });
  assert.equal(asStrings.fileCount, 2);
  assert.equal(asRecords.fileCount, 2);
  assert.equal(asRecords.files[1].added, 1);
});

test('a repository record without owner or repo is not invented', () => {
  const artifact = buildEngineeringArtifact({ ...universalOutput, repository: { branch: 'x' } });
  assert.equal(artifact.repository, null);
});

// ---------------------------------------------------------------------------
// Next action
// ---------------------------------------------------------------------------

test('next action follows from the phase rather than being generic', () => {
  assert.match(artifactNextAction('blocked', 'validation', null)!, /validation/i);
  assert.match(artifactNextAction('blocked', 'commit', null)!, /repository/i);
  assert.match(artifactNextAction('blocked', 'review', null)!, /review/i);
});

test('a verified run with no commit suggests nothing rather than inventing advice', () => {
  assert.equal(artifactNextAction('verified', 'complete', null), null);
});

test('isEngineeringArtifact rejects everything that is not one', () => {
  for (const value of [null, undefined, 'x', 42, {}, { type: 'landing_page' }, { type: 'engineering_artifact' }]) {
    assert.equal(isEngineeringArtifact(value), false, JSON.stringify(value));
  }
});
