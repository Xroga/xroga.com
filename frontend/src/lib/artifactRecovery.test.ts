import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  engineeringArtifactToText,
  isRenderableArtifact,
  type EngineeringArtifact,
} from './engineeringArtifact';
import { swarmOutputToText } from './swarm';
import { isRecoverableBuildOutput } from './recoveredBuildOutput';

/**
 * The six behaviours that must hold for this change to be safe to merge.
 *
 * These model the *recovery* decision — what `streamSwarmExecute`'s polling fallback does with
 * a persisted run — rather than calling it directly, because calling it needs a live fetch and
 * a Supabase session. The branch logic under test is small and exact, so it is reproduced here
 * against the same helpers production uses, and any drift in those helpers fails these tests.
 */

const blockedArtifact: EngineeringArtifact = {
  type: 'engineering_artifact',
  artifactVersion: 1,
  summary: 'Blocked at validation. 2 files were produced, but TS2345 in src/app/page.tsx',
  status: 'blocked',
  verified: false,
  outcome: 'blocked',
  phaseReached: 'validation',
  reason: 'typecheck failed',
  blockers: ['TS2345 in src/app/page.tsx'],
  files: [{ path: 'src/app/page.tsx', added: 40 }, { path: 'src/lib/util.ts' }],
  fileCount: 2,
  repository: { owner: 'acme', repo: 'site', branch: 'xroga/run-1', commitSha: 'deadbeef1234' },
  commitSha: 'deadbeef1234',
  verificationEvidence: [{ phase: 'implementation', statement: '2 files written', detail: '' }],
  preview: null,
  nextAction: 'The generated code did not pass validation. Review the blockers below.',
};

const verifiedArtifact: EngineeringArtifact = {
  ...blockedArtifact,
  summary: 'Verified. 2 files changed, committed as deadbee.',
  status: 'verified',
  verified: true,
  outcome: 'completed',
  phaseReached: 'complete',
  reason: 'all checks passed',
  blockers: [],
  nextAction: 'Review the commit, then deploy when ready.',
};

/** The recovery branch as `api.ts` implements it: deliver an artifact, throw only without one. */
function recover(run: { status: string; output: unknown }):
  | { delivered: true; text: string; output: unknown }
  | { delivered: false; error: string } {
  if (run.status === 'error') {
    if (isRecoverableBuildOutput(run.output)) {
      return {
        delivered: true,
        text: isRenderableArtifact(run.output) ? engineeringArtifactToText(run.output) : '',
        output: run.output,
      };
    }
    const output = run.output as { error?: string } | null;
    return { delivered: false, error: output?.error ?? 'The persisted build failed.' };
  }
  const text = swarmOutputToText(run.output);
  return {
    delivered: true,
    text: text || (isRenderableArtifact(run.output) ? engineeringArtifactToText(run.output) : 'Swarm task complete.'),
    output: run.output,
  };
}

// ---------------------------------------------------------------------------
// 1. A verified artifact renders correctly
// ---------------------------------------------------------------------------

test('a verified engineering artifact is recognised and renders', () => {
  assert.equal(isRenderableArtifact(verifiedArtifact), true);
  const text = engineeringArtifactToText(verifiedArtifact);
  assert.match(text, /Verified/);
  assert.match(text, /deadbeef1234/);
  assert.match(text, /acme\/site/);
  assert.match(text, /Review the commit/);
});

// ---------------------------------------------------------------------------
// 2. A blocked artifact renders correctly
// ---------------------------------------------------------------------------

test('a blocked engineering artifact is recognised and renders with its blockers', () => {
  assert.equal(isRenderableArtifact(blockedArtifact), true);
  const text = engineeringArtifactToText(blockedArtifact);
  assert.match(text, /Blocked at validation/);
  assert.match(text, /TS2345 in src\/app\/page\.tsx/);
  // The work that did happen is still visible — that is the whole point.
  assert.match(text, /src\/lib\/util\.ts/);
  assert.match(text, /deadbeef1234/);
});

// ---------------------------------------------------------------------------
// 3. status=error with an artifact does not discard it
// ---------------------------------------------------------------------------

test('a persisted error run carrying an artifact delivers it instead of throwing', () => {
  // The exact defect: this branch used to throw "The persisted build failed." and drop
  // blockers, files, evidence and the commit SHA on the floor.
  const result = recover({ status: 'error', output: blockedArtifact });
  assert.equal(result.delivered, true);
  assert.ok(result.delivered && result.text.includes('TS2345'));
  assert.ok(result.delivered && result.text.includes('deadbeef1234'));
  assert.equal(result.delivered && (result.output as EngineeringArtifact).fileCount, 2);
});

test('an error run whose artifact also carries a late failure shows both', () => {
  // `failRun` merges the failure onto the artifact rather than replacing it.
  const withFailure = { ...blockedArtifact, error: 'Provider timed out while publishing', code: 'BUILD_FAILED' };
  const result = recover({ status: 'error', output: withFailure });
  assert.equal(result.delivered, true);
  assert.ok(result.delivered && result.text.includes('Provider timed out while publishing'));
  assert.ok(result.delivered && result.text.includes('deadbeef1234'), 'the work still shows');
});

// ---------------------------------------------------------------------------
// 4. Dropped SSE reconstructed through polling yields the same useful artifact
// ---------------------------------------------------------------------------

test('the polling path reconstructs the same artifact the live stream would have delivered', () => {
  // Zero SSE bytes: the client only ever sees the persisted row.
  const live = engineeringArtifactToText(verifiedArtifact);
  const recovered = recover({ status: 'complete', output: verifiedArtifact });
  assert.equal(recovered.delivered, true);
  assert.equal(recovered.delivered && recovered.text, live, 'recovery must not degrade the result');
});

test('a blocked run reconstructed from persistence matches the live result too', () => {
  const live = engineeringArtifactToText(blockedArtifact);
  const recovered = recover({ status: 'error', output: blockedArtifact });
  assert.equal(recovered.delivered && recovered.text, live);
});

// ---------------------------------------------------------------------------
// 5. A plain early failure still behaves normally
// ---------------------------------------------------------------------------

test('a failure with no artifact still throws with its real reason and code', () => {
  // Preserving artifacts must not stop ordinary failures surfacing as failures.
  const result = recover({
    status: 'error',
    output: { type: 'error', error: 'Out of actions', code: 'OUT_OF_ACTIONS' },
  });
  assert.equal(result.delivered, false);
  assert.equal(result.delivered === false && result.error, 'Out of actions');
});

test('a failure with no output at all still reports the generic message', () => {
  const result = recover({ status: 'error', output: null });
  assert.equal(result.delivered, false);
  assert.equal(result.delivered === false && result.error, 'The persisted build failed.');
});

// ---------------------------------------------------------------------------
// 6. Existing non-engineering output types are unaffected
// ---------------------------------------------------------------------------

test('landing_page, chat, image and unknown outputs are untouched', () => {
  assert.equal(swarmOutputToText({ type: 'landing_page' }), '');
  assert.equal(swarmOutputToText({ type: 'chat', content: 'hello' }), 'hello');
  assert.equal(swarmOutputToText({ message: 'a message' }), 'a message');
  assert.equal(swarmOutputToText({ type: 'something_unknown' }), 'Swarm task complete.');
  assert.match(
    swarmOutputToText({ type: 'image', imageUrl: 'https://x/y.png', prompt: 'a cat' }),
    /!\[a cat\]\(https:\/\/x\/y\.png\)/,
  );
});

test('a persisted error run carrying generated landing source delivers it instead of going blank', () => {
  const output = {
    type: 'landing_page',
    projectName: 'Orbit Coffee',
    html: '<!doctype html><html><body><main>Orbit Coffee</main></body></html>',
    css: 'body { color: #fff; }',
    js: '',
    shipBlockers: ['Vercel authorization is required'],
  };
  const result = recover({ status: 'error', output });
  assert.equal(result.delivered, true);
  assert.equal(result.delivered && result.output, output);
});

test('a placeholder landing output without generated source remains a real failure', () => {
  assert.equal(isRecoverableBuildOutput({ type: 'landing_page' }), false);
  const result = recover({ status: 'error', output: { type: 'landing_page', error: 'No source' } });
  assert.equal(result.delivered, false);
});

test('a successful non-engineering run still recovers as before', () => {
  const result = recover({ status: 'complete', output: { type: 'chat', content: 'hello' } });
  assert.equal(result.delivered && result.text, 'hello');
});

test('a run whose output says nothing still gets the generic sentence', () => {
  // The fallback must survive for outputs that genuinely carry nothing.
  const result = recover({ status: 'complete', output: { type: 'something_unknown' } });
  assert.equal(result.delivered && result.text, 'Swarm task complete.');
});

test('a non-artifact object is never mistaken for one', () => {
  for (const value of [null, { type: 'landing_page' }, { type: 'engineering_artifact' }, { artifactVersion: 1 }]) {
    assert.equal(isRenderableArtifact(value), false, JSON.stringify(value));
  }
});
