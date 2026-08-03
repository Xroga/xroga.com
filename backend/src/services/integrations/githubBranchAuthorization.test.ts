import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BranchAuthorizationError,
  authorizeBranchWrite,
  describeBranchAuthorizationRefusal,
  type BranchProtectionApi,
} from './githubBranchAuthorization.js';

/**
 * Cover for direct writes to branches other people's work depends on.
 *
 * A generated build landing on `main` without anybody choosing that is the difference
 * between "here is a change for review" and "your default branch is now whatever the
 * model produced". Authorization is never inferred — not from the branch existing, not
 * from the user owning the repository, and specifically not from a protection check that
 * failed to answer.
 */

function protectionApi(protectedBranches: string[], opts: { unreachable?: boolean } = {}): BranchProtectionApi {
  return {
    async isBranchProtected(branch) {
      if (opts.unreachable) return null;
      return protectedBranches.includes(branch);
    },
  };
}

test('a run branch needs no authorization', async () => {
  const decision = await authorizeBranchWrite(protectionApi([]), {
    branch: 'xroga/run-7',
    defaultBranch: 'main',
  });
  assert.deepEqual(decision, {
    branch: 'xroga/run-7',
    requiresAuthorization: false,
    authorized: true,
    reason: 'run_branch',
  });
});

test('reproduces the defect: the default branch is refused without explicit approval', async () => {
  await assert.rejects(
    authorizeBranchWrite(protectionApi([]), { branch: 'main', defaultBranch: 'main' }),
    (error: unknown) => {
      assert.ok(error instanceof BranchAuthorizationError);
      assert.equal(error.reason, 'default_branch_requires_authorization');
      assert.equal(error.branch, 'main');
      return true;
    },
  );
});

test('a protected non-default branch is refused without explicit approval', async () => {
  await assert.rejects(
    authorizeBranchWrite(protectionApi(['release/v2']), {
      branch: 'release/v2',
      defaultBranch: 'main',
    }),
    (error: unknown) => {
      assert.ok(error instanceof BranchAuthorizationError);
      assert.equal(error.reason, 'protected_branch_requires_authorization');
      return true;
    },
  );
});

test('an unanswerable protection check is treated as protected', async () => {
  // The safe answer to "is this branch protected?" when we cannot tell is yes. Reading
  // an unreachable API as "not protected" would turn every outage into permission.
  await assert.rejects(
    authorizeBranchWrite(protectionApi([], { unreachable: true }), {
      branch: 'develop',
      defaultBranch: 'main',
    }),
    (error: unknown) => {
      assert.ok(error instanceof BranchAuthorizationError);
      assert.equal(error.reason, 'protection_unknown');
      return true;
    },
  );
});

test('a protection check that throws is treated as protected, not as permission', async () => {
  const api: BranchProtectionApi = {
    async isBranchProtected() {
      throw new Error('network down');
    },
  };
  await assert.rejects(
    authorizeBranchWrite(api, { branch: 'develop', defaultBranch: 'main' }),
    (error: unknown) => {
      assert.ok(error instanceof BranchAuthorizationError);
      assert.equal(error.reason, 'protection_unknown');
      return true;
    },
  );
});

test('explicit authorization permits the write and is recorded as the reason', async () => {
  const decision = await authorizeBranchWrite(protectionApi([]), {
    branch: 'main',
    defaultBranch: 'main',
    directWriteAuthorized: true,
  });
  assert.deepEqual(decision, {
    branch: 'main',
    requiresAuthorization: true,
    authorized: true,
    reason: 'explicitly_authorized',
  });
});

test('only the literal true authorizes — no truthy value stands in for a decision', async () => {
  for (const value of ['yes', 1, {}, 'true'] as unknown[]) {
    await assert.rejects(
      authorizeBranchWrite(protectionApi([]), {
        branch: 'main',
        defaultBranch: 'main',
        directWriteAuthorized: value as boolean,
      }),
      BranchAuthorizationError,
      JSON.stringify(value),
    );
  }
});

test('the default branch is matched through a refs/heads/ prefix on either side', async () => {
  await assert.rejects(
    authorizeBranchWrite(protectionApi([]), {
      branch: 'refs/heads/main',
      defaultBranch: 'main',
    }),
    BranchAuthorizationError,
  );
});

test('a branch with no name is refused rather than defaulted', async () => {
  await assert.rejects(
    authorizeBranchWrite(protectionApi([]), { branch: '   ', defaultBranch: 'main' }),
    (error: unknown) => {
      assert.ok(error instanceof BranchAuthorizationError);
      assert.equal(error.reason, 'protection_unknown');
      return true;
    },
  );
});

test('the default branch is not re-checked against the protection API', async () => {
  // It needs authorization regardless of any protection rule, so asking would only add a
  // way for an API outage to change the answer.
  let asked = false;
  const api: BranchProtectionApi = {
    async isBranchProtected() {
      asked = true;
      return false;
    },
  };
  await assert.rejects(
    authorizeBranchWrite(api, { branch: 'main', defaultBranch: 'main' }),
    BranchAuthorizationError,
  );
  assert.equal(asked, false);
});

test('every refusal has a sanitised, human-readable description', () => {
  for (const reason of [
    'default_branch_requires_authorization',
    'protected_branch_requires_authorization',
    'protection_unknown',
  ] as const) {
    const message = describeBranchAuthorizationRefusal(reason);
    assert.ok(message.length > 10, reason);
    assert.doesNotMatch(message, /Bearer |gho_|ghp_/, reason);
  }
});
