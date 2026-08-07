/**
 * Regression coverage for the merged P0 protections.
 *
 * Each P0 shipped with unit tests for the module it introduced. This file is different
 * on purpose: it pins the *invariant* rather than the implementation, at the boundary
 * where a regression would actually be introduced. A refactor that moves secret
 * scrubbing to a new module, or replaces the repo-creation classifier, will keep its own
 * unit tests passing by construction — it will not keep these passing unless the
 * protection genuinely survived.
 *
 * The defects being guarded, each of which reached production once:
 *
 * 1. Generated code ran with every Xroga secret in its environment.
 * 2. Every GitHub 422 was read as "the repository already exists", so a build could
 *    write into a repository it had never created and did not own.
 * 3. Repositories were created public by default.
 * 4. A write went to whatever branch resolution fell back to, not the one requested.
 * 5. A model patch could delete a file's contents and be applied anyway.
 * 6. Per-request Supabase calls multiplied without bound.
 */

import assert from 'node:assert/strict';
import { describe, it, afterEach } from 'node:test';

import {
  buildSandboxEnvironment,
  isForbiddenSandboxVariable,
  ForbiddenSandboxVariableError,
  SANDBOX_ALLOWED_PASSTHROUGH,
} from '../sandbox/sandboxEnvironment.js';
import { buildContainerArgs, setSandboxProvidersForTesting } from '../sandbox/sandboxProviders.js';
import { executeSandboxed } from '../sandbox/sandboxRuntime.js';
import { DEFAULT_SANDBOX_LIMITS, SandboxUnavailableError } from '../sandbox/sandboxTypes.js';

import {
  classifyRepoCreateFailure,
  describeRepoCreateFailure,
  readRepositoryResponse,
  mayAdoptUnselectedRepository,
  nextCandidateName,
  DEFAULT_REPOSITORY_VISIBILITY,
  MAX_NAME_COLLISION_RETRIES,
} from '../services/integrations/githubRepoCreation.js';
import {
  resolveExactWritableBranch,
  ExactBranchWriteError,
  type BranchApi,
} from '../services/integrations/githubBranchSafety.js';

import {
  checkPatchSafety,
  checkPatchResult,
  destructionRatio,
  DESTRUCTIVE_RATIO_THRESHOLD,
} from './patchSafety.js';

import {
  recordSupabaseCall,
  resetSupabaseCounters,
  snapshotSupabaseCounters,
} from '../lib/supabaseCallCounters.js';
import {
  isUserProvisioned,
  markUserProvisioned,
  forgetProvisionedUser,
} from '../services/userProvisioningCache.js';

/* ------------------------------------------------------------------------------------
 * P0-1: generated code must never see an Xroga secret
 * --------------------------------------------------------------------------------- */

describe('P0 regression: secret isolation', () => {
  /**
   * The real secret names, as they appear in production configuration.
   *
   * Listed explicitly rather than generated, because the failure this guards was a
   * denylist that did not predict a name. If someone adds a secret and this list goes
   * stale, the allowlist still protects it — that is exactly the property being asserted.
   */
  const PRODUCTION_SECRET_NAMES = [
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'GITHUB_CLIENT_SECRET',
    'GITHUB_TOKEN',
    'VERCEL_TOKEN',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'DEEPSEEK_API_KEY',
    'MOONSHOT_API_KEY',
    'ZHIPU_API_KEY',
    'OPENROUTER_API_KEY',
    'TAVILY_API_KEY',
    'XAI_API_KEY',
    'ENCRYPTION_KEY',
    'DATABASE_URL',
    'JWT_SECRET',
    'SESSION_SECRET',
  ];

  it('forwards none of the real production secret names', () => {
    const source: NodeJS.ProcessEnv = { PATH: '/usr/bin', HOME: '/home/app' };
    for (const name of PRODUCTION_SECRET_NAMES) source[name] = `value-of-${name}`;

    const env = buildSandboxEnvironment({}, source);

    for (const name of PRODUCTION_SECRET_NAMES) {
      assert.equal(env[name], undefined, `${name} must not reach a sandboxed build`);
    }
    for (const value of Object.values(env)) {
      assert.ok(!value.startsWith('value-of-'), 'no secret value may appear under any name');
    }
  });

  it('stays an allowlist: an unknown new variable is not forwarded', () => {
    // The regression this prevents: a denylist that has to predict every future secret.
    const env = buildSandboxEnvironment({}, {
      PATH: '/usr/bin',
      SOME_FUTURE_CREDENTIAL_WE_HAVE_NOT_INVENTED: 'sensitive',
    });
    assert.equal(env.SOME_FUTURE_CREDENTIAL_WE_HAVE_NOT_INVENTED, undefined);
  });

  it('forwards only names on the published allowlist', () => {
    const source: NodeJS.ProcessEnv = { PATH: '/usr/bin', HOME: '/h', LANG: 'C', WILDCARD: 'x' };
    const env = buildSandboxEnvironment({}, source);
    const enforced = ['CI', 'NODE_ENV', 'NO_UPDATE_NOTIFIER'];
    for (const name of Object.keys(env)) {
      const allowed = SANDBOX_ALLOWED_PASSTHROUGH.includes(name) || name.startsWith('npm_config_') || enforced.includes(name);
      assert.ok(allowed, `${name} was forwarded but is not on the allowlist`);
    }
  });

  it('refuses loudly when a caller tries to smuggle a secret through `extra`', () => {
    assert.throws(
      () => buildSandboxEnvironment({ MY_GITHUB_TOKEN: 'ghp_realtoken' }),
      ForbiddenSandboxVariableError,
    );
  });

  it('never puts the secret value in the refusal message', () => {
    try {
      buildSandboxEnvironment({ SOME_API_KEY: 'sk-do-not-print-me' });
      assert.fail('should have refused');
    } catch (error) {
      assert.ok(error instanceof ForbiddenSandboxVariableError);
      assert.ok(!error.message.includes('sk-do-not-print-me'), 'the message must not leak the value');
      assert.match(error.message, /SOME_API_KEY/);
    }
  });

  it('recognises credential-shaped names regardless of prefix', () => {
    for (const name of ['X_SECRET', 'MY_TOKEN', 'APP_PASSWORD', 'SVC_CREDENTIAL', 'A_PRIVATE_KEY']) {
      assert.equal(isForbiddenSandboxVariable(name), true, `${name} must be recognised`);
    }
  });

  it('does not mistake an ordinary build variable for a credential', () => {
    for (const name of ['PATH', 'HOME', 'LANG', 'NODE_ENV', 'CI']) {
      assert.equal(isForbiddenSandboxVariable(name), false, `${name} is not a credential`);
    }
  });

  it('keeps no secret in the container command line either', () => {
    process.env.XROGA_REGRESSION_FAKE_TOKEN = 'ghp_shouldNeverAppear';
    try {
      const args = buildContainerArgs('node:20-alpine', {
        files: [],
        command: 'npm',
        args: ['run', 'build'],
        timeoutMs: 1000,
        networkPolicy: 'none',
        environment: buildSandboxEnvironment(),
        limits: DEFAULT_SANDBOX_LIMITS,
      });
      assert.ok(!args.join(' ').includes('ghp_shouldNeverAppear'));
    } finally {
      delete process.env.XROGA_REGRESSION_FAKE_TOKEN;
    }
  });
});

/* ------------------------------------------------------------------------------------
 * P0-2: no unsafe fallback when isolation is unavailable
 * --------------------------------------------------------------------------------- */

describe('P0 regression: execution refuses rather than falling back', () => {
  afterEach(() => setSandboxProvidersForTesting(null));

  it('throws instead of running generated code on the API host', async () => {
    setSandboxProvidersForTesting([
      {
        name: 'none-available',
        async probe() {
          return { available: false, runtime: 'none-available', reason: 'runtime_unavailable' as const };
        },
        async execute() {
          throw new Error('must never be called');
        },
      },
    ]);

    await assert.rejects(
      () =>
        executeSandboxed({
          files: [],
          command: 'npm',
          args: ['install'],
          timeoutMs: 1000,
          networkPolicy: 'registry-only',
          environment: buildSandboxEnvironment(),
        }),
      SandboxUnavailableError,
    );
  });

  it('never grants a network to a build that did not ask for a registry', () => {
    const args = buildContainerArgs('node:20-alpine', {
      files: [],
      command: 'npx',
      args: ['tsc'],
      timeoutMs: 1000,
      networkPolicy: 'none',
      environment: {},
      limits: DEFAULT_SANDBOX_LIMITS,
    });
    assert.equal(args[args.indexOf('--network') + 1], 'none');
  });
});

/* ------------------------------------------------------------------------------------
 * P0-3: a 422 is not proof the repository exists, and repos are private
 * --------------------------------------------------------------------------------- */

describe('P0 regression: GitHub repository creation integrity', () => {
  it('does not read an arbitrary 422 as "already exists"', () => {
    // The exact defect: any 422 meant "it exists", so the build wrote into a repository
    // it had never created.
    const verdict = classifyRepoCreateFailure(422, {
      message: 'Repository creation failed.',
      errors: [{ resource: 'Repository', field: 'description', code: 'custom', message: 'is too long' }],
    });
    assert.notEqual(verdict, 'name_taken');
    assert.equal(verdict, 'validation_failed');
  });

  it('treats an invalid name as invalid, not as taken', () => {
    const verdict = classifyRepoCreateFailure(422, {
      message: 'Repository creation failed.',
      errors: [{ resource: 'Repository', field: 'name', code: 'custom', message: 'may only contain ASCII letters' }],
    });
    assert.equal(verdict, 'invalid_name');
  });

  it('still recognises a genuine name collision', () => {
    const verdict = classifyRepoCreateFailure(422, {
      message: 'Repository creation failed.',
      errors: [{ resource: 'Repository', field: 'name', code: 'custom', message: 'name already exists on this account' }],
    });
    assert.equal(verdict, 'name_taken');
  });

  it('separates authorisation and rate limiting from validation', () => {
    assert.equal(classifyRepoCreateFailure(401, null), 'unauthorized');
    assert.equal(classifyRepoCreateFailure(403, null), 'unauthorized');
    assert.equal(classifyRepoCreateFailure(429, null), 'rate_limited');
  });

  it('says nothing was created when nothing was', () => {
    const message = describeRepoCreateFailure('validation_failed', 'my-app');
    assert.match(message, /Nothing was created or modified/i);
  });

  it('leaks no token or raw body in any failure description', () => {
    for (const reason of ['name_taken', 'invalid_name', 'validation_failed', 'unauthorized', 'rate_limited', 'unknown'] as const) {
      const message = describeRepoCreateFailure(reason, 'my-app');
      assert.ok(!/gh[opsu]_|Bearer |token=/i.test(message), `"${message}" must not contain credentials`);
    }
  });

  it('defaults new repositories to private', () => {
    // A public default published a user's source the moment a build succeeded.
    assert.equal(DEFAULT_REPOSITORY_VISIBILITY, 'private');
  });

  it('trusts only fields GitHub returned, never an interpolated name', () => {
    assert.equal(readRepositoryResponse({ full_name: 'someone/thing' }), null, 'a partial body is not a repository');
    assert.equal(readRepositoryResponse(null), null);
    assert.equal(readRepositoryResponse('owner/repo'), null, 'a string is not a repository response');
  });

  it('will not silently adopt a repository the user did not select', () => {
    assert.equal(mayAdoptUnselectedRepository(), false);
  });

  it('bounds collision retries rather than looping', () => {
    assert.ok(MAX_NAME_COLLISION_RETRIES > 0 && MAX_NAME_COLLISION_RETRIES <= 10);
    assert.notEqual(nextCandidateName('app', 1), nextCandidateName('app', 2));
  });
});

/* ------------------------------------------------------------------------------------
 * P0-4: a write goes to the requested branch or nowhere
 * --------------------------------------------------------------------------------- */

describe('P0 regression: writes never land on a fallback branch', () => {
  function api(refs: Record<string, string>, opts: { allowCreate?: boolean } = {}): BranchApi {
    return {
      async getRef(branch) {
        return refs[branch] ? { sha: refs[branch] } : null;
      },
      async createRef(branch, sha) {
        if (opts.allowCreate === false) return false;
        refs[branch] = sha;
        return true;
      },
    };
  }

  it('writes to the exact branch that was asked for', async () => {
    const target = await resolveExactWritableBranch(api({ 'feature/x': 'aaa' }), 'feature/x');
    assert.equal(target.branch, 'feature/x');
    assert.equal(target.sha, 'aaa');
    assert.equal(target.created, false);
  });

  it('refuses rather than falling back to main when the branch cannot be made', async () => {
    // The defect: resolution fell back to a readable branch, so a write intended for a
    // feature branch landed on main.
    await assert.rejects(
      () => resolveExactWritableBranch(api({ main: 'aaa' }, { allowCreate: false }), 'feature/x'),
      (error: unknown) => {
        assert.ok(error instanceof ExactBranchWriteError);
        assert.equal(error.requestedBranch, 'feature/x');
        return true;
      },
    );
  });

  it('never silently retargets the write to a branch that does exist', async () => {
    try {
      await resolveExactWritableBranch(api({ main: 'aaa', develop: 'bbb' }, { allowCreate: false }), 'release/2');
      assert.fail('a write to a missing branch must not succeed against another branch');
    } catch (error) {
      assert.ok(error instanceof ExactBranchWriteError);
      assert.notEqual((error as ExactBranchWriteError).requestedBranch, 'main');
    }
  });
});

/* ------------------------------------------------------------------------------------
 * P0-5: a destructive patch is rejected, not applied
 * --------------------------------------------------------------------------------- */

describe('P0 regression: destructive patches are refused', () => {
  const original = Array.from({ length: 60 }, (_, i) => `export const value${i} = ${i};`).join('\n');

  it('refuses an empty SEARCH against an existing file', () => {
    // The exact defect: `if (!search.trim()) return replace;` replaced the whole file.
    // A truncated model response produces precisely this shape.
    const verdict = checkPatchSafety(original, '');
    assert.equal(verdict.ok, false);
    assert.equal(verdict.rejection, 'empty_search_on_existing_file');
  });

  it('still allows an empty SEARCH to create a file that does not exist', () => {
    assert.equal(checkPatchSafety(null, '', { isNewFile: true }).ok, true);
  });

  it('refuses a patch whose SEARCH matches more than one place', () => {
    // The first match used to win silently, patching an arbitrary occurrence.
    const twice = 'const a = 1;\nconst dup = 2;\nconst b = 3;\nconst dup = 2;\n';
    const verdict = checkPatchSafety(twice, 'const dup = 2;');
    assert.equal(verdict.ok, false);
    assert.equal(verdict.rejection, 'search_ambiguous');
    assert.equal(verdict.matchCount, 2);
  });

  it('refuses to patch a file that changed after the patch was written', () => {
    const verdict = checkPatchSafety(original, 'export const value0 = 0;', {
      expectedSourceHash: 'a-hash-of-some-older-content',
    });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.rejection, 'stale_source');
  });

  it('rejects a patch that empties a file', () => {
    const verdict = checkPatchResult(original, '', {});
    assert.equal(verdict.ok, false, 'emptying a file is not an edit');
    assert.equal(verdict.rejection, 'unexpectedly_destructive');
  });

  it('measures destruction as a ratio, not a line count', () => {
    assert.equal(destructionRatio('abcdefghij', 'abcdefghij'), 0);
    assert.ok(destructionRatio(original, original.slice(0, 10)) > DESTRUCTIVE_RATIO_THRESHOLD);
  });

  it('allows an ordinary edit through', () => {
    const verdict = checkPatchResult(original, `${original}\nexport const extra = 1;`, {});
    assert.equal(verdict.ok, true, 'adding a line must not be treated as destruction');
  });

  it('permits a deliberate deletion when that is the stated intent', () => {
    const verdict = checkPatchResult(original, '', { allowDestructive: true });
    assert.equal(verdict.ok, true, 'an intended delete is not an accidental one');
  });
});

/* ------------------------------------------------------------------------------------
 * P0-6: Supabase calls stay bounded per request
 * --------------------------------------------------------------------------------- */

describe('P0 regression: Supabase egress stays bounded', () => {
  afterEach(() => {
    resetSupabaseCounters();
    forgetProvisionedUser('user-regression');
  });

  it('counts every call so an egress storm is visible rather than silent', () => {
    resetSupabaseCounters();
    recordSupabaseCall({ operation: 'select', table: 'profiles', outcome: 'ok' }, 128);
    recordSupabaseCall({ operation: 'select', table: 'profiles', outcome: 'ok' }, 128);
    const counters = snapshotSupabaseCounters();
    const total = Object.values(counters).reduce((sum, n) => sum + n, 0);
    assert.ok(total >= 2, 'calls must be counted');
  });

  it('provisions a user once rather than on every request', () => {
    forgetProvisionedUser('user-regression');
    assert.equal(isUserProvisioned('user-regression'), false, 'unknown user starts unprovisioned');
    markUserProvisioned('user-regression');
    assert.equal(isUserProvisioned('user-regression'), true, 'the second request must not re-provision');
  });

  it('forgets a user on demand so a stale cache cannot mask a real change', () => {
    markUserProvisioned('user-regression');
    forgetProvisionedUser('user-regression');
    assert.equal(isUserProvisioned('user-regression'), false);
  });
});
