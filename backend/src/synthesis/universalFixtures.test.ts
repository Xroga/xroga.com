/**
 * Black-box universality fixtures — §58 through §63.
 *
 * These treat the universal path as a box: a request goes in, a plan comes out, and the
 * assertions are about what came out rather than how. The point is stated in §58: prove
 * the central pipeline is not category-bound. Every one of these would have produced
 * `index.html`, `styles.css` and `script.js` before this command.
 *
 * The Python FastAPI slice (§63) is the mandatory one and is treated separately, including
 * the part that cannot be run here and is recorded as a blocker rather than faked.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import type { ProjectFile } from '../ai/patches.js';
import { planUniversalRun, runValidationPlan, mayClaimVerified } from './universalFlow.js';
import { compileAcceptanceCriteria, unfalsifiableCriteria, automatedCriteria } from './acceptanceCompiler.js';
import { synthesizeUniversalProductSpec } from './universalProductSpec.js';

const f = (path: string, content = ''): ProjectFile => ({ path, content });
const run = (prompt: string, files: ProjectFile[] = []) => planUniversalRun({ prompt, files });
const languagesOf = (prompt: string, files: ProjectFile[] = []) =>
  [...new Set(run(prompt, files).architecture.components.map((component) => component.language))];

const ok = async () => ({ exitCode: 0, stdout: '', stderr: '' });

describe('§58 — the central pipeline is not category-bound', () => {
  it('A. a Rust CLI converting CSV to JSON', () => {
    const plan = run('Build a Rust CLI that converts CSV files to JSON');
    assert.deepEqual(languagesOf('Build a Rust CLI that converts CSV files to JSON'), ['rust']);
    assert.ok(plan.spec.surfaces.some((s) => s.surface === 'cli'));
    assert.ok(
      plan.acceptance.some((criterion) => criterion.kind === 'cli'),
      'a CLI must get CLI acceptance criteria, not page-section checks',
    );
    assert.ok(
      !plan.architecture.components.some((component) => component.framework === 'next'),
      'and no web framework',
    );
  });

  it('B. a Python FastAPI API with SQLite', () => {
    const prompt = 'Build a Python FastAPI task-management API with SQLite, CRUD, validation, tests, Dockerfile and README';
    const plan = run(prompt);
    assert.deepEqual(languagesOf(prompt), ['python']);
    assert.equal(
      plan.architecture.decisions.find((decision) => decision.category === 'framework')?.selection,
      'fastapi',
    );
    assert.equal(
      plan.architecture.decisions.find((decision) => decision.category === 'database')?.selection,
      'sqlite',
    );
    assert.ok(plan.acceptance.some((criterion) => criterion.kind === 'api'));
    assert.ok(plan.acceptance.some((criterion) => criterion.kind === 'database'));
  });

  it('C. a TypeScript browser extension', () => {
    const plan = run('Build a TypeScript browser extension that summarizes the current page');
    assert.ok(plan.spec.surfaces.some((s) => s.surface === 'browser_extension'));
    assert.deepEqual(languagesOf('Build a TypeScript browser extension that summarizes the current page'), ['typescript']);
    assert.ok(
      plan.acceptance.some((criterion) => /permissions/.test(criterion.statement)),
      'extension criteria must cover declared permissions',
    );
  });

  it('D. a Go service with a background worker gets both surfaces', () => {
    const found = run('Build a Go HTTP service with PostgreSQL and a background cleanup worker')
      .spec.surfaces.map((s) => s.surface);
    assert.ok(found.includes('api'));
    assert.ok(found.includes('worker'), 'the worker surface, which a single-answer detector drops');
    assert.deepEqual(languagesOf('Build a Go HTTP service with PostgreSQL and a background cleanup worker'), ['go']);
  });

  it('E. a Flutter mobile app with offline persistence', () => {
    const prompt = 'Build a Flutter mobile expense tracker with offline persistence';
    assert.deepEqual(languagesOf(prompt), ['dart']);
    const plan = run(prompt);
    assert.ok(plan.spec.storageRequirements.some((requirement) => /offline|local/i.test(requirement)));
    assert.ok(
      !plan.architecture.components.some((component) => component.language === 'typescript'),
      'a mobile app must not acquire a forced web frontend',
    );
  });

  it('I. a Python package with no server needs no deployment', () => {
    const plan = run('Build a Python package with no server');
    assert.deepEqual(languagesOf('Build a Python package with no server'), ['python']);
    assert.ok(
      !plan.architecture.decisions.some((decision) => decision.category === 'database'),
      'a library needs no datastore',
    );
    assert.ok(plan.acceptance.some((criterion) => criterion.kind === 'package'));
  });

  it('J. a Terraform module produces infrastructure, not an application', () => {
    const plan = run('Build a Terraform infrastructure module for an S3 bucket');
    assert.ok(plan.spec.surfaces.some((s) => s.surface === 'infrastructure_module'));
    assert.ok(
      !plan.spec.surfaces.some((s) => s.surface === 'web_frontend'),
      'infrastructure has no frontend',
    );
  });

  it('K. a Solidity contract with a client produces several outputs', () => {
    const surfaces = run('Build a Solidity smart contract with a web client').spec.surfaces.map((s) => s.surface);
    assert.ok(surfaces.includes('smart_contract'));
    assert.ok(surfaces.includes('web_frontend'), 'a contract needs a client to be usable by a person');
  });

  it('N. a category absent from every list still plans', () => {
    // The strongest single check in §58. No blueprint, no scaffold, no template.
    const plan = run(
      'Build a service that reconciles ledger entries between two accounting systems every night and reports discrepancies',
    );
    assert.notEqual(plan.status, 'refused_no_surface');
    assert.ok(plan.architecture.components.length > 0);
    assert.ok(plan.acceptance.length > 0, 'and it must be checkable');
    assert.ok(
      !plan.architecture.components.some((component) => component.framework === 'next'),
      'no static or web fallback',
    );
  });
});

describe('§59 — a polyglot repository keeps its component boundaries', () => {
  const polyglot = [
    f('frontend/package.json', JSON.stringify({ name: 'web', scripts: { build: 'vite build', test: 'vitest run' } })),
    f('frontend/tsconfig.json', '{}'),
    f('frontend/src/main.ts', ''),
    f('service/pyproject.toml', '[tool.poetry]\nname = "svc"\n[tool.pytest.ini_options]\n'),
    f('service/poetry.lock', ''),
    f('service/tests/test_api.py', ''),
    f('worker/Cargo.toml', '[package]\nname = "worker"\n'),
    f('worker/Cargo.lock', ''),
    f('worker/src/main.rs', ''),
  ];

  it('detects three runtimes and assigns three adapters', () => {
    const plan = run('Add a health endpoint to every component', polyglot);
    const adapters = new Set(plan.validations.map((validation) => validation.adapterId));
    assert.deepEqual([...adapters].sort(), ['node', 'python', 'rust']);
  });

  it('runs no npm command inside the Rust or Python components', () => {
    // §59 states this directly. It is the failure a single repository-wide decision causes.
    for (const validation of run('Add a health endpoint', polyglot).validations) {
      if (validation.adapterId === 'node') continue;
      assert.ok(
        !/^(npm|pnpm|yarn|bun|npx)$/.test(validation.command.command),
        `${validation.componentRoot} (${validation.adapterId}) must not run ${validation.command.command}`,
      );
    }
  });

  it('issues the correct test command per component', () => {
    const plan = run('Add tests', polyglot);
    const testFor = (root: string) => {
      const validation = plan.validations.find((entry) => entry.componentRoot === root && entry.phase === 'test');
      return validation ? `${validation.command.command} ${validation.command.args.join(' ')}` : null;
    };
    assert.equal(testFor('frontend'), 'npm run test');
    assert.equal(testFor('service'), 'poetry run pytest -q');
    assert.equal(testFor('worker'), 'cargo test --all-targets');
  });
});

describe('§60 — a deep monorepo path is discovered without being hardcoded', () => {
  const monorepo = [
    f('package.json', JSON.stringify({ name: 'root', workspaces: ['packages/*'] })),
    f('pnpm-workspace.yaml', 'packages:\n  - packages/*\n'),
    f('packages/ui/package.json', JSON.stringify({ name: 'ui', scripts: { test: 'vitest run' } })),
    f('packages/ui/src/index.ts', ''),
    // Deliberately deep and in a directory no code names.
    f('packages/services/billing/internal/reconcile/package.json', JSON.stringify({ name: 'reconcile', scripts: { test: 'vitest run' } })),
    f('packages/services/billing/internal/reconcile/src/index.ts', ''),
  ];

  it('finds a package nested far below any known path', () => {
    const plan = run('Fix the reconciliation rounding bug', monorepo);
    const roots = plan.architecture.components.map((component) => component.root);
    assert.ok(
      roots.includes('packages/services/billing/internal/reconcile'),
      'the deep package must be discovered rather than require a hardcoded path',
    );
  });

  it('detects the workspace tooling', () => {
    const plan = run('Fix a bug', monorepo);
    assert.ok(plan.validations.some((validation) => validation.componentRoot.startsWith('packages/')));
  });
});

describe('§61 — an existing repository is extended, not replaced', () => {
  const existing = [
    f('manage.py', 'import django'),
    f('requirements.txt', 'django==5.0\npytest==8.0\n'),
    f('billing/models.py', 'class Invoice: pass'),
    f('billing/views.py', 'def list_invoices(request): pass'),
    f('tests/test_billing.py', 'def test_existing(): assert True'),
  ];

  it('keeps the existing stack and does not migrate it', () => {
    const plan = run('Add an endpoint that exports invoices as CSV', existing);
    assert.equal(plan.architecture.inheritedFromRepository, true);
    assert.deepEqual([...new Set(plan.architecture.components.map((c) => c.language))], ['python']);
  });

  it('records the decision as inherited rather than chosen', () => {
    const decision = run('Add an endpoint', existing).architecture.decisions[0];
    assert.equal(decision.inheritedFromRepository, true);
    assert.ok(decision.repositoryEvidence.length > 0);
  });

  it('plans the repository\'s own test command so existing tests keep running', () => {
    const plan = run('Add an endpoint', existing);
    const test = plan.validations.find((validation) => validation.phase === 'test');
    assert.ok(test, 'the existing suite must be run');
    assert.match(`${test.command.command} ${test.command.args.join(' ')}`, /pytest|unittest/);
  });
});

describe('§62 — an unknown runtime is discovered rather than rejected', () => {
  const nim = [
    f('src/converter.nim', 'echo "x"'),
    f('converter.nimble', 'version = "0.1.0"'),
    f('.github/workflows/ci.yml', 'steps:\n  - run: nimble install -y\n  - run: nimble test\n'),
  ];

  it('engages discovery and derives commands from repository evidence', () => {
    const plan = run('Fix the delimiter bug in the converter', nim);
    assert.ok(plan.discovery, 'discovery must engage for an unrecognised toolchain');
    assert.equal(`${plan.discovery.test?.command} ${plan.discovery.test?.args.join(' ')}`, 'nimble test');
  });

  it('reports the limitation honestly rather than claiming a build', () => {
    const plan = run('Fix a bug', nim);
    assert.notEqual(plan.status, 'ready');
    assert.equal(plan.discovery?.validated, false, 'derived commands are not yet proven');
  });
});

describe('§63 — the Python FastAPI vertical slice', () => {
  const prompt =
    'Build a Python FastAPI task-management API with SQLite, CRUD endpoints, input validation, tests, a Dockerfile and a README';

  it('1-6. understands the request and selects Python and FastAPI from requirements', () => {
    const plan = run(prompt);
    assert.ok(plan.spec.surfaces.some((s) => s.surface === 'api'));
    assert.deepEqual([...new Set(plan.architecture.components.map((c) => c.language))], ['python']);

    const framework = plan.architecture.decisions.find((decision) => decision.category === 'framework');
    assert.equal(framework?.selection, 'fastapi');
    assert.match(framework!.reason, /names fastapi explicitly/i);

    const database = plan.architecture.decisions.find((decision) => decision.category === 'database');
    assert.equal(database?.selection, 'sqlite');
  });

  it('2. produces product-specific acceptance criteria, never "app works"', () => {
    const criteria = compileAcceptanceCriteria({ spec: synthesizeUniversalProductSpec({ prompt }) });
    assert.ok(criteria.length >= 4);
    assert.deepEqual(unfalsifiableCriteria(criteria), [], 'no criterion may be unfalsifiable');
    assert.ok(criteria.some((criterion) => /schema/.test(criterion.statement)));
    assert.ok(criteria.some((criterion) => /rejected before it reaches storage/.test(criterion.statement)));
    assert.ok(
      criteria.every((criterion) => criterion.observable.trim().length > 0),
      'every criterion must name what to observe',
    );
  });

  it('9-11. binds the Python adapter and plans real commands once files exist', () => {
    // The generated tree, as the slice would produce it.
    const generated = [
      f('pyproject.toml', '[project]\nname = "tasks"\n[build-system]\nrequires = ["hatchling"]\n[tool.pytest.ini_options]\n'),
      f('app/main.py', 'from fastapi import FastAPI'),
      f('tests/test_tasks.py', 'def test_create(): assert True'),
      f('Dockerfile', 'FROM python:3.12'),
    ];
    const plan = run(prompt, generated);

    const phases = plan.validations.map((validation) => validation.phase);
    assert.ok(phases.includes('install'), 'dependencies must be installed');
    assert.ok(phases.includes('test'), 'tests must run');

    const test = plan.validations.find((validation) => validation.phase === 'test')!;
    assert.match(`${test.command.command} ${test.command.args.join(' ')}`, /pytest/);
    assert.equal(test.adapterId, 'python');

    const install = plan.validations.find((validation) => validation.phase === 'install')!;
    assert.equal(install.command.networkPolicy, 'registry-only', 'only install may reach a registry');
    assert.ok(
      plan.validations.filter((v) => v.phase !== 'install').every((v) => v.command.networkPolicy === 'none'),
      'every other phase runs with egress denied',
    );
  });

  it('17. reports the outcome from evidence and refuses to claim more', async () => {
    const generated = [
      f('pyproject.toml', '[project]\nname = "tasks"\n[build-system]\nrequires=["hatchling"]\n[tool.pytest.ini_options]\n'),
      f('tests/test_tasks.py', 'def test_create(): assert True'),
    ];
    const plan = run(prompt, generated);

    const passing = await runValidationPlan(plan, ok);
    assert.equal(passing.passed, true);
    assert.equal(passing.tierReached, 'sandbox');
    assert.equal(mayClaimVerified(plan, passing).verified, true);
  });

  it('10-13. does not fake the sandbox when the toolchain is absent', async () => {
    // §63 is explicit: if the isolated worker cannot run these steps, record the blocker.
    // Whether the sandbox image carries Python, Cargo or a Nim compiler is not knowable
    // from here, and this is the behaviour when it does not.
    const generated = [
      f('pyproject.toml', '[project]\nname = "tasks"\n[tool.pytest.ini_options]\n'),
      f('tests/test_tasks.py', 'def test_create(): assert True'),
    ];
    const plan = run(prompt, generated);

    const report = await runValidationPlan(plan, async () => ({
      exitCode: 127, stdout: '', stderr: 'pip: command not found',
    }));

    assert.equal(report.passed, false);
    assert.match(report.blocker!, /not available in the sandbox image/);
    assert.match(report.blocker!, /Nothing after this point was executed/);
    assert.match(report.blocker!, /No source change can fix this/);
    assert.equal(mayClaimVerified(plan, report).verified, false);
  });
});

describe('a run may not overstate what it verified', () => {
  it('refuses to claim verification when no test ran', async () => {
    // §18: a command succeeding over zero tests is a failure, not a pass. A repository
    // with no test script produces no test command, and a green install proves only that
    // the toolchain executed.
    const plan = run('Fix a typo', [f('package.json', JSON.stringify({ name: 'a', scripts: { build: 'tsc' } }))]);
    const report = await runValidationPlan(plan, ok);
    assert.equal(report.passed, true, 'the commands that existed did pass');
    const claim = mayClaimVerified(plan, report);
    assert.equal(claim.verified, false);
    assert.match(claim.reason, /no test command ran/);
  });

  it('reports tier none when nothing was executed', async () => {
    const plan = run('make it better');
    const report = await runValidationPlan(plan, async () => {
      throw new Error('must not run anything');
    });
    assert.equal(report.tierReached, 'none');
    assert.match(report.blocker!, /nothing was executed/i);
  });

  it('refuses verification while any blocker remains', async () => {
    const plan = run('Build a Go API for managing tasks');
    assert.ok(plan.blockers.length > 0, 'Go has no adapter yet');
    const claim = mayClaimVerified(plan, await runValidationPlan(plan, ok));
    assert.equal(claim.verified, false);
    assert.match(claim.reason, /blockers remain/);
  });

  it('lets an optional command fail without failing the run', async () => {
    const plan = run('Fix a bug', [
      f('Cargo.toml', '[package]\nname = "a"\n'),
      f('src/main.rs', 'fn main() {}'),
    ]);
    const report = await runValidationPlan(plan, async (command) =>
      command.optional ? { exitCode: 1, stdout: '', stderr: 'clippy not installed' } : { exitCode: 0, stdout: '', stderr: '' },
    );
    assert.equal(report.passed, true, 'a missing linter must not fail a build that compiles and tests');
  });

  it('stops at the first real failure instead of cascading', async () => {
    const plan = run('Fix a bug', [
      f('Cargo.toml', '[package]\nname = "a"\n'),
      f('src/main.rs', 'fn main() {}'),
    ]);
    const report = await runValidationPlan(plan, async (command) =>
      command.args.includes('check')
        ? { exitCode: 1, stdout: '', stderr: 'error[E0308]: mismatched types' }
        : { exitCode: 0, stdout: '', stderr: '' },
    );
    assert.equal(report.passed, false);
    assert.equal(report.failures.length, 1, 'later phases assume earlier ones succeeded');
  });
});

describe('the flow itself names no language', () => {
  it('contains no ecosystem-specific command', () => {
    // §9's structural requirement, applied to the orchestration layer. A flow with
    // `cargo build` in it behaves identically until someone adds Go and has to edit it.
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'universalFlow.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

    for (const pattern of [
      /\bnpm (?:run|install|ci|test)\b/, /\bcargo (?:build|test|check)\b/, /\bpytest\b/,
      /\bpoetry (?:run|install)\b/, /\bgo (?:build|test)\b/, /\bdotnet (?:build|test)\b/,
    ]) {
      assert.ok(!pattern.test(source), `universalFlow.ts contains ${pattern}; that belongs in an adapter`);
    }
  });

  it('records manual criteria separately so they are never counted as automated', () => {
    // A store listing or a mainnet deployment cannot be settled by a run. Counting them
    // would let a completeness claim include work nobody did.
    const criteria = compileAcceptanceCriteria({
      spec: synthesizeUniversalProductSpec({ prompt: 'Build a Flutter mobile app published to the app store' }),
    });
    const manual = criteria.filter((criterion) => criterion.kind === 'manual');
    assert.ok(manual.length > 0);
    assert.ok(manual.every((criterion) => criterion.manualReason));
    assert.ok(automatedCriteria(criteria).every((criterion) => criterion.kind !== 'manual'));
  });
});

describe('each ecosystem gets an image whose toolchain exists', () => {
  /**
   * Measured against the deployed sandbox, not inferred from the image name.
   *
   * A probe on the live runtime reported `HAVE node`, `HAVE npm`, and `MISS` for cargo,
   * rustc, python, python3, pip, poetry, uv, pytest, go, java, dotnet, php and ruby — the
   * default image is `node:20-alpine` and carries nothing else. Without a per-adapter
   * image the Python and Rust adapters emit perfectly correct commands that cannot run.
   *
   * Both replacements were verified on real machines: `rust:1-alpine` gave cargo 1.97.1
   * and `python:3.12-alpine` gave Python 3.12.13 with pip 25.0.1, each machine destroyed
   * afterwards.
   */
  it('asks for a Rust image for Cargo commands and a Python image for pytest', () => {
    const rust = run('Fix a bug', [
      f('Cargo.toml', '[package]\nname = "a"\n'),
      f('src/main.rs', 'fn main() {}'),
    ]);
    assert.ok(rust.validations.length > 0);
    assert.ok(
      rust.validations.every((validation) => /rust:/.test(validation.sandboxImage ?? '')),
      'every Cargo command must run in an image that has cargo',
    );

    const python = run('Fix a bug', [
      f('pyproject.toml', '[tool.poetry]\nname = "s"\n[tool.pytest.ini_options]\n'),
      f('poetry.lock', ''),
      f('tests/test_a.py', ''),
    ]);
    assert.ok(
      python.validations.every((validation) => /python:/.test(validation.sandboxImage ?? '')),
      'every Python command must run in an image that has python',
    );
  });

  it('leaves Node on the sandbox default, which already has node and npm', () => {
    const node = run('Fix a bug', [f('package.json', '{"name":"a","scripts":{"test":"vitest run"}}')]);
    assert.ok(node.validations.every((validation) => validation.sandboxImage === null));
  });

  it('gives each component of a polyglot repository its own image', () => {
    // A single run-wide image would make two of the three components fail on a missing
    // toolchain: the Rust worker cannot run in the Python image and neither in the Node one.
    const plan = run('Add a health check', [
      f('frontend/package.json', '{"name":"w","scripts":{"test":"vitest run"}}'),
      f('service/pyproject.toml', '[tool.poetry]\nname="s"\n[tool.pytest.ini_options]\n'),
      f('service/poetry.lock', ''),
      f('worker/Cargo.toml', '[package]\nname="w"\n'),
      f('worker/src/main.rs', ''),
    ]);
    const imageFor = (root: string) =>
      plan.validations.find((validation) => validation.componentRoot === root)?.sandboxImage;

    assert.equal(imageFor('frontend'), null);
    assert.match(imageFor('service') ?? '', /python:/);
    assert.match(imageFor('worker') ?? '', /rust:/);
  });
});
