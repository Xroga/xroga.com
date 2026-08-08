/**
 * Tests for the runtime adapter layer.
 *
 * These assert behaviour that would otherwise be a comment: that the repository outranks
 * the adapter, that three runtimes in one tree get three toolchains, and that no npm
 * command is ever issued inside a Rust or Python component. The last one is §59's
 * requirement and the reason the layer exists.
 *
 * One test reads the pipeline's own source rather than calling a function. That is
 * deliberate — see `no language-specific commands survive in the central pipeline`.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import type { ProjectFile } from '../../ai/patches.js';
import { preferCommand, tomlSection, tomlValue, type ToolCommand } from './adapterContract.js';
import { NodeRuntimeAdapter } from './nodeAdapter.js';
import { PythonRuntimeAdapter } from './pythonAdapter.js';
import { RustRuntimeAdapter } from './rustAdapter.js';
import {
  commandsFor,
  componentForPath,
  detectComposition,
  registerRuntimeAdapter,
  runtimeAdapters,
  setRuntimeAdaptersForTesting,
} from './registry.js';

const f = (path: string, content: string): ProjectFile => ({ path, content });
const argv = (command: ToolCommand) => [command.command, ...command.args].join(' ');

describe('the repository outranks the adapter', () => {
  // The behaviour worth protecting: a project whose `npm test` runs vitest with coverage
  // and a custom reporter must get exactly that, not a bare `vitest` the adapter guessed.
  // The difference is usually deliberate, and overriding it silently changes what "tests
  // passed" means.
  it('uses the declared test script rather than inferring one from dependencies', () => {
    const files = [
      f('package.json', JSON.stringify({
        name: 'app',
        scripts: { test: 'vitest run --coverage --reporter=json' },
        devDependencies: { vitest: '^2.0.0' },
      })),
      f('package-lock.json', '{}'),
    ];
    const adapter = new NodeRuntimeAdapter();
    const inspection = adapter.detect(files)!;
    const [command] = adapter.unitTestCommands(inspection);

    assert.equal(command.source, 'repository_script');
    assert.equal(argv(command), 'npm run test');
  });

  it('ranks a repository script above an adapter default', () => {
    const chosen = preferCommand([
      { command: 'npx', args: ['tsc'], networkPolicy: 'none', source: 'adapter_default', purpose: '' },
      { command: 'npm', args: ['run', 'typecheck'], networkPolicy: 'none', source: 'repository_script', purpose: '' },
    ]);
    assert.equal(argv(chosen!), 'npm run typecheck');
  });

  // No test script is a fact, not a gap to paper over. Inventing `npx vitest` here would
  // collect zero tests and exit 0 — a passing run that verified nothing, which §18
  // classifies as a failure.
  it('emits no test command at all when the repository declares none', () => {
    const files = [f('package.json', JSON.stringify({ name: 'app' }))];
    const adapter = new NodeRuntimeAdapter();
    const commands = adapter.unitTestCommands(adapter.detect(files)!);
    assert.deepEqual(commands, []);
  });

  it('trusts the committed lockfile over a contradicting packageManager field', () => {
    const files = [
      f('package.json', JSON.stringify({ name: 'app', packageManager: 'pnpm@9.0.0' })),
      f('package-lock.json', '{}'),
    ];
    const inspection = new NodeRuntimeAdapter().detect(files)!;
    assert.equal(inspection.packageManager, 'npm');
    assert.ok(
      inspection.evidence.some((line) => /lockfile decides/.test(line)),
      'the contradiction should be recorded, not silently resolved',
    );
  });

  it('uses npm ci when a lockfile exists and install when it does not', () => {
    const adapter = new NodeRuntimeAdapter();
    const withLock = adapter.detect([
      f('package.json', '{"name":"a"}'),
      f('package-lock.json', '{}'),
    ])!;
    const without = adapter.detect([f('package.json', '{"name":"a"}')])!;

    assert.ok(argv(adapter.installCommands(withLock)[0]).startsWith('npm ci'));
    assert.ok(argv(adapter.installCommands(without)[0]).startsWith('npm install'));
  });

  it('never installs without --ignore-scripts', () => {
    // A generated package.json can name any dependency, and an install script is
    // arbitrary code running before any review has happened.
    const adapter = new NodeRuntimeAdapter();
    for (const lock of ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock']) {
      const inspection = adapter.detect([f('package.json', '{"name":"a"}'), f(lock, '')])!;
      const [install] = adapter.installCommands(inspection);
      assert.ok(
        install.args.includes('--ignore-scripts'),
        `${install.command} install must not run lifecycle scripts`,
      );
    }
  });
});

describe('Python workflow detection', () => {
  // pip against a Poetry project installs nothing useful: the dependencies are in
  // pyproject.toml and there is no requirements file to read.
  it('picks Poetry over pip when poetry.lock is committed', () => {
    const files = [
      f('pyproject.toml', '[tool.poetry]\nname = "svc"\n'),
      f('poetry.lock', ''),
    ];
    const adapter = new PythonRuntimeAdapter();
    const inspection = adapter.detect(files)!;
    assert.equal(inspection.packageManager, 'poetry');
    assert.equal(argv(adapter.installCommands(inspection)[0]), 'poetry install --no-interaction --no-ansi');
  });

  it('prefers uv when uv.lock is present alongside a poetry section', () => {
    const files = [
      f('pyproject.toml', '[tool.poetry]\nname = "svc"\n'),
      f('uv.lock', ''),
      f('poetry.lock', ''),
    ];
    assert.equal(new PythonRuntimeAdapter().detect(files)!.packageManager, 'uv');
  });

  it('runs tests inside the workflow environment rather than bare', () => {
    // `pytest` on PATH is not the project's pytest. Poetry and uv each create their own
    // environment, and running outside it tests whatever the sandbox image happens to hold.
    const files = [
      f('pyproject.toml', '[tool.poetry]\nname = "svc"\n[tool.pytest.ini_options]\n'),
      f('poetry.lock', ''),
      f('tests/test_api.py', 'def test_ok(): assert True'),
    ];
    const adapter = new PythonRuntimeAdapter();
    const [command] = adapter.unitTestCommands(adapter.detect(files)!);
    assert.equal(argv(command), 'poetry run pytest -q');
  });

  it('uses unittest discovery when a tests directory has no pytest naming', () => {
    const files = [
      f('requirements.txt', 'flask\n'),
      f('tests/api_checks.py', 'import unittest'),
    ];
    const adapter = new PythonRuntimeAdapter();
    const [command] = adapter.unitTestCommands(adapter.detect(files)!);
    assert.match(argv(command), /unittest discover/);
  });

  // An application has nothing to build. Emitting `python -m build` for a FastAPI service
  // fails a repository that is entirely correct.
  it('builds only when a build backend is declared', () => {
    const adapter = new PythonRuntimeAdapter();
    const application = adapter.detect([f('requirements.txt', 'fastapi\n'), f('main.py', '')])!;
    const library = adapter.detect([
      f('pyproject.toml', '[build-system]\nrequires = ["hatchling"]\n[project]\nname = "lib"\n'),
    ])!;

    assert.deepEqual(adapter.buildCommands(application), []);
    assert.match(argv(adapter.buildCommands(library)[0]), /python -m build/);
    assert.deepEqual(adapter.artifactLocations(library), ['dist/*.whl']);
  });

  it('emits no install command when there is no manifest to install from', () => {
    const adapter = new PythonRuntimeAdapter();
    const inspection = adapter.detect([f('script.py', 'print(1)')])!;
    assert.deepEqual(adapter.installCommands(inspection), []);
    assert.ok(inspection.confidence < 1, 'loose sources are weaker evidence than a manifest');
  });
});

describe('Rust and Cargo', () => {
  it('separates the networked fetch from every later step', () => {
    // Only `cargo fetch` needs a registry. Leaving the network on for build and test
    // would hand egress to code that has no reason to reach anything.
    const adapter = new RustRuntimeAdapter();
    const inspection = adapter.detect([
      f('Cargo.toml', '[package]\nname = "csvjson"\nversion = "0.1.0"\n'),
      f('Cargo.lock', ''),
      f('src/main.rs', 'fn main() {}'),
    ])!;

    assert.equal(adapter.installCommands(inspection)[0].networkPolicy, 'registry-only');
    for (const phase of [adapter.buildCommands(inspection), adapter.unitTestCommands(inspection), adapter.typecheckCommands(inspection)]) {
      assert.equal(phase[0].networkPolicy, 'none');
    }
  });

  it('uses --locked when Cargo.lock is committed', () => {
    const adapter = new RustRuntimeAdapter();
    const locked = adapter.detect([
      f('Cargo.toml', '[package]\nname = "a"\n'),
      f('Cargo.lock', ''),
      f('src/main.rs', ''),
    ])!;
    assert.match(argv(adapter.buildCommands(locked)[0]), /--locked/);
  });

  // A virtual manifest declares members and builds nothing itself. Asserting
  // target/release/<name> for it would fail a build that succeeded, because there is no
  // package.name to resolve.
  it('claims no root artefact for a virtual workspace manifest', () => {
    const adapter = new RustRuntimeAdapter();
    const inspection = adapter.detect([
      f('Cargo.toml', '[workspace]\nmembers = ["core", "cli"]\n'),
      f('core/Cargo.toml', '[package]\nname = "core"\n'),
      f('core/src/lib.rs', ''),
      f('cli/Cargo.toml', '[package]\nname = "cli"\n'),
      f('cli/src/main.rs', ''),
    ])!;

    assert.deepEqual(adapter.artifactLocations(inspection), []);
    assert.deepEqual(adapter.packageCommands(inspection), []);
    assert.deepEqual(inspection.workspaces, ['cli', 'core']);
    assert.ok(inspection.evidence.some((line) => /virtual manifest/.test(line)));
  });

  it('distinguishes a binary artefact from a library artefact', () => {
    const adapter = new RustRuntimeAdapter();
    const binary = adapter.detect([f('Cargo.toml', '[package]\nname = "b"\n'), f('src/main.rs', '')])!;
    const library = adapter.detect([f('Cargo.toml', '[package]\nname = "l"\n'), f('src/lib.rs', '')])!;

    assert.deepEqual(adapter.artifactLocations(binary), ['target/release/*']);
    assert.deepEqual(adapter.artifactLocations(library), ['target/release/lib*.rlib']);
  });
});

describe('a repository is a set of components, not one stack', () => {
  const polyglot = [
    f('frontend/package.json', JSON.stringify({ name: 'web', scripts: { build: 'vite build', test: 'vitest run' } })),
    f('frontend/package-lock.json', '{}'),
    f('frontend/tsconfig.json', '{}'),
    f('frontend/src/main.ts', ''),
    f('service/pyproject.toml', '[tool.poetry]\nname = "svc"\n[tool.pytest.ini_options]\n'),
    f('service/poetry.lock', ''),
    f('service/tests/test_api.py', ''),
    f('worker/Cargo.toml', '[package]\nname = "worker"\n'),
    f('worker/Cargo.lock', ''),
    f('worker/src/main.rs', ''),
  ];

  it('assigns a different adapter to each of three runtimes', () => {
    const composition = detectComposition(polyglot);
    const byRoot = Object.fromEntries(composition.components.map((c) => [c.root, c.adapterId]));

    assert.equal(byRoot.frontend, 'node');
    assert.equal(byRoot.service, 'python');
    assert.equal(byRoot.worker, 'rust');
    assert.equal(composition.polyglot, true);
  });

  // §59 states this directly, and it is the failure mode the layer was built to prevent:
  // one repository-wide decision means running npm inside worker/ because a package.json
  // was found first, which fails in a way that looks like a broken project.
  it('never issues an npm command inside the Rust or Python component', () => {
    const composition = detectComposition(polyglot);
    for (const component of composition.components) {
      if (component.adapterId === 'node') continue;
      for (const phase of ['install', 'lint', 'typecheck', 'test', 'build', 'package'] as const) {
        for (const command of commandsFor(component, phase)) {
          assert.ok(
            !/^(npm|pnpm|yarn|bun|npx)$/.test(command.command),
            `${component.root} (${component.adapterId}) must not run ${argv(command)}`,
          );
        }
      }
    }
  });

  it('runs the right test command for each component', () => {
    const composition = detectComposition(polyglot);
    const testFor = (root: string) => {
      const component = composition.components.find((c) => c.root === root)!;
      return argv(commandsFor(component, 'test')[0]);
    };

    assert.equal(testFor('frontend'), 'npm run test');
    assert.equal(testFor('service'), 'poetry run pytest -q');
    assert.equal(testFor('worker'), 'cargo test --all-targets');
  });

  it('attributes a changed file to the nearest component', () => {
    const composition = detectComposition(polyglot);
    assert.equal(componentForPath(composition, 'worker/src/lib.rs')?.adapterId, 'rust');
    assert.equal(componentForPath(composition, 'frontend/src/app.ts')?.adapterId, 'node');
    assert.equal(componentForPath(composition, 'service/app/main.py')?.adapterId, 'python');
  });

  it('does not report workspace members as separate components of the same adapter', () => {
    // Otherwise a Cargo workspace builds the same code once per member.
    const composition = detectComposition([
      f('Cargo.toml', '[workspace]\nmembers = ["core", "cli"]\n'),
      f('core/Cargo.toml', '[package]\nname = "core"\n'),
      f('core/src/lib.rs', ''),
      f('cli/Cargo.toml', '[package]\nname = "cli"\n'),
      f('cli/src/main.rs', ''),
    ]);
    assert.equal(composition.components.length, 1);
    assert.equal(composition.components[0].root, '');
  });

  it('keeps a nested component whose adapter differs from its parent', () => {
    // A Python service inside a Node monorepo keeps its own toolchain even though the
    // root package.json would otherwise cover the path.
    const composition = detectComposition([
      f('package.json', JSON.stringify({ name: 'root', workspaces: ['packages/*'] })),
      f('packages/ui/package.json', JSON.stringify({ name: 'ui' })),
      f('packages/ml/pyproject.toml', '[tool.poetry]\nname = "ml"\n'),
      f('packages/ml/poetry.lock', ''),
    ]);
    const ml = composition.components.find((c) => c.root === 'packages/ml');
    assert.equal(ml?.adapterId, 'python');
  });

  it('reports directories no adapter claimed instead of ignoring them', () => {
    // The input to generic discovery. Reporting them is the difference between "we do not
    // support this" and "nothing matched, so go and inspect it".
    const composition = detectComposition([
      f('package.json', '{"name":"a"}'),
      f('infra/main.tf', 'resource "aws_s3_bucket" "b" {}'),
    ]);
    assert.ok(composition.components.length >= 1);
    assert.deepEqual(composition.unclaimedRoots, []);

    const noRoot = detectComposition([f('infra/main.tf', ''), f('infra/vars.tf', '')]);
    assert.deepEqual(noRoot.components, []);
    assert.deepEqual(noRoot.unclaimedRoots, ['infra']);
  });
});

describe('the registry is additive', () => {
  it('accepts a new ecosystem without any change to the registry logic', () => {
    // §11's actual requirement: supporting Go means registering an adapter, not editing
    // the planner or the pipeline.
    const original = [...runtimeAdapters()];
    try {
      registerRuntimeAdapter({
        id: 'go',
        adapterVersion: '0.1.0',
        displayName: 'Go',
        languages: ['go'],
        runtimes: ['go'],
        platforms: ['linux'],
        capabilityState: 'planned',
        manifestNames: ['go.mod'],
        detect: (files, root = '') =>
          files.some((file) => file.path === (root ? `${root}/go.mod` : 'go.mod'))
            ? {
                adapterId: 'go', root, languages: ['go'], manifests: ['go.mod'], lockfiles: [],
                packageManager: 'go', buildSystem: 'go', testRunner: 'go-test', workspaces: [],
                entrypoints: [], confidence: 1, evidence: ['go.mod'],
              }
            : null,
        installCommands: () => [{ command: 'go', args: ['mod', 'download'], networkPolicy: 'registry-only', source: 'manifest', purpose: '' }],
        formatCommands: () => [], lintCommands: () => [], typecheckCommands: () => [],
        unitTestCommands: () => [{ command: 'go', args: ['test', './...'], networkPolicy: 'none', source: 'manifest', purpose: '' }],
        buildCommands: () => [{ command: 'go', args: ['build', './...'], networkPolicy: 'none', source: 'manifest', purpose: '' }],
        packageCommands: () => [], artifactLocations: () => [], environmentRequirements: () => ({}),
        parseFailure: () => [], repairHints: () => [],
      });

      const composition = detectComposition([f('go.mod', 'module example.com/svc\n'), f('main.go', '')]);
      assert.equal(composition.components[0].adapterId, 'go');
      assert.equal(argv(commandsFor(composition.components[0], 'test')[0]), 'go test ./...');
    } finally {
      setRuntimeAdaptersForTesting(original);
    }
  });
});

describe('the TOML reader stays inside its stated limits', () => {
  it('finds sections and quoted values', () => {
    const toml = '[package]\nname = "csvjson"\nversion = "0.1.0"\n\n[dependencies]\nserde = "1"\n';
    assert.equal(tomlSection(toml, 'package'), true);
    assert.equal(tomlSection(toml, 'workspace'), false);
    assert.equal(tomlValue(toml, 'package', 'name'), 'csvjson');
  });

  it('does not read a key out of the wrong section', () => {
    // The bug this prevents: `[workspace]` following `[package]` and the reader walking
    // past the boundary to return the previous section's name.
    const toml = '[package]\nname = "real"\n\n[workspace]\nmembers = ["a"]\n';
    assert.equal(tomlValue(toml, 'workspace', 'name'), null);
    assert.equal(tomlValue(toml, 'package', 'name'), 'real');
  });

  it('returns null rather than guessing on shapes it does not handle', () => {
    assert.equal(tomlValue('[a]\nkey = [1, 2]\n', 'a', 'key'), null);
    assert.equal(tomlValue(undefined, 'a', 'b'), null);
  });
});

describe('the central pipeline delegates instead of knowing', () => {
  /**
   * Reads source rather than calling a function, which is unusual enough to justify.
   *
   * The requirement in §9 is a property of where code lives: "the central engineering
   * pipeline must NOT contain language-specific build commands that belong in adapters".
   * No runtime assertion can observe that — a pipeline with `cargo build` hardcoded
   * behaves identically to one that asks an adapter, right up until someone adds Go and
   * has to edit the pipeline to do it.
   *
   * Scoped to the universal path. `pipeline.ts` still holds npm invocations for the legacy
   * flow and §71 requires it keep working during rollout, so asserting over it would
   * demand a rewrite this command explicitly forbids.
   */
  it('no language-specific commands survive in the universal modules', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const universal = [
      join(here, 'registry.ts'),
      join(here, 'adapterContract.ts'),
    ];

    const forbidden = [
      /\bnpm (?:run|install|ci|test)\b/,
      /\bcargo (?:build|test|check)\b/,
      /\bpytest\b/,
      /\bpoetry (?:run|install)\b/,
      /\bgo (?:build|test)\b/,
      /\bgradlew?\b/,
      /\bdotnet (?:build|test)\b/,
    ];

    for (const file of universal) {
      // Comments explain *why* a rule exists and legitimately name commands; code is what
      // must stay neutral. Strip comments, then assert on what remains.
      const source = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');

      for (const pattern of forbidden) {
        assert.ok(
          !pattern.test(source),
          `${file} contains ${pattern} — that command belongs in an adapter, not in the shared layer`,
        );
      }
    }
  });

  it('every adapter answers every phase without the caller naming a language', () => {
    const composition = detectComposition([
      f('package.json', '{"name":"a","scripts":{"build":"tsc"}}'),
    ]);
    const component = composition.components[0];
    for (const phase of ['install', 'format', 'lint', 'typecheck', 'test', 'build', 'package'] as const) {
      // The contract is that this never throws and always returns an array; an empty one
      // means "nothing to run", which is a legitimate answer rather than an error.
      assert.ok(Array.isArray(commandsFor(component, phase)));
    }
  });
});

describe('diagnostics are parsed by the adapter that produced them', () => {
  it('reads a tsc error into a structured type_error', () => {
    const [diagnostic] = new NodeRuntimeAdapter().parseFailure(
      "src/app.ts(12,5): error TS2304: Cannot find name 'foo'.",
    );
    assert.equal(diagnostic.kind, 'type_error');
    assert.equal(diagnostic.file, 'src/app.ts');
    assert.equal(diagnostic.line, 12);
    assert.equal(diagnostic.repairable, true);
  });

  it('reads a Cargo error with its E-code and location', () => {
    const [diagnostic] = new RustRuntimeAdapter().parseFailure(
      'error[E0308]: mismatched types\n  --> src/main.rs:4:17\n',
    );
    assert.equal(diagnostic.kind, 'compile_error');
    assert.equal(diagnostic.file, 'src/main.rs');
    assert.equal(diagnostic.message, 'E0308: mismatched types');
  });

  it('separates a missing module from a code defect', () => {
    // The repair differs: add a dependency, not edit the source. Routing both to the same
    // handler produces a model that invents a stub for a package that simply is not
    // declared.
    const python = new PythonRuntimeAdapter().parseFailure(
      "ModuleNotFoundError: No module named 'fastapi'",
    );
    assert.equal(python[0].kind, 'dependency_error');
    assert.match(new PythonRuntimeAdapter().repairHints(python)[0], /manifest/);
  });

  it('marks a missing toolchain as not repairable by editing code', () => {
    for (const adapter of [new NodeRuntimeAdapter(), new RustRuntimeAdapter(), new PythonRuntimeAdapter()]) {
      const diagnostics = adapter.parseFailure('bash: command not found');
      const toolchain = diagnostics.find((d) => d.kind === 'toolchain_missing');
      if (!toolchain) continue;
      assert.equal(
        toolchain.repairable,
        false,
        `${adapter.id} must not send an environment problem into the repair loop`,
      );
    }
  });
});

describe('a missing toolchain is recognised however the shell words it', () => {
  // Regression. The Rust parser matched only `command not found: cargo`, while every real
  // shell writes the subject first: `bash: cargo: command not found`. So a missing Cargo
  // produced no diagnostic at all, and the failure went into the repair loop — where a
  // model would be asked to patch source for a problem no source change can fix.
  it('detects cargo missing in the wording shells actually use', () => {
    const adapter = new RustRuntimeAdapter();
    for (const output of [
      'bash: cargo: command not found',
      '/bin/sh: cargo: not found\ncargo: command not found',
      "'cargo' is not recognized as an internal or external command",
    ]) {
      const diagnostics = adapter.parseFailure(output);
      assert.ok(
        diagnostics.some((diagnostic) => diagnostic.kind === 'toolchain_missing'),
        `should recognise a missing toolchain in: ${output}`,
      );
    }
  });

  it('does not mistake a compile error mentioning cargo for a missing toolchain', () => {
    const diagnostics = new RustRuntimeAdapter().parseFailure(
      'error[E0432]: unresolved import `cargo_metadata`\n  --> src/main.rs:1:5\n',
    );
    assert.ok(!diagnostics.some((diagnostic) => diagnostic.kind === 'toolchain_missing'));
  });
});
