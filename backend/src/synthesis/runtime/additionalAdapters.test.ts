/**
 * Tests for the seven additional ecosystems.
 *
 * The load-bearing assertion is not that Go emits `go test ./...` — it is that adding
 * seven ecosystems required no change to the planner, the flow, the registry or the
 * pipeline. That is checked directly, along with the property that the marker table has
 * not quietly become a whitelist.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ProjectFile } from '../../ai/patches.js';
import type { ToolCommand } from './adapterContract.js';
import {
  CppRuntimeAdapter, DartRuntimeAdapter, DotnetRuntimeAdapter, GoRuntimeAdapter,
  JvmRuntimeAdapter, PhpRuntimeAdapter, SolidityRuntimeAdapter,
  registerAdditionalRuntimeAdapters,
} from './additionalAdapters.js';
import {
  commandsFor, detectComposition, registerRuntimeAdapter, runtimeAdapters,
  sandboxImageFor, setRuntimeAdaptersForTesting,
} from './registry.js';
import { deriveRuntimeCapability } from './runtimeDiscovery.js';

const f = (path: string, content = ''): ProjectFile => ({ path, content });
const argv = (c: ToolCommand) => [c.command, ...c.args].join(' ');

/** Runs a body with all seven registered, then restores the built-in three. */
function withAdditional(body: () => void): void {
  const original = [...runtimeAdapters()];
  try {
    registerAdditionalRuntimeAdapters();
    body();
  } finally {
    setRuntimeAdaptersForTesting(original);
  }
}

describe('Go', () => {
  const files = [f('go.mod', 'module example.com/svc\n'), f('go.sum', ''), f('main.go', 'package main\n\nfunc main() {}\n')];

  it('detects the module and its binary', () => {
    const inspection = new GoRuntimeAdapter().detect(files)!;
    assert.equal(inspection.packageManager, 'go-modules');
    assert.deepEqual(inspection.entrypoints, ['package main']);
  });

  it('separates the networked download from every later step', () => {
    const adapter = new GoRuntimeAdapter();
    const inspection = adapter.detect(files)!;
    assert.equal(adapter.installCommands(inspection)[0].networkPolicy, 'registry-only');
    assert.equal(adapter.unitTestCommands(inspection)[0].networkPolicy, 'none');
    assert.equal(argv(adapter.unitTestCommands(inspection)[0]), 'go test ./...');
  });

  it('parses a compile error with its location', () => {
    const [diagnostic] = new GoRuntimeAdapter().parseFailure('./main.go:12:5: undefined: foo');
    assert.equal(diagnostic.kind, 'compile_error');
    assert.equal(diagnostic.file, 'main.go');
    assert.equal(diagnostic.line, 12);
  });

  it('detects a go.work multi-module workspace', () => {
    const inspection = new GoRuntimeAdapter().detect([
      f('go.work', 'go 1.22\n\nuse ./a\n'), f('a/go.mod', 'module a\n'), f('a/main.go', 'package main'),
    ])!;
    assert.deepEqual(inspection.workspaces, ['a']);
  });
});

describe('JVM', () => {
  it('prefers the committed wrapper over a system Gradle', () => {
    // The wrapper pins the version the project was tested with. Using system Gradle
    // silently changes the toolchain.
    const adapter = new JvmRuntimeAdapter();
    const withWrapper = adapter.detect([f('build.gradle.kts', ''), f('gradlew', ''), f('src/Main.kt', '')])!;
    const without = adapter.detect([f('build.gradle.kts', ''), f('src/Main.kt', '')])!;

    assert.match(argv(adapter.unitTestCommands(withWrapper)[0]), /^\.\/gradlew/);
    assert.match(argv(adapter.unitTestCommands(without)[0]), /^gradle/);
  });

  it('uses Maven when a pom is present', () => {
    const adapter = new JvmRuntimeAdapter();
    const inspection = adapter.detect([f('pom.xml', '<project/>'), f('src/Main.java', '')])!;
    assert.equal(inspection.buildSystem, 'maven');
    assert.equal(argv(adapter.unitTestCommands(inspection)[0]), 'mvn -B test');
  });

  it('detects Kotlin and Java from the sources present', () => {
    const inspection = new JvmRuntimeAdapter().detect([f('pom.xml', '<project/>'), f('src/A.kt', ''), f('src/B.java', '')])!;
    assert.ok(inspection.languages.includes('kotlin'));
    assert.ok(inspection.languages.includes('java'));
  });

  it('finds multi-module projects', () => {
    const inspection = new JvmRuntimeAdapter().detect([
      f('settings.gradle', "include 'core'"), f('build.gradle', ''),
      f('core/build.gradle', ''), f('core/src/A.java', ''),
    ])!;
    assert.deepEqual(inspection.workspaces, ['core']);
  });
});

describe('.NET', () => {
  it('detects a project file and restores before testing', () => {
    const adapter = new DotnetRuntimeAdapter();
    const inspection = adapter.detect([f('api.csproj', '<Project/>'), f('Program.cs', '')])!;
    assert.equal(inspection.packageManager, 'nuget');
    assert.equal(argv(adapter.installCommands(inspection)[0]), 'dotnet restore');
    assert.match(argv(adapter.unitTestCommands(inspection)[0]), /dotnet test/);
  });

  it('parses a C# compile error', () => {
    const [diagnostic] = new DotnetRuntimeAdapter().parseFailure(
      "Program.cs(9,13): error CS0103: The name 'foo' does not exist [/src/api.csproj]",
    );
    assert.equal(diagnostic.file, 'Program.cs');
    assert.equal(diagnostic.line, 9);
    assert.match(diagnostic.message, /CS0103/);
  });
});

describe('Dart and Flutter', () => {
  it('distinguishes Flutter from plain Dart, which changes every command', () => {
    const adapter = new DartRuntimeAdapter();
    const flutter = adapter.detect([f('pubspec.yaml', 'name: app\ndependencies:\n  flutter:\n    sdk: flutter\n')])!;
    const dart = adapter.detect([f('pubspec.yaml', 'name: tool\ndependencies:\n  args: ^2.0.0\n')])!;

    assert.equal(argv(adapter.unitTestCommands(flutter)[0]), 'flutter test');
    assert.equal(argv(adapter.unitTestCommands(dart)[0]), 'dart test');
  });

  it('emits no build for Flutter, because the sandbox has no platform SDKs', () => {
    // `flutter build apk` would fail for an environment reason and read like a code
    // defect. Emitting nothing is the honest answer.
    const adapter = new DartRuntimeAdapter();
    const flutter = adapter.detect([f('pubspec.yaml', 'name: app\ndependencies:\n  flutter:\n    sdk: flutter\n')])!;
    assert.deepEqual(adapter.buildCommands(flutter), []);
  });
});

describe('PHP', () => {
  it('picks the configured test runner rather than assuming PHPUnit', () => {
    const adapter = new PhpRuntimeAdapter();
    const pest = adapter.detect([f('composer.json', JSON.stringify({ 'require-dev': { 'pestphp/pest': '^2' } }))])!;
    const phpunit = adapter.detect([f('composer.json', JSON.stringify({ 'require-dev': { 'phpunit/phpunit': '^11' } }))])!;

    assert.match(argv(adapter.unitTestCommands(pest)[0]), /pest/);
    assert.match(argv(adapter.unitTestCommands(phpunit)[0]), /phpunit/);
  });

  it('emits no test command when none is configured', () => {
    const adapter = new PhpRuntimeAdapter();
    const inspection = adapter.detect([f('composer.json', '{}')])!;
    assert.deepEqual(adapter.unitTestCommands(inspection), []);
  });

  it('recognises a WordPress plugin by its header', () => {
    // Worth naming because its lifecycle and packaging differ completely from a Composer
    // library.
    const inspection = new PhpRuntimeAdapter().detect([
      f('plugin.php', '<?php\n/**\n * Plugin Name: Appointments\n */\n'),
    ])!;
    assert.ok(inspection.evidence.some((line) => /WordPress plugin header/.test(line)));
  });

  it('never runs Composer install scripts', () => {
    const adapter = new PhpRuntimeAdapter();
    const inspection = adapter.detect([f('composer.json', '{}')])!;
    assert.ok(adapter.installCommands(inspection)[0].args.includes('--no-scripts'));
  });
});

describe('C and C++', () => {
  it('derives commands from the declared build system rather than assuming one', () => {
    const adapter = new CppRuntimeAdapter();
    const cmake = adapter.detect([f('CMakeLists.txt', 'project(a)'), f('src/main.cpp', '')])!;
    const meson = adapter.detect([f('meson.build', "project('a')"), f('src/main.c', '')])!;
    const make = adapter.detect([f('Makefile', 'all:\n\tgcc main.c'), f('main.c', '')])!;

    assert.match(argv(adapter.buildCommands(cmake)[0]), /^cmake -S \./);
    assert.match(argv(adapter.buildCommands(meson)[0]), /^meson setup/);
    assert.equal(argv(adapter.buildCommands(make)[0]), 'make');
  });

  it('claims only `detected`, because this ecosystem has several real answers', () => {
    assert.equal(new CppRuntimeAdapter().capabilityState, 'detected');
  });

  it('treats a Makefile test target as optional', () => {
    // It is a convention, not a guarantee; its absence is not a project defect.
    const adapter = new CppRuntimeAdapter();
    const make = adapter.detect([f('Makefile', 'all:\n\tgcc main.c'), f('main.c', '')])!;
    assert.equal(adapter.unitTestCommands(make)[0].optional, true);
  });

  it('recognises a link failure as a compile error rather than a missing dependency', () => {
    const diagnostics = new CppRuntimeAdapter().parseFailure('undefined reference to `helper()`\nld returned 1 exit status');
    assert.ok(diagnostics.some((d) => d.kind === 'compile_error' && /declared but never defined/.test(d.message)));
  });
});

describe('Solidity', () => {
  it('uses Foundry or Hardhat according to what is configured', () => {
    const adapter = new SolidityRuntimeAdapter();
    const forge = adapter.detect([f('foundry.toml', '[profile.default]\n')])!;
    const hardhat = adapter.detect([f('hardhat.config.ts', 'export default {}')])!;

    assert.equal(argv(adapter.unitTestCommands(forge)[0]), 'forge test -vv');
    assert.match(argv(adapter.unitTestCommands(hardhat)[0]), /hardhat test/);
  });

  it('records fuzz and invariant configuration as evidence', () => {
    const inspection = new SolidityRuntimeAdapter().detect([
      f('foundry.toml', '[profile.default]\n\n[fuzz]\nruns = 256\n\n[invariant]\nruns = 32\n'),
    ])!;
    assert.ok(inspection.evidence.some((line) => /fuzz testing is configured/.test(line)));
    assert.ok(inspection.evidence.some((line) => /invariant testing is configured/.test(line)));
  });

  it('exposes no packaging command that could reach a chain', () => {
    // Deployment is an irreversible transaction with real cost. It must never be
    // reachable from a routine validation phase.
    const adapter = new SolidityRuntimeAdapter();
    const forge = adapter.detect([f('foundry.toml', '[profile.default]\n')])!;
    assert.deepEqual(adapter.packageCommands(), []);
    for (const phase of [adapter.buildCommands(forge), adapter.unitTestCommands(forge), adapter.installCommands(forge)]) {
      for (const command of phase) {
        assert.ok(!/deploy|broadcast|--rpc-url/.test(argv(command)), `${argv(command)} must not reach a chain`);
      }
    }
  });
});

describe('adding seven ecosystems changed nothing above the adapter layer', () => {
  it('registers all seven and routes each component to the right one', () => {
    withAdditional(() => {
      const composition = detectComposition([
        f('api/go.mod', 'module api\n'), f('api/main.go', 'package main'),
        f('svc/pom.xml', '<project/>'), f('svc/src/A.java', ''),
        f('web/composer.json', '{}'), f('web/index.php', '<?php'),
        f('chain/foundry.toml', '[profile.default]\n'),
      ]);
      const byRoot = Object.fromEntries(composition.components.map((c) => [c.root, c.adapterId]));

      assert.equal(byRoot.api, 'go');
      assert.equal(byRoot.svc, 'jvm');
      assert.equal(byRoot.web, 'php');
      assert.equal(byRoot.chain, 'solidity');
    });
  });

  it('gives each ecosystem an image whose toolchain exists', () => {
    withAdditional(() => {
      const composition = detectComposition([f('go.mod', 'module a\n'), f('main.go', 'package main')]);
      assert.match(sandboxImageFor(composition.components[0]) ?? '', /golang/);
    });
  });

  it('still admits an eighth ecosystem the codebase has never heard of', () => {
    // §11's real requirement. If this needed a pipeline edit, the architecture failed.
    withAdditional(() => {
      registerRuntimeAdapter({
        id: 'gleam', adapterVersion: '0.1.0', displayName: 'Gleam', languages: ['gleam'],
        runtimes: ['beam'], platforms: ['linux'], capabilityState: 'planned',
        manifestNames: ['gleam.toml'],
        detect: (files, root = '') =>
          files.some((file) => file.path === (root ? `${root}/gleam.toml` : 'gleam.toml'))
            ? { adapterId: 'gleam', root, languages: ['gleam'], manifests: ['gleam.toml'], lockfiles: [], packageManager: 'gleam', buildSystem: 'gleam', testRunner: 'gleam-test', workspaces: [], entrypoints: [], confidence: 1, evidence: ['gleam.toml'] }
            : null,
        installCommands: () => [], formatCommands: () => [], lintCommands: () => [],
        typecheckCommands: () => [],
        unitTestCommands: () => [{ command: 'gleam', args: ['test'], networkPolicy: 'none', source: 'manifest', purpose: '' }],
        buildCommands: () => [], packageCommands: () => [], artifactLocations: () => [],
        environmentRequirements: () => ({}), parseFailure: () => [], repairHints: () => [],
      });

      const composition = detectComposition([f('gleam.toml', 'name = "app"\n'), f('src/app.gleam', '')]);
      assert.equal(composition.components[0].adapterId, 'gleam');
      assert.equal(argv(commandsFor(composition.components[0], 'test')[0]), 'gleam test');
    });
  });

  it('leaves generic discovery working for anything still unmatched', () => {
    // The seven are accelerators, not a whitelist. A language with no adapter must still
    // reach discovery after this file as before it.
    withAdditional(() => {
      const spec = deriveRuntimeCapability([
        f('src/main.nim', 'echo 1'),
        f('.github/workflows/ci.yml', 'steps:\n  - run: nimble test\n'),
      ]);
      assert.ok(spec, 'discovery must still engage for an unrecognised toolchain');
      assert.equal(`${spec.test?.command} ${spec.test?.args.join(' ')}`, 'nimble test');
    });
  });

  it('states capability honestly per ecosystem rather than uniformly', () => {
    const states = {
      go: new GoRuntimeAdapter().capabilityState,
      jvm: new JvmRuntimeAdapter().capabilityState,
      cpp: new CppRuntimeAdapter().capabilityState,
    };
    assert.equal(states.go, 'implementation_available');
    assert.equal(states.jvm, 'implementation_available');
    assert.equal(states.cpp, 'detected', 'C/C++ genuinely has several build answers');
  });

  it('recognises a missing toolchain in every new adapter', () => {
    const cases: ReadonlyArray<[{ parseFailure: (o: string) => readonly { kind: string }[] }, string]> = [
      [new GoRuntimeAdapter(), 'bash: go: command not found'],
      [new JvmRuntimeAdapter(), 'bash: mvn: command not found'],
      [new DotnetRuntimeAdapter(), 'bash: dotnet: command not found'],
      [new DartRuntimeAdapter(), 'bash: flutter: command not found'],
      [new PhpRuntimeAdapter(), 'bash: composer: command not found'],
      [new CppRuntimeAdapter(), 'bash: cmake: command not found'],
      [new SolidityRuntimeAdapter(), 'bash: forge: command not found'],
    ];
    for (const [adapter, output] of cases) {
      assert.ok(
        adapter.parseFailure(output).some((d) => d.kind === 'toolchain_missing'),
        `should recognise a missing toolchain in: ${output}`,
      );
    }
  });
});
