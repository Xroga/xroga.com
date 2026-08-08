/**
 * M20 and M21: the follow-up modification proof, and the universality regression.
 *
 * The follow-up tests are the ones that decide whether Xroga is an engineering agent or a
 * generator. A generator treats "add task due dates" as a new project and rebuilds
 * everything; an agent loads what it decided last time and changes what the request
 * actually affects.
 *
 * The regression tests re-run the §58 scenarios plus the ecosystems added in this
 * continuation. Two meta-tests matter more than the list: a surface string nobody
 * anticipated must pass through planning, and an adapter registered at runtime must become
 * usable without editing the pipeline. Those are the properties; the scenarios are
 * examples of them.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ProjectFile } from '../ai/patches.js';
import { readUniversalAgentFlags } from '../config/universalAgentFlags.js';
import { planUniversalRun } from './universalFlow.js';
import { synthesizeUniversalProductSpec, withCustomSurface } from './universalProductSpec.js';
import { planArchitecture } from './architecturePlan.js';
import { InMemoryUniversalStore, type Owner } from './universalPersistence.js';
import { executeUniversalRun, type ExecutionAdapters } from './universalExecution.js';
import {
  detectComposition, registerRuntimeAdapter, runtimeAdapters, setRuntimeAdaptersForTesting,
} from './runtime/registry.js';
import { registerAdditionalRuntimeAdapters } from './runtime/additionalAdapters.js';
import { deriveRuntimeCapability } from './runtime/runtimeDiscovery.js';

const f = (path: string, content = ''): ProjectFile => ({ path, content });
const owner: Owner = { userId: 'user-1', projectId: 'demo-project' };
const enabled = readUniversalAgentFlags({
  UNIVERSAL_AGENT_ENABLED: 'enabled', UNIVERSAL_AGENT_ALLOWLIST: 'demo-project',
});

const surfacesOf = (prompt: string, files: ProjectFile[] = []) =>
  planUniversalRun({ prompt, files }).spec.surfaces.map((declaration) => String(declaration.surface));
const languagesOf = (prompt: string, files: ProjectFile[] = []) =>
  [...new Set(planUniversalRun({ prompt, files }).architecture.components.map((component) => component.language))];

function withAllAdapters(body: () => void): void {
  const original = [...runtimeAdapters()];
  try {
    registerAdditionalRuntimeAdapters();
    body();
  } finally {
    setRuntimeAdaptersForTesting(original);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// M20 — follow-up modification
// ─────────────────────────────────────────────────────────────────────────────

/** The tree a first universal run produced: a FastAPI task API. */
const shippedProject: ProjectFile[] = [
  f('requirements.txt', 'fastapi==0.115.6\npytest==8.3.4\n'),
  f('app/__init__.py', ''),
  f('app/main.py', 'from fastapi import FastAPI\napp = FastAPI()\n\n@app.get("/tasks")\ndef list_tasks():\n    return []\n'),
  f('tests/test_tasks.py', 'def test_list():\n    assert True\n'),
];

describe('M20 — a follow-up loads what was decided before', () => {
  const adapters = (captured: { files?: readonly ProjectFile[] }): ExecutionAdapters => ({
    implement: async (input) => {
      captured.files = input.existingFiles;
      return [...shippedProject, f('app/filters.py', 'def by_due_date(tasks, before):\n    return tasks\n')];
    },
    runValidation: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    review: async () => ({ approved: true, findings: [] }),
    commit: async () => ({ commitSha: 'followup123' }),
  });

  it('reloads the persisted spec rather than treating the request as new', async () => {
    // The distinction between an engineering agent and a generator.
    const store = new InMemoryUniversalStore();
    const first = synthesizeUniversalProductSpec({
      prompt: 'Build a Python FastAPI task-management API with SQLite',
    });
    await store.saveSpec(owner, first);
    await store.savePlan(owner, planArchitecture({ spec: first }));

    const loaded = await store.loadLatestSpec(owner);
    assert.ok(loaded, 'the earlier spec must still be there');
    assert.ok(loaded!.surfaces.some((declaration) => declaration.surface === 'api'));
    assert.equal((await store.loadLatestPlan(owner))?.decisions.length! > 0, true);
  });

  it('inherits the existing stack for the follow-up instead of re-choosing', async () => {
    // "Add task due dates and filtering" mentions no language. Re-deriving from the prompt
    // alone would produce a default; the repository is what settles it.
    const plan = planUniversalRun({
      prompt: 'Add task due dates and filtering', files: shippedProject, projectId: owner.projectId,
    });
    assert.equal(plan.architecture.inheritedFromRepository, true);
    assert.deepEqual([...new Set(plan.architecture.components.map((c) => c.language))], ['python']);
  });

  it('passes the current repository into implementation so unrelated code survives', async () => {
    const captured: { files?: readonly ProjectFile[] } = {};
    const result = await executeUniversalRun({
      prompt: 'Add task due dates and filtering',
      owner, runId: 'run-2', flags: enabled,
      existingFiles: shippedProject,
      adapters: adapters(captured),
      store: new InMemoryUniversalStore(),
    });

    assert.equal(result.outcome, 'completed');
    assert.ok(captured.files, 'implementation must receive the existing tree');
    assert.ok(
      captured.files!.some((file) => file.path === 'app/main.py'),
      'the follow-up must see the code that already exists rather than starting empty',
    );
  });

  it('preserves unrelated files through the modification', async () => {
    const result = await executeUniversalRun({
      prompt: 'Add task due dates and filtering',
      owner, runId: 'run-2', flags: enabled,
      existingFiles: shippedProject, adapters: adapters({}),
    });

    const paths = result.files.map((file) => file.path);
    for (const original of shippedProject.map((file) => file.path)) {
      assert.ok(paths.includes(original), `${original} must survive the follow-up`);
    }
    assert.ok(paths.includes('app/filters.py'), 'and the new work must be present');
  });

  it('plans the existing test suite so a regression would be caught', async () => {
    const plan = planUniversalRun({ prompt: 'Add task due dates', files: shippedProject });
    const test = plan.validations.find((validation) => validation.phase === 'test');
    assert.ok(test, 'the follow-up must run the tests that already exist');
    assert.match(`${test!.command.command} ${test!.command.args.join(' ')}`, /pytest|unittest/);
  });

  it('persists an updated spec so the next follow-up sees this one', async () => {
    const store = new InMemoryUniversalStore();
    await executeUniversalRun({
      prompt: 'Add task due dates and filtering',
      owner, runId: 'run-2', flags: enabled,
      existingFiles: shippedProject, adapters: adapters({}), store,
    });
    const spec = await store.loadLatestSpec(owner);
    assert.ok(spec);
    assert.match(spec!.sourcePrompt, /due dates/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// M21 — universality regression
// ─────────────────────────────────────────────────────────────────────────────

describe('M21 — the black-box scenarios still hold', () => {
  it('Rust CLI', () => {
    assert.deepEqual(languagesOf('Build a Rust CLI that converts CSV files to JSON'), ['rust']);
    assert.ok(surfacesOf('Build a Rust CLI that converts CSV files to JSON').includes('cli'));
  });

  it('Python FastAPI', () => {
    const plan = planUniversalRun({ prompt: 'Build a Python FastAPI task API with SQLite and tests' });
    assert.deepEqual([...new Set(plan.architecture.components.map((c) => c.language))], ['python']);
    assert.equal(plan.architecture.decisions.find((d) => d.category === 'framework')?.selection, 'fastapi');
  });

  it('TypeScript browser extension', () => {
    assert.ok(surfacesOf('Build a TypeScript browser extension that summarizes the page').includes('browser_extension'));
  });

  it('Go service with a worker', () => {
    const found = surfacesOf('Build a Go HTTP service with PostgreSQL and a background cleanup worker');
    assert.ok(found.includes('api') && found.includes('worker'));
    assert.deepEqual(languagesOf('Build a Go HTTP service with a background cleanup worker'), ['go']);
  });

  it('Flutter mobile', () => {
    assert.deepEqual(languagesOf('Build a Flutter mobile expense tracker with offline persistence'), ['dart']);
  });

  it('WordPress / PHP plugin architecture', () => {
    withAllAdapters(() => {
      const composition = detectComposition([
        f('plugin.php', '<?php\n/**\n * Plugin Name: Appointments\n */\n'),
        f('composer.json', '{}'),
      ]);
      assert.equal(composition.components[0].adapterId, 'php');
      assert.ok(composition.components[0].inspection.evidence.some((line) => /WordPress plugin header/.test(line)));
    });
  });

  it('Java / JVM service', () => {
    withAllAdapters(() => {
      const composition = detectComposition([f('pom.xml', '<project/>'), f('src/Main.java', '')]);
      assert.equal(composition.components[0].adapterId, 'jvm');
      assert.equal(composition.components[0].inspection.buildSystem, 'maven');
    });
  });

  it('.NET API', () => {
    withAllAdapters(() => {
      const composition = detectComposition([f('api.csproj', '<Project/>'), f('Program.cs', '')]);
      assert.equal(composition.components[0].adapterId, 'dotnet');
    });
  });

  it('Terraform module', () => {
    const found = surfacesOf('Build a Terraform infrastructure module for an S3 bucket');
    assert.ok(found.includes('infrastructure_module'));
    assert.ok(!found.includes('web_frontend'));
  });

  it('Solidity with multiple outputs', () => {
    const found = surfacesOf('Build a Solidity smart contract with a web client and an indexer');
    assert.ok(found.includes('smart_contract'));
    assert.ok(found.includes('web_frontend'));
  });

  it('polyglot repository', () => {
    const composition = detectComposition([
      f('frontend/package.json', '{"name":"w"}'),
      f('service/pyproject.toml', '[tool.poetry]\nname="s"\n'),
      f('worker/Cargo.toml', '[package]\nname="w"\n'),
    ]);
    assert.deepEqual([...new Set(composition.components.map((c) => c.adapterId))].sort(), ['node', 'python', 'rust']);
  });

  it('deep monorepo', () => {
    const composition = detectComposition([
      f('package.json', JSON.stringify({ name: 'root', workspaces: ['packages/*'] })),
      f('packages/services/billing/internal/reconcile/package.json', '{"name":"reconcile"}'),
      f('packages/services/billing/internal/reconcile/src/index.ts', ''),
    ]);
    assert.ok(composition.components.some((c) => c.root === 'packages/services/billing/internal/reconcile'));
  });

  it('existing unfamiliar repository', () => {
    const plan = planUniversalRun({
      prompt: 'Add an export endpoint',
      files: [f('manage.py', 'import django'), f('requirements.txt', 'django==5.0\n')],
    });
    assert.equal(plan.architecture.inheritedFromRepository, true);
  });

  it('Node to Go transformation keeps the request honest', () => {
    // A migration must be an explicit transformation, not something a prompt word triggers
    // against an existing repository.
    const plan = planUniversalRun({
      prompt: 'Convert this Node service to Go while preserving its API behaviour',
      files: [f('package.json', '{"name":"svc","scripts":{"test":"node --test"}}')],
    });
    assert.equal(plan.architecture.inheritedFromRepository, true, 'the repository is still Node until a migration actually runs');
  });

  it('unknown product category', () => {
    const plan = planUniversalRun({
      prompt: 'Build a service that reconciles ledger entries between two accounting systems nightly',
    });
    assert.notEqual(plan.status, 'refused_no_surface');
    assert.ok(plan.architecture.components.length > 0);
  });

  it('unknown runtime discovery', () => {
    const spec = deriveRuntimeCapability([
      f('src/main.nim', 'echo 1'),
      f('.github/workflows/ci.yml', 'steps:\n  - run: nimble test\n'),
    ]);
    assert.ok(spec);
    assert.equal(`${spec!.test?.command} ${spec!.test?.args.join(' ')}`, 'nimble test');
  });
});

describe('M21 meta-tests — the properties, not the examples', () => {
  it('a custom surface absent from the known list passes through planning', () => {
    // §M21 states this directly. The scenario list is a set of examples; this is the
    // property they are examples of.
    const spec = withCustomSurface(
      synthesizeUniversalProductSpec({ prompt: 'Build a flight-control telemetry bridge' }),
      'avionics_telemetry_bridge',
      'the product bridges two telemetry buses',
    );
    const declaration = spec.surfaces.find((entry) => entry.surface === 'avionics_telemetry_bridge');

    assert.ok(declaration, 'the custom surface survives spec construction');
    assert.equal(declaration!.custom, true);

    // And it reaches the planner without being rejected or coerced.
    const plan = planArchitecture({ spec });
    assert.ok(plan.components.length > 0 || plan.blockers.length > 0,
      'planning must produce a result rather than throwing on a surface it has never seen');
    assert.ok(
      !plan.components.some((component) => component.framework === 'next'),
      'and must not quietly turn it into a website',
    );
  });

  it('a runtime adapter registered at runtime becomes usable with no pipeline edit', () => {
    const original = [...runtimeAdapters()];
    try {
      registerRuntimeAdapter({
        id: 'ocaml', adapterVersion: '0.1.0', displayName: 'OCaml / Dune',
        languages: ['ocaml'], runtimes: ['ocaml'], platforms: ['linux'],
        capabilityState: 'detected', manifestNames: ['dune-project'],
        detect: (files, root = '') =>
          files.some((file) => file.path === (root ? `${root}/dune-project` : 'dune-project'))
            ? {
                adapterId: 'ocaml', root, languages: ['ocaml'], manifests: ['dune-project'],
                lockfiles: [], packageManager: 'opam', buildSystem: 'dune', testRunner: 'dune-test',
                workspaces: [], entrypoints: [], confidence: 1, evidence: ['dune-project'],
              }
            : null,
        installCommands: () => [],
        formatCommands: () => [], lintCommands: () => [], typecheckCommands: () => [],
        unitTestCommands: () => [{ command: 'dune', args: ['test'], networkPolicy: 'none', source: 'manifest', purpose: '' }],
        buildCommands: () => [{ command: 'dune', args: ['build'], networkPolicy: 'none', source: 'manifest', purpose: '' }],
        packageCommands: () => [], artifactLocations: () => [], environmentRequirements: () => ({}),
        parseFailure: () => [], repairHints: () => [],
      });

      const plan = planUniversalRun({
        prompt: 'Fix the parser bug',
        files: [f('dune-project', '(lang dune 3.0)'), f('bin/main.ml', 'let () = print_endline "hi"')],
      });

      const test = plan.validations.find((validation) => validation.phase === 'test');
      assert.ok(test, 'the new ecosystem must produce a test command');
      assert.equal(`${test!.command.command} ${test!.command.args.join(' ')}`, 'dune test');
      assert.equal(test!.adapterId, 'ocaml');
    } finally {
      setRuntimeAdaptersForTesting(original);
    }
  });

  it('no scenario produces a static-site fallback', () => {
    // The single regression this whole command exists to prevent.
    for (const prompt of [
      'Build a Rust CLI that converts CSV files to JSON',
      'Build a Terraform infrastructure module',
      'Build a Python package with no server',
      'Build a background worker that drains a queue',
      'Build a service that reconciles ledger entries nightly',
    ]) {
      const plan = planUniversalRun({ prompt });
      for (const component of plan.architecture.components) {
        assert.ok(
          !['next', 'react', 'vue', 'svelte'].includes(component.framework ?? ''),
          `${prompt} selected ${component.framework}`,
        );
      }
    }
  });
});
