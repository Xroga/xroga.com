import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertRealResult,
  connectionIsVerified,
  createEvidence,
  generatedFileIsSaved,
  previewIsReady,
  redactSecrets,
  resolveOperationState,
} from './truthfulExecution.js';

describe('truthful execution', () => {
  it('cannot mark a failed API call completed', () => {
    const state = resolveOperationState({
      operation: 'external_api',
      attempted: true,
      evidence: [
        createEvidence({ kind: 'api', operation: 'external_api', ok: false }),
      ],
    });
    assert.equal(state.status, 'failed');
  });

  it('cannot display pushed without successful commit evidence', () => {
    const state = resolveOperationState({
      operation: 'github_push',
      attempted: true,
      evidence: [
        createEvidence({ kind: 'commit', operation: 'github_push', ok: false }),
      ],
    });
    assert.equal(state.status, 'failed');
  });

  it('cannot display a live deployment from simulated evidence', () => {
    const simulated = createEvidence({
      kind: 'deployment',
      operation: 'deployment',
      ok: true,
      simulated: true,
      identifier: 'https://fake.example',
    });
    const state = resolveOperationState({
      operation: 'deployment',
      attempted: true,
      evidence: [simulated],
    });
    assert.equal(state.status, 'simulated');
    assert.throws(() => assertRealResult('https://fake.example', simulated));
  });

  it('requires a persisted token and authenticated probe for connected state', () => {
    assert.equal(connectionIsVerified({ tokenPersisted: true, authenticatedProbeOk: false }), false);
    assert.equal(connectionIsVerified({ tokenPersisted: true, authenticatedProbeOk: true }), true);
  });

  it('requires persistence and reachability before preview ready', () => {
    assert.equal(previewIsReady({ persisted: true, serverReachable: false }), false);
    assert.equal(previewIsReady({ persisted: true, serverReachable: true }), true);
  });

  it('requires a persistence identifier before a generated file is saved', () => {
    assert.equal(
      generatedFileIsSaved({ generated: true, persistenceSucceeded: true }),
      false,
    );
    assert.equal(
      generatedFileIsSaved({
        generated: true,
        persistenceSucceeded: true,
        persistedIdentifier: 'projects/1/app.ts',
      }),
      true,
    );
  });

  it('redacts common secret shapes from evidence and errors', () => {
    const value = redactSecrets('token=gho_abcdefghijklmnopqrstuvwxyz123456');
    assert.equal(value.includes('gho_'), false);
    assert.match(value, /\[REDACTED\]/);
  });
});
