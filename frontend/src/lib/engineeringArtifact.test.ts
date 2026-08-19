import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ENGINEERING_ARTIFACT_TYPE,
  SUPPORTED_ARTIFACT_VERSION,
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
