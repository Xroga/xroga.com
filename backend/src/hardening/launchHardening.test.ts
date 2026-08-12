/**
 * The launch-hardening failure matrix.
 *
 * One suite rather than scattered files, so the coverage map is readable as a whole: each
 * `describe`-style section below is an AREA from the hardening matrix, and every test names
 * the scenario it attacks and the safe behaviour required. `docs/launch-hardening-matrix.md`
 * carries the same rows with their classification and evidence.
 *
 * These are adversarial tests. They exist to fail when a boundary weakens, so none of them
 * asserts that something merely "works" — each one asserts that a specific unsafe outcome is
 * refused. Where a test locks in behaviour that was already correct when probed, it says so,
 * because an invariant nobody tests is an invariant that survives by luck.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MODELS } from '../ai/models.js';
import { resolveEndpoint } from '../ai/openaiCompat.js';
import {
  CODING_MODEL_TRANSPORT,
  ProviderPolicyError,
  RESEARCH_MODEL_TRANSPORT,
  assertCodingModel,
  codingModelsOnly,
  isCodingModel,
  requiredCodingTransport,
} from '../ai/providerPolicy.js';
import {
  buildSandboxEnvironment,
  ForbiddenSandboxVariableError,
  SANDBOX_ALLOWED_PASSTHROUGH,
} from '../sandbox/sandboxEnvironment.js';
import {
  planMutation,
  validateRepositoryPath,
  type StartingTree,
} from '../services/integrations/githubMutationPlan.js';
import {
  mayClaimVerified,
  type UniversalRunPlan,
  type ValidationReport,
} from '../synthesis/universalFlow.js';

// ---------------------------------------------------------------------------
// AREA 1 — provider transport isolation
//
// Invariant: ZERO unauthorized provider transport crossover.
// ---------------------------------------------------------------------------

test('AREA 1 — the model registry and the transport policy agree', () => {
  // The binding this whole area rests on. If these ever disagree, the enforcement below
  // starts refusing real traffic, which is the correct direction but needs to be visible
  // here rather than discovered as a production outage.
  for (const [modelId, transport] of Object.entries(CODING_MODEL_TRANSPORT)) {
    assert.equal(
      MODELS[modelId as keyof typeof MODELS]?.provider,
      transport,
      `${modelId} must be registered against ${transport}`,
    );
  }
  for (const [modelId, transport] of Object.entries(RESEARCH_MODEL_TRANSPORT)) {
    assert.equal(MODELS[modelId as keyof typeof MODELS]?.provider, transport);
  }
});

test('AREA 1 — a coding model whose registry entry drifts to another transport is refused', () => {
  // The attack: one edit to `MODELS` reroutes a coding model — and the prompts and source
  // it carries — to a different vendor under a different key. Before this was enforced,
  // `requiredCodingTransport` had no production caller and nothing failed.
  const definition = MODELS.kimi_k3 as { provider: string };
  const original = definition.provider;
  definition.provider = 'openrouter';
  try {
    assert.throws(() => resolveEndpoint('kimi_k3'), ProviderPolicyError);
  } finally {
    definition.provider = original;
  }
});

test('AREA 1 — every coding model is checked, not just the one that regressed', () => {
  for (const modelId of Object.keys(CODING_MODEL_TRANSPORT) as (keyof typeof MODELS)[]) {
    const definition = MODELS[modelId] as unknown as { provider: string };
    const original = definition.provider;
    definition.provider = original === 'openrouter' ? 'moonshot' : 'openrouter';
    try {
      assert.throws(() => resolveEndpoint(modelId), ProviderPolicyError, `${modelId} not enforced`);
    } finally {
      definition.provider = original;
    }
  }
});

test('AREA 1 — research providers cannot acquire coding authority', () => {
  for (const modelId of Object.keys(RESEARCH_MODEL_TRANSPORT)) {
    assert.equal(isCodingModel(modelId), false);
    assert.equal(requiredCodingTransport(modelId), null);
    assert.throws(() => assertCodingModel(modelId, 'implementation'), ProviderPolicyError);
  }
  assert.equal(isCodingModel('tavily'), false);
});

test('AREA 1 — a research model in a fallback chain is dropped, not ranked', () => {
  const chain = [{ modelId: 'kimi_k3' }, { modelId: 'grok_4_5' }, { modelId: 'glm_5_2' }];
  assert.deepEqual(codingModelsOnly(chain).map((c) => c.modelId), ['kimi_k3', 'glm_5_2']);
});

test('AREA 1 — an unrecognised model is refused by default rather than inheriting authority', () => {
  // Allowlist direction: a model added to the registry without a policy entry must not be
  // able to code merely because nothing denied it.
  assert.equal(isCodingModel('some_new_model_2027'), false);
  assert.throws(() => assertCodingModel('some_new_model_2027', 'implementation'), ProviderPolicyError);
});

// ---------------------------------------------------------------------------
// AREA 2 — false completion
//
// Invariant: ZERO publication when validation is failed or unexecuted.
// ---------------------------------------------------------------------------

const PLANNED = {
  status: 'planned',
  blockers: [],
  validations: [{}],
  spec: {},
  architecture: {},
  acceptance: [],
} as unknown as UniversalRunPlan;

function validationReport(overrides: Partial<ValidationReport>): ValidationReport {
  return {
    executed: [],
    passed: true,
    failures: [],
    tierReached: 'sandbox',
    blocker: null,
    ...overrides,
  } as ValidationReport;
}

function executedCommand(phase: string, exitCode: number, optional = false) {
  return {
    validation: {
      phase,
      command: { command: 'npm', args: [], optional },
      componentRoot: '',
      adapterId: 'node',
      sandboxImage: null,
    },
    exitCode,
    stdout: '',
    stderr: '',
    skipped: false,
  };
}

test('AREA 2 — a run that executed nothing cannot claim verification', () => {
  const claim = mayClaimVerified(PLANNED, validationReport({ tierReached: 'none', passed: true }));
  assert.equal(claim.verified, false);
});

test('AREA 2 — a build that compiled but never ran tests cannot claim verification', () => {
  const claim = mayClaimVerified(
    PLANNED,
    validationReport({ executed: [executedCommand('build', 0)] as never }),
  );
  assert.equal(claim.verified, false);
});

test('AREA 2 — an optional test command cannot supply the tests-ran evidence', () => {
  // An optional command is one whose failure does not fail the run, so a passing one proves
  // nothing binding. Counting it would let a best-effort test step satisfy the rule that
  // exists to stop a build being called verified without tests.
  const claim = mayClaimVerified(
    PLANNED,
    validationReport({ executed: [executedCommand('test', 0, true)] as never }),
  );
  assert.equal(claim.verified, false);
});

test('AREA 2 — a skipped test command cannot supply the tests-ran evidence either', () => {
  const skipped = { ...executedCommand('test', 0), skipped: true };
  const claim = mayClaimVerified(PLANNED, validationReport({ executed: [skipped] as never }));
  assert.equal(claim.verified, false);
});

test('AREA 2 — a real passing test run is still accepted, so the gate is not a blanket refusal', () => {
  const claim = mayClaimVerified(
    PLANNED,
    validationReport({ executed: [executedCommand('test', 0), executedCommand('build', 0)] as never }),
  );
  assert.equal(claim.verified, true);
});

test('AREA 2 — outstanding blockers defeat an otherwise green run', () => {
  const claim = mayClaimVerified(
    { ...PLANNED, blockers: ['unresolved security finding'] } as UniversalRunPlan,
    validationReport({ executed: [executedCommand('test', 0)] as never }),
  );
  assert.equal(claim.verified, false);
});

test('AREA 2 — a refused plan cannot be verified even with a green report', () => {
  const claim = mayClaimVerified(
    { ...PLANNED, status: 'refused_no_surface' } as UniversalRunPlan,
    validationReport({ executed: [executedCommand('test', 0)] as never }),
  );
  assert.equal(claim.verified, false);
});

// ---------------------------------------------------------------------------
// AREA 9 — secret isolation
//
// Invariant: ZERO control-plane secret exposure to generated code.
// Canary values only — no real credential is ever read or asserted on.
// ---------------------------------------------------------------------------

const CANARY = 'XROGA_CANARY_e3f1a9c4_MUST_NOT_LEAK';

function withCanaryEnvironment<T>(run: (source: NodeJS.ProcessEnv) => T): T {
  // A synthetic source rather than the real `process.env`, so this test never reads a
  // genuine credential and cannot print one on failure.
  const source: NodeJS.ProcessEnv = {
    PATH: '/usr/bin:/bin',
    HOME: '/home/build',
    SUPABASE_SERVICE_ROLE_KEY: CANARY,
    KIMI_API_KEY: `${CANARY}_kimi`,
    GITHUB_TOKEN: `${CANARY}_gh`,
    DATABASE_URL: `postgres://user:${CANARY}@host/db`,
    VERCEL_TOKEN: `${CANARY}_vercel`,
  };
  return run(source);
}

test('AREA 9 — no control-plane secret reaches a sandboxed build', () => {
  withCanaryEnvironment((source) => {
    const serialized = JSON.stringify(buildSandboxEnvironment({}, source));
    assert.ok(!serialized.includes(CANARY), 'a canary secret reached the sandbox environment');
  });
});

test('AREA 9 — the environment is an allowlist, so a new secret is safe without edits here', () => {
  withCanaryEnvironment((source) => {
    const env = buildSandboxEnvironment({}, { ...source, A_BRAND_NEW_SECRET_2027: CANARY });
    for (const name of Object.keys(env)) {
      const allowed =
        (SANDBOX_ALLOWED_PASSTHROUGH as readonly string[]).includes(name) ||
        name.startsWith('npm_config_') ||
        ['CI', 'NODE_ENV', 'NO_UPDATE_NOTIFIER'].includes(name);
      assert.ok(allowed, `${name} was forwarded without being on the allowlist`);
    }
  });
});

test('AREA 9 — a credential cannot be smuggled in under its own name', () => {
  withCanaryEnvironment((source) => {
    for (const name of ['KIMI_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'GITHUB_TOKEN', 'MY_SECRET']) {
      assert.throws(
        () => buildSandboxEnvironment({ [name]: 'anything' }, source),
        ForbiddenSandboxVariableError,
        `${name} was accepted as a sandbox variable`,
      );
    }
  });
});

test('AREA 9 — a credential cannot be smuggled in under an innocent name', () => {
  // The name screen assumes a leak arrives labelled as what it is. This is the case where
  // it does not: the value is a real server secret, the label is not suspicious.
  withCanaryEnvironment((source) => {
    assert.throws(
      () => buildSandboxEnvironment({ API_BASE_URL: CANARY }, source),
      ForbiddenSandboxVariableError,
    );
    assert.throws(
      () => buildSandboxEnvironment({ BUILD_ID: `${CANARY}_gh` }, source),
      ForbiddenSandboxVariableError,
    );
  });
});

test('AREA 9 — ordinary short extras are still allowed, so the screen is not a blanket refusal', () => {
  withCanaryEnvironment((source) => {
    const env = buildSandboxEnvironment({ XROGA_SANDBOX_WORKDIR: '/workspace/app' }, source);
    assert.equal(env.XROGA_SANDBOX_WORKDIR, '/workspace/app');
  });
});

test('AREA 9 — a thrown sandbox-variable error never contains the value', () => {
  withCanaryEnvironment((source) => {
    try {
      buildSandboxEnvironment({ API_BASE_URL: CANARY }, source);
      assert.fail('expected a refusal');
    } catch (error) {
      const rendered = `${(error as Error).message}${(error as Error).stack ?? ''}`;
      assert.ok(!rendered.includes(CANARY), 'the refusal echoed the secret it refused');
    }
  });
});

// ---------------------------------------------------------------------------
// AREA 4 — repository integrity
//
// Invariant: ZERO repository corruption; ZERO unintended mutation.
// ---------------------------------------------------------------------------

const REPO: StartingTree = {
  treeSha: 'tree-1',
  entries: [
    { path: 'README.md', mode: '100644', sha: 'b1', type: 'blob' },
    { path: 'src/app.ts', mode: '100644', sha: 'b2', type: 'blob' },
    { path: 'src/lib/util.ts', mode: '100644', sha: 'b3', type: 'blob' },
  ],
} as StartingTree;

test('AREA 4 — traversal and absolute paths cannot escape the repository root', () => {
  for (const path of [
    'src/../../etc/passwd',
    '../outside.ts',
    '/etc/passwd',
    'C:\\Windows\\system32\\x.ts',
    './src/a.ts',
    'src/./a.ts',
    'a//b.ts',
    'src/',
    '',
    '   ',
  ]) {
    assert.throws(() => validateRepositoryPath(path), `"${path}" was accepted`);
  }
});

test('AREA 4 — nothing may be written inside .git, in any casing or at any depth', () => {
  for (const path of ['.git/config', '.GIT/config', '.Git/hooks/pre-commit', 'src/.git/objects/x']) {
    assert.throws(() => validateRepositoryPath(path), `"${path}" was accepted`);
  }
});

test('AREA 4 — a path carrying an invisible formatting character is refused', () => {
  // Trojan Source applied to filenames: the committed path is not the path a reviewer sees.
  const rightToLeftOverride = 'src/\u202Egnp.exe.ts';
  const zeroWidthJoiner = 'src/ap\u200Dp.ts';
  const zeroWidthSpace = 'src/\u200Bapp.ts';
  for (const path of [rightToLeftOverride, zeroWidthJoiner, zeroWidthSpace]) {
    assert.throws(() => validateRepositoryPath(path), `${JSON.stringify(path)} was accepted`);
  }
});

test('AREA 4 — a refusal does not echo the bidi override back into whatever reads it', () => {
  try {
    validateRepositoryPath('src/\u202Ex.ts');
    assert.fail('expected a refusal');
  } catch (error) {
    assert.ok(!(error as Error).message.includes('\u202E'));
  }
});

test('AREA 4 — a null byte or control character is refused', () => {
  assert.throws(() => validateRepositoryPath('src/a\0b.ts'));
  assert.throws(() => validateRepositoryPath('src/a\u0007b.ts'));
});

test('AREA 4 — two paths differing only by case cannot enter one tree', () => {
  // Valid to git, unrepresentable on macOS and Windows: one file silently overwrites the
  // other on checkout and the working tree reports a permanent phantom modification.
  assert.throws(
    () => planMutation(REPO, [{ kind: 'create', path: 'readme.md', content: 'x' }]),
    /capitalisation/,
  );
  assert.throws(
    () =>
      planMutation(REPO, [
        { kind: 'create', path: 'src/New.ts', content: 'a' },
        { kind: 'create', path: 'src/new.ts', content: 'b' },
      ]),
    /capitalisation/,
  );
});

test('AREA 4 — deliberately recasing a file is still possible', () => {
  // The collision rule must not break the legitimate operation it resembles, in either
  // request ordering, or the check would be an ordering accident rather than a rule.
  const viaDelete = planMutation(REPO, [
    { kind: 'delete', path: 'README.md' },
    { kind: 'create', path: 'readme.md', content: 'x' },
  ]);
  assert.ok(viaDelete.manifest.length === 2);

  const reordered = planMutation(REPO, [
    { kind: 'create', path: 'readme.md', content: 'x' },
    { kind: 'delete', path: 'README.md' },
  ]);
  assert.ok(reordered.manifest.length === 2);

  const viaRename = planMutation(REPO, [{ kind: 'rename', from: 'README.md', to: 'readme.md' }]);
  assert.ok(viaRename.manifest.length === 1);
});

test('AREA 4 — one commit cannot contain two versions of one file', () => {
  assert.throws(
    () =>
      planMutation(REPO, [
        { kind: 'create', path: 'x.ts', content: 'a' },
        { kind: 'create', path: 'x.ts', content: 'b' },
      ]),
    /two versions/,
  );
});

test('AREA 4 — contradictory operations on one path are refused rather than ordered', () => {
  assert.throws(() =>
    planMutation(REPO, [
      { kind: 'delete', path: 'src/app.ts' },
      { kind: 'update', path: 'src/app.ts', content: 'b' },
    ]),
  );
  assert.throws(() =>
    planMutation(REPO, [
      { kind: 'delete', path: 'src/app.ts' },
      { kind: 'delete', path: 'src/app.ts' },
    ]),
  );
});

test('AREA 4 — a rename cannot silently overwrite an existing file', () => {
  assert.throws(() =>
    planMutation(REPO, [{ kind: 'rename', from: 'src/app.ts', to: 'README.md' }]),
  );
});

test('AREA 4 — creating over an existing path is refused, so an update is never implicit', () => {
  assert.throws(() => planMutation(REPO, [{ kind: 'create', path: 'README.md', content: 'x' }]));
});

test('AREA 4 — an empty mutation cannot produce a commit', () => {
  assert.throws(() => planMutation(REPO, []));
});

test('AREA 4 — files the plan does not touch are recorded as preserved', () => {
  // The guarantee that a small feature request cannot quietly regenerate a repository.
  const plan = planMutation(REPO, [{ kind: 'update', path: 'src/app.ts', content: 'next' }]);
  assert.deepEqual([...plan.preservedPaths].sort(), ['README.md', 'src/lib/util.ts']);
  assert.equal(plan.manifest.length, 1);
});

test('AREA 4 — a plan is bound to the tree it was built against', () => {
  // The writer cannot substitute a different base, which is what makes the compare-and-swap
  // meaningful rather than advisory.
  const plan = planMutation(REPO, [{ kind: 'update', path: 'src/app.ts', content: 'next' }]);
  assert.equal(plan.baseTreeSha, REPO.treeSha);
});
