/**
 * The lifecycle is only worth anything if the illegal moves are actually illegal.
 *
 * The specific regression these guard against: the pipeline used to emit `buildOk: true`
 * in a payload sent before QA, so "we generated files" and "the build passed" were the
 * same claim. Every test below is a shortcut somebody could take to make that claim
 * again without doing the work.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FORBIDDEN_SUCCESS_SYNONYMS,
  InvalidVerificationTransitionError,
  SUCCESS_STATES,
  TERMINAL_STATES,
  VERIFICATION_STATES,
  assertTransition,
  canTransition,
  describeVerificationState,
  isSuccessState,
  isVerificationState,
  type VerificationState,
} from './verificationLifecycle.js';

describe('the canonical verification lifecycle', () => {
  it('contains every state the command requires', () => {
    for (const required of [
      'generated_unverified',
      'testing',
      'repairing',
      'verified',
      'repository_written',
      'deployment_pending',
      'deployed',
      'production_verified',
      'blocked',
      'failed',
    ]) {
      assert.ok(
        (VERIFICATION_STATES as readonly string[]).includes(required),
        `${required} must be part of the lifecycle`,
      );
    }
  });

  it('rejects a value that is not a state at all', () => {
    assert.equal(isVerificationState('shipped'), false);
    assert.equal(isVerificationState('ok'), false);
    assert.equal(isVerificationState(undefined), false);
  });
});

describe('premature transitions', () => {
  it('generation alone can never claim verification', () => {
    const verdict = canTransition('generated_unverified', 'verified', { evidenceCount: 99 });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.rejection, 'not_allowed');
  });

  it('generation alone can never claim a repository write, a deployment, or production', () => {
    for (const target of ['repository_written', 'deployed', 'production_verified'] as VerificationState[]) {
      const verdict = canTransition('generated_unverified', target, { evidenceCount: 99 });
      assert.equal(verdict.ok, false, `generated_unverified -> ${target} must be rejected`);
    }
  });

  it('a verified build cannot skip the repository and call itself deployed', () => {
    const verdict = canTransition('verified', 'deployed', { evidenceCount: 1 });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.rejection, 'not_allowed');
  });

  it('a written repository cannot skip the deployment and call itself production verified', () => {
    assert.equal(canTransition('repository_written', 'production_verified', { evidenceCount: 1 }).ok, false);
    assert.equal(canTransition('repository_written', 'deployed', { evidenceCount: 1 }).ok, false);
  });

  it('a deployment that reported success is still not production verified', () => {
    // The legal move exists, but only with evidence that something was actually checked.
    assert.equal(canTransition('deployed', 'production_verified', {}).ok, false);
    assert.equal(canTransition('deployed', 'production_verified', { evidenceCount: 1 }).ok, true);
  });
});

describe('evidence requirements', () => {
  it('refuses to enter a success state with no evidence', () => {
    for (const target of SUCCESS_STATES) {
      const from: VerificationState =
        target === 'verified'
          ? 'testing'
          : target === 'repository_written'
            ? 'verified'
            : target === 'deployed'
              ? 'deployment_pending'
              : 'deployed';
      const verdict = canTransition(from, target, { evidenceCount: 0 });
      assert.equal(verdict.ok, false, `${from} -> ${target} must require evidence`);
      assert.equal(verdict.rejection, 'missing_evidence');
    }
  });

  it('allows the same move once evidence exists', () => {
    assert.equal(canTransition('testing', 'verified', { evidenceCount: 1 }).ok, true);
    assert.equal(canTransition('verified', 'repository_written', { evidenceCount: 1 }).ok, true);
  });

  it('does not require evidence to admit failure', () => {
    assert.equal(canTransition('testing', 'failed').ok, true);
    assert.equal(canTransition('generated_unverified', 'blocked').ok, true);
  });
});

describe('the legal path', () => {
  it('walks generation to production one step at a time', () => {
    const path: VerificationState[] = [
      'generated_unverified',
      'testing',
      'verified',
      'repository_written',
      'deployment_pending',
      'deployed',
      'production_verified',
    ];
    for (let i = 0; i < path.length - 1; i += 1) {
      const verdict = canTransition(path[i], path[i + 1], { evidenceCount: 1 });
      assert.ok(verdict.ok, `${path[i]} -> ${path[i + 1]} should be legal: ${verdict.detail ?? ''}`);
    }
  });

  it('sends a repair back through generation rather than straight to verified', () => {
    assert.equal(canTransition('testing', 'repairing').ok, true);
    assert.equal(canTransition('repairing', 'verified', { evidenceCount: 5 }).ok, false);
    assert.equal(canTransition('repairing', 'generated_unverified').ok, true);
    assert.equal(canTransition('repairing', 'testing').ok, true);
  });
});

describe('terminal states', () => {
  it('cannot be transitioned out of', () => {
    for (const terminal of TERMINAL_STATES) {
      for (const target of VERIFICATION_STATES) {
        const verdict = canTransition(terminal, target, { evidenceCount: 9 });
        assert.equal(verdict.ok, false, `${terminal} -> ${target} must be rejected`);
        assert.equal(verdict.rejection, 'terminal_state');
      }
    }
  });

  it('a failed run cannot be quietly reopened as verified', () => {
    assert.equal(canTransition('failed', 'verified', { evidenceCount: 3 }).ok, false);
    assert.equal(canTransition('blocked', 'deployed', { evidenceCount: 3 }).ok, false);
  });
});

describe('what counts as success', () => {
  it('does not include a generated or unverified state', () => {
    assert.equal(isSuccessState('generated_unverified'), false);
    assert.equal(isSuccessState('testing'), false);
    assert.equal(isSuccessState('repairing'), false);
    assert.equal(isSuccessState('deployment_pending'), false);
  });

  it('never treats the forbidden synonyms as states', () => {
    for (const word of FORBIDDEN_SUCCESS_SYNONYMS) {
      assert.equal(isVerificationState(word), false, `"${word}" must not be a lifecycle state`);
      assert.equal(isSuccessState(word), false, `"${word}" must never read as success`);
    }
  });
});

describe('assertTransition', () => {
  it('throws a typed error rather than returning a verdict', () => {
    assert.throws(
      () => assertTransition('generated_unverified', 'production_verified', { evidenceCount: 1 }),
      (error: unknown) => {
        assert.ok(error instanceof InvalidVerificationTransitionError);
        assert.equal(error.code, 'INVALID_VERIFICATION_TRANSITION');
        assert.equal(error.rejection, 'not_allowed');
        return true;
      },
    );
  });

  it('is silent on a legal move', () => {
    assert.doesNotThrow(() => assertTransition('testing', 'verified', { evidenceCount: 1 }));
  });
});

describe('descriptions', () => {
  it('describes every state, and never calls an unverified one successful', () => {
    for (const state of VERIFICATION_STATES) {
      const text = describeVerificationState(state);
      assert.ok(text.length > 0, `${state} needs a description`);
    }
    assert.match(describeVerificationState('generated_unverified'), /not verified/i);
    assert.match(describeVerificationState('deployed'), /has not been checked/i);
  });
});
