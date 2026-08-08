/**
 * Tests for the enabled universal execution path.
 *
 * The fallback rules carry most of the weight. A fallback is the easiest place to
 * reintroduce the failure this whole command removes — legacy would not error on a Rust
 * CLI, it would succeed at building a website — so most of these assert on refusing to
 * fall back rather than on the happy path.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ProjectFile } from '../ai/patches.js';
import { readUniversalAgentFlags } from '../config/universalAgentFlags.js';
import { InMemoryUniversalStore, type Owner } from './universalPersistence.js';
import {
  canFallBack,
  executeUniversalRun,
  resumePolicy,
  type ExecutionAdapters,
} from './universalExecution.js';

const f = (path: string, content = ''): ProjectFile => ({ path, content });
const owner: Owner = { userId: 'user-1', projectId: 'demo-project' };

const enabled = readUniversalAgentFlags({
  UNIVERSAL_AGENT_ENABLED: 'enabled',
  UNIVERSAL_AGENT_ALLOWLIST: 'demo-project',
});
const shadow = readUniversalAgentFlags({ UNIVERSAL_AGENT_ENABLED: 'shadow' });
const off = readUniversalAgentFlags({});

const rustCrate: ProjectFile[] = [
  f('Cargo.toml', '[package]\nname = "csvjson"\nversion = "0.1.0"\n'),
  f('src/main.rs', 'fn main() { println!("ok"); }'),
  f('tests/cli.rs', '#[test]\nfn converts() { assert!(true); }'),
];

const adapters = (overrides: Partial<ExecutionAdapters> = {}): ExecutionAdapters => ({
  implement: async () => rustCrate,
  runValidation: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
  review: async () => ({ approved: true, findings: [] }),
  commit: async () => ({ commitSha: 'abc123def456' }),
  ...overrides,
});

describe('routing controls whether anything happens at all', () => {
  it('does nothing when the flag is off', async () => {
    const result = await executeUniversalRun({
      prompt: 'Build a Rust CLI that converts CSV files to JSON',
      owner, runId: 'run-1', flags: off,
      adapters: adapters({ implement: async () => { throw new Error('must not implement'); } }),
    });
    assert.equal(result.outcome, 'not_selected');
    assert.equal(result.mutationBegan, false);
  });

  it('does nothing in shadow mode, because shadow never writes', async () => {
    const result = await executeUniversalRun({
      prompt: 'Build a Rust CLI that converts CSV files to JSON',
      owner, runId: 'run-1', flags: shadow,
      adapters: adapters({ commit: async () => { throw new Error('must not commit'); } }),
    });
    assert.equal(result.outcome, 'not_selected');
    assert.equal(result.commitSha, null);
  });

  it('runs for an allowlisted project when enabled', async () => {
    const result = await executeUniversalRun({
      prompt: 'Build a Rust CLI that converts CSV files to JSON',
      owner, runId: 'run-1', flags: enabled, adapters: adapters(),
    });
    assert.equal(result.outcome, 'completed');
  });
});

describe('a complete enabled run', () => {
  it('walks every phase and produces an exact commit', async () => {
    const result = await executeUniversalRun({
      prompt: 'Build a Rust CLI that converts CSV files to JSON',
      owner, runId: 'run-1', flags: enabled, adapters: adapters(),
      store: new InMemoryUniversalStore(),
    });

    assert.equal(result.outcome, 'completed');
    assert.equal(result.phaseReached, 'complete');
    assert.equal(result.commitSha, 'abc123def456');
    assert.equal(result.mutationBegan, true);

    const phases = result.evidence.map((entry) => entry.phase);
    for (const phase of ['routing', 'spec', 'architecture', 'security', 'planning', 'implementation', 'validation', 'review', 'commit']) {
      assert.ok(phases.includes(phase as never), `phase ${phase} produced no evidence`);
    }
  });

  it('derives security controls for what it is actually building', async () => {
    const result = await executeUniversalRun({
      prompt: 'Build a Rust CLI that converts CSV files to JSON',
      owner, runId: 'run-1', flags: enabled, adapters: adapters(),
    });
    const ids = result.securityControls.map((control) => control.id);
    assert.ok(ids.includes('sec:process-execution'));
    assert.ok(!ids.includes('sec:csrf'), 'a CLI gets no browser controls');
  });

  it('persists the spec and plan for a later follow-up', async () => {
    // §51 depends on this: a follow-up must load the spec rather than re-derive it.
    const store = new InMemoryUniversalStore();
    await executeUniversalRun({
      prompt: 'Build a Rust CLI that converts CSV files to JSON',
      owner, runId: 'run-1', flags: enabled, adapters: adapters(), store,
    });

    const spec = await store.loadLatestSpec(owner);
    const plan = await store.loadLatestPlan(owner);
    assert.ok(spec, 'the spec must be persisted');
    assert.ok(spec!.surfaces.some((declaration) => declaration.surface === 'cli'));
    assert.ok(plan, 'the plan must be persisted');
  });

  it('claims verification from evidence rather than from finishing', async () => {
    const result = await executeUniversalRun({
      prompt: 'Build a Rust CLI that converts CSV files to JSON',
      owner, runId: 'run-1', flags: enabled, adapters: adapters(),
    });
    assert.equal(result.verified, true);
    assert.match(result.reason, /every planned validation ran/);
  });

  it('completes without claiming verification when no test ran', async () => {
    // A repository with no test command produces none. Passing then proves only that the
    // toolchain executed.
    const result = await executeUniversalRun({
      prompt: 'Build a TypeScript library',
      owner, runId: 'run-1', flags: enabled,
      adapters: adapters({ implement: async () => [f('package.json', '{"name":"lib","scripts":{"build":"tsc"}}')] }),
    });
    assert.equal(result.outcome, 'completed');
    assert.equal(result.verified, false);
    assert.match(result.reason, /no test command ran/);
  });
});

describe('falling back to legacy is tightly bounded', () => {
  // The easiest place to reintroduce the failure this command removes: legacy would not
  // error on a Rust CLI, it would succeed at building a website.
  it('refuses fallback for a product legacy cannot build', () => {
    const verdict = canFallBack({ mutationBegan: false, surfaces: ['cli'] });
    assert.equal(verdict.allowed, false);
    assert.match(verdict.reason, /succeed at building the wrong product rather than fail/);
  });

  it('refuses fallback once anything has been written', () => {
    const verdict = canFallBack({ mutationBegan: true, surfaces: ['web_frontend'] });
    assert.equal(verdict.allowed, false);
    assert.match(verdict.reason, /half-built by two different pipelines/);
  });

  it('refuses fallback when no surface is known', () => {
    const verdict = canFallBack({ mutationBegan: false, surfaces: [] });
    assert.equal(verdict.allowed, false);
    assert.match(verdict.reason, /how an unfamiliar request becomes a website/);
  });

  it('allows fallback only for a web product before any write', () => {
    assert.equal(canFallBack({ mutationBegan: false, surfaces: ['web_frontend'] }).allowed, true);
    assert.equal(canFallBack({ mutationBegan: false, surfaces: ['mobile_app'] }).allowed, true);
  });

  it('fails rather than falling back when a Rust build breaks mid-implementation', async () => {
    const result = await executeUniversalRun({
      prompt: 'Build a Rust CLI that converts CSV files to JSON',
      owner, runId: 'run-1', flags: enabled,
      adapters: adapters({ implement: async () => { throw new Error('model unavailable'); } }),
    });

    assert.equal(result.outcome, 'failed', 'must not fall back for a CLI');
    assert.match(result.reason, /cannot build cli/);
    assert.equal(result.commitSha, null);
  });

  it('may fall back for a web product that fails before any write', async () => {
    const result = await executeUniversalRun({
      prompt: 'Build a marketing website with a pricing page',
      owner, runId: 'run-1', flags: enabled,
      adapters: adapters({ implement: async () => { throw new Error('model unavailable') } }),
    });
    assert.equal(result.outcome, 'fell_back_to_legacy');
    assert.equal(result.mutationBegan, false);
  });
});

describe('refusal and blocking short-circuit before implementation', () => {
  it('refuses an unintelligible request without implementing anything', async () => {
    let implemented = false;
    const result = await executeUniversalRun({
      prompt: 'make it better', owner, runId: 'run-1', flags: enabled,
      adapters: adapters({ implement: async () => { implemented = true; return []; } }),
    });

    assert.equal(result.outcome, 'refused');
    assert.equal(implemented, false, 'nothing may be generated for a request nobody understood');
    assert.equal(result.mutationBegan, false);
  });

  it('blocks when no adapter can build the selected language', async () => {
    let implemented = false;
    const result = await executeUniversalRun({
      prompt: 'Build a Go API for managing tasks', owner, runId: 'run-1', flags: enabled,
      adapters: adapters({ implement: async () => { implemented = true; return []; } }),
    });

    assert.equal(result.outcome, 'blocked');
    assert.equal(implemented, false);
    assert.ok(result.blockers.length > 0);
  });
});

describe('validation, repair and review gate the commit', () => {
  it('does not commit when validation fails', async () => {
    let committed = false;
    const result = await executeUniversalRun({
      prompt: 'Build a Rust CLI that converts CSV files to JSON',
      owner, runId: 'run-1', flags: enabled,
      adapters: adapters({
        runValidation: async () => ({ exitCode: 1, stdout: '', stderr: 'error[E0308]: mismatched types' }),
        commit: async () => { committed = true; return { commitSha: 'x' }; },
      }),
    });

    assert.equal(result.outcome, 'failed');
    assert.equal(committed, false);
    assert.equal(result.mutationBegan, false);
  });

  it('runs a bounded repair and revalidates', async () => {
    // Keyed on whether the repair has run rather than on a call count: validation stops at
    // the first real failure, so the number of commands in a pass is not fixed.
    let repaired = false;
    const result = await executeUniversalRun({
      prompt: 'Build a Rust CLI that converts CSV files to JSON',
      owner, runId: 'run-1', flags: enabled,
      adapters: adapters({
        runValidation: async () =>
          repaired
            ? { exitCode: 0, stdout: '', stderr: '' }
            : { exitCode: 1, stdout: '', stderr: 'error[E0308]: mismatched types' },
        repair: async () => { repaired = true; return rustCrate; },
      }),
    });

    assert.equal(result.outcome, 'completed');
    assert.ok(result.evidence.some((entry) => entry.phase === 'repair'));
  });

  it('does not commit when review blocks', async () => {
    let committed = false;
    const result = await executeUniversalRun({
      prompt: 'Build a Rust CLI that converts CSV files to JSON',
      owner, runId: 'run-1', flags: enabled,
      adapters: adapters({
        review: async () => ({ approved: false, findings: ['a credential is written into source'] }),
        commit: async () => { committed = true; return { commitSha: 'x' }; },
      }),
    });

    assert.equal(result.outcome, 'failed');
    assert.equal(committed, false);
    assert.match(result.reason, /credential is written into source/);
  });

  it('does not fall back after a review failure', async () => {
    // Review failing means the generated code has a problem; legacy would not fix it.
    const result = await executeUniversalRun({
      prompt: 'Build a marketing website with a pricing page',
      owner, runId: 'run-1', flags: enabled,
      adapters: adapters({ review: async () => ({ approved: false, findings: ['xss in template'] }) }),
    });
    assert.equal(result.outcome, 'failed');
    assert.notEqual(result.outcome, 'fell_back_to_legacy');
  });
});

describe('an interrupted run resumes on the path that started it', () => {
  it('resumes universally once anything was written', () => {
    const policy = resumePolicy({ mutationBegan: true, commitSha: null, phaseReached: 'commit' });
    assert.equal(policy.resumeUniversally, true);
    assert.match(policy.reason, /must continue on the path that started it/);
  });

  it('resumes universally once a spec and plan exist', () => {
    // Resuming elsewhere would discard them and re-derive a different product.
    const policy = resumePolicy({ mutationBegan: false, commitSha: null, phaseReached: 'architecture' });
    assert.equal(policy.resumeUniversally, true);
  });

  it('leaves a run that never got past routing free to take either path', () => {
    const policy = resumePolicy({ mutationBegan: false, commitSha: null, phaseReached: 'routing' });
    assert.equal(policy.resumeUniversally, false);
  });
});
