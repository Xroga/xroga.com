/**
 * Tests for repository discovery.
 *
 * The property under test is not "does it find package.json" — it is that recognition and
 * capability stay separate, so a Gradle repository reports as Gradle-that-cannot-be-built
 * rather than as nothing. That distinction is what stops a Java service being regenerated
 * as a static website.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ProjectFile } from '../../ai/patches.js';
import {
  detectEcosystems,
  detectMonorepoLayouts,
  discoverRepository,
  genericSignals,
  unsupportedEcosystems,
} from './repositoryDiscovery.js';

const f = (path: string, content = ''): ProjectFile => ({ path, content });

describe('recognition is separate from capability', () => {
  // The distinction the whole module exists for. "Unknown" and "known but unbuildable"
  // lead to different and correct behaviours; collapsing them produces a confident wrong
  // answer instead of a specific blocker.
  it('names a Gradle repository even though no adapter can build it', () => {
    const signals = detectEcosystems([
      f('build.gradle.kts', 'plugins { kotlin("jvm") }'),
      f('settings.gradle.kts', 'rootProject.name = "svc"'),
      f('src/main/kotlin/Main.kt', 'fun main() {}'),
    ]);

    const jvm = signals.find((signal) => signal.ecosystem === 'jvm');
    assert.ok(jvm, 'a Gradle repository must be recognised');
    assert.equal(jvm.buildSystem, 'gradle');
    assert.equal(jvm.adapterId, null, 'and honestly reported as having no adapter');
    assert.deepEqual(unsupportedEcosystems(signals).map((s) => s.ecosystem), ['jvm']);
  });

  it('reports ecosystems with adapters as supported', () => {
    const signals = detectEcosystems([f('Cargo.toml', '[package]\nname = "a"\n')]);
    assert.equal(signals[0].adapterId, 'rust');
    assert.deepEqual(unsupportedEcosystems(signals), []);
  });

  it('recognises each of the section 8 ecosystems it claims to', () => {
    // A regression guard on the table itself. Adding a marker with the wrong ecosystem
    // name is otherwise invisible until a real repository hits it.
    const cases: ReadonlyArray<[string, string]> = [
      ['go.mod', 'go'],
      ['pom.xml', 'jvm'],
      ['composer.json', 'php'],
      ['Gemfile', 'ruby'],
      ['pubspec.yaml', 'dart'],
      ['Package.swift', 'swift'],
      ['mix.exs', 'elixir'],
      ['build.zig', 'zig'],
      ['CMakeLists.txt', 'cpp'],
      ['foundry.toml', 'solidity'],
      ['Anchor.toml', 'solana'],
      ['Chart.yaml', 'helm'],
      ['api.csproj', 'dotnet'],
      ['main.tf', 'terraform'],
      ['Dockerfile', 'container'],
      ['lib.gemspec', 'ruby'],
    ];
    for (const [file, ecosystem] of cases) {
      const signals = detectEcosystems([f(file)]);
      assert.ok(
        signals.some((signal) => signal.ecosystem === ecosystem),
        `${file} should be recognised as ${ecosystem}`,
      );
    }
  });

  it('attributes an ecosystem to its own directory, not the whole tree', () => {
    // A tree holding Terraform under infra/ and Node at the root is neither "a Terraform
    // repository" nor "a Node repository".
    const signals = detectEcosystems([
      f('package.json', '{"name":"web"}'),
      f('infra/main.tf', ''),
      f('services/api/go.mod', 'module x'),
    ]);
    const byEcosystem = Object.fromEntries(signals.map((s) => [s.ecosystem, s.root]));
    assert.equal(byEcosystem.node, '');
    assert.equal(byEcosystem.terraform, 'infra');
    assert.equal(byEcosystem.go, 'services/api');
  });

  it('lets several markers reinforce one ecosystem rather than compete', () => {
    const signals = detectEcosystems([f('pom.xml', ''), f('build.gradle', '')]);
    const jvm = signals.filter((signal) => signal.ecosystem === 'jvm');
    assert.equal(jvm.length, 1, 'one JVM signal in one directory');
    assert.equal(jvm[0].markers.length, 2, 'carrying both markers as evidence');
  });
});

describe('monorepo layouts', () => {
  it('detects the tool, which changes which commands are correct', () => {
    // An Nx repository builds through `nx affected`; running a package script directly
    // bypasses the dependency graph that makes the result correct.
    assert.equal(detectMonorepoLayouts([f('nx.json', '{}')])[0].kind, 'nx');
    assert.equal(detectMonorepoLayouts([f('turbo.json', '{}')])[0].kind, 'turborepo');
    assert.equal(detectMonorepoLayouts([f('go.work', '')])[0].kind, 'go-workspace');
    assert.equal(detectMonorepoLayouts([f('MODULE.bazel', '')])[0].kind, 'bazel');
  });

  it('reads a Cargo workspace from the section rather than the filename', () => {
    assert.equal(
      detectMonorepoLayouts([f('Cargo.toml', '[workspace]\nmembers = ["a"]\n')])[0].kind,
      'cargo-workspace',
    );
    assert.deepEqual(detectMonorepoLayouts([f('Cargo.toml', '[package]\nname = "a"\n')]), []);
  });

  it('does not treat a malformed package.json as a monorepo', () => {
    assert.deepEqual(detectMonorepoLayouts([f('package.json', '{ not json')]), []);
  });
});

describe('generic signals for repositories no marker recognises', () => {
  it('reads CI run steps, which state how the project is really built', () => {
    // The strongest evidence available: maintained, executable, and run on every push.
    const signals = genericSignals([
      f('.github/workflows/ci.yml', 'jobs:\n  build:\n    steps:\n      - run: swift build -c release\n      - run: swift test\n'),
    ]);
    const commands = signals.filter((s) => s.kind === 'ci_workflow').map((s) => s.suggestedCommand);
    assert.deepEqual(commands, ['swift build -c release', 'swift test']);
  });

  it('reads a shebang as a direct statement of the interpreter', () => {
    const [signal] = genericSignals([f('scripts/run', '#!/usr/bin/env ruby\nputs 1\n')]);
    assert.equal(signal.kind, 'shebang');
    assert.equal(signal.suggestedCommand, 'ruby');
  });

  it('reads Makefile targets and Dockerfile RUN lines', () => {
    const make = genericSignals([f('Makefile', 'build:\n\tzig build\n\ntest:\n\tzig build test\n')]);
    assert.deepEqual(
      make.filter((s) => s.kind === 'make_target').map((s) => s.suggestedCommand),
      ['make build', 'make test'],
    );

    const docker = genericSignals([f('Dockerfile', 'FROM alpine\nRUN mix deps.get\nRUN mix compile\n')]);
    assert.deepEqual(
      docker.filter((s) => s.kind === 'container').map((s) => s.detail),
      ['mix deps.get', 'mix compile'],
    );
  });

  it('reads documented build commands out of a README code fence', () => {
    const signals = genericSignals([
      f('README.md', 'Install it:\n\n```sh\n$ nimble build\n$ nimble test\n```\n'),
    ]);
    assert.deepEqual(
      signals.filter((s) => s.kind === 'documentation').map((s) => s.suggestedCommand),
      ['nimble build', 'nimble test'],
    );
  });

  it('counts source files by language when nothing else identifies the project', () => {
    const signals = genericSignals([f('src/a.nim', ''), f('src/b.nim', ''), f('src/c.hs', '')]);
    const extensions = signals.filter((s) => s.kind === 'extension').map((s) => s.detail);
    assert.ok(extensions.some((detail) => /2 nim source/.test(detail)));
    assert.ok(extensions.some((detail) => /1 haskell source/.test(detail)));
  });
});

describe('deciding when runtime discovery is needed', () => {
  it('asks for discovery when content exists that no adapter can build', () => {
    const discovery = discoverRepository([
      f('mix.exs', 'defmodule App.MixProject do\nend'),
      f('lib/app.ex', ''),
    ]);
    assert.equal(discovery.needsRuntimeDiscovery, true);
    assert.deepEqual(discovery.unsupported.map((s) => s.ecosystem), ['elixir']);
  });

  it('does not ask for discovery when an adapter already covers the tree', () => {
    const discovery = discoverRepository([
      f('Cargo.toml', '[package]\nname = "a"\n'),
      f('src/main.rs', 'fn main() {}'),
    ]);
    assert.equal(discovery.needsRuntimeDiscovery, false);
  });

  it('does not ask for discovery on an empty repository', () => {
    // Nothing to discover is a different state from something unrecognised, and a
    // greenfield build must not be sent down a discovery path with no input.
    const discovery = discoverRepository([]);
    assert.equal(discovery.needsRuntimeDiscovery, false);
    assert.deepEqual(discovery.ecosystems, []);
  });

  it('asks for discovery for a language with no marker at all', () => {
    // The case that proves the table is not a whitelist: nothing here matches any marker,
    // and the repository still produces evidence to work from.
    const discovery = discoverRepository([
      f('src/main.nim', 'echo "hi"'),
      f('Makefile', 'build:\n\tnim c src/main.nim\n'),
    ]);
    assert.equal(discovery.needsRuntimeDiscovery, true);
    assert.deepEqual(discovery.ecosystems, [], 'no marker claims it');
    assert.ok(
      discovery.generic.some((signal) => signal.suggestedCommand === 'make build'),
      'but the Makefile still yields a command to try',
    );
  });

  it('reports a polyglot tree as supported when every part has an adapter', () => {
    const discovery = discoverRepository([
      f('frontend/package.json', '{"name":"w"}'),
      f('service/pyproject.toml', '[tool.poetry]\nname="s"\n'),
      f('worker/Cargo.toml', '[package]\nname="w"\n'),
    ]);
    assert.equal(discovery.needsRuntimeDiscovery, false);
    assert.equal(discovery.ecosystems.length, 3);
    assert.deepEqual(discovery.unsupported, []);
  });
});
