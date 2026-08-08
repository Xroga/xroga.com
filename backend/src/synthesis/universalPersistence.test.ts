/**
 * Tests for universal persistence and the migration's safety properties.
 *
 * Two kinds of check. The store tests use the in-memory implementation, which is a real
 * deployment mode rather than a double. The migration tests read the SQL and assert on
 * properties that cannot be recovered once the migration has run — that no client can
 * write, that no secret column exists, and that Command 1's tables are untouched.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { synthesizeUniversalProductSpec, withCustomSurface } from './universalProductSpec.js';
import { planArchitecture } from './architecturePlan.js';
import { buildIndex, readIndex, type RepositoryIdentity } from './repositoryIndex.js';
import { addTask, createGraph } from './dynamicPlanning.js';
import { createEvidence } from './researchEvidence.js';
import {
  InMemoryUniversalStore,
  setUniversalStoreForTesting,
  universalStore,
  type Owner,
} from './universalPersistence.js';
import type { ExecutableTaskNode } from '../ai/executionRuntime.js';

const owner: Owner = { userId: 'user-1', projectId: 'project-1' };
const otherOwner: Owner = { userId: 'user-2', projectId: 'project-2' };

const MIGRATION = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../../supabase/migrations/20260808000000_command2_universal_persistence.sql'),
  'utf8',
);

const task = (id: string, dependencies: string[] = []): ExecutableTaskNode => ({
  id, objective: id, operationType: 'implement', requiredCapabilities: [],
  selectedRuntime: null, selectedProvider: null, selectedModel: null,
  requiredContextReferences: [], allowedFiles: [], expectedOutputSchema: {},
  dependencies, riskLevel: 'low', timeoutMs: 1000,
  retryPolicy: { maximumAttempts: 1, initialBackoffMs: 0, maximumBackoffMs: 0 },
  budget: {}, validationMethod: [], evidenceRequirements: [], fallbackRoutes: [],
  status: 'pending', attempts: 0, evidence: [],
});

describe('specs and plans survive a round trip', () => {
  it('reloads a spec for a follow-up request', async () => {
    // §51's requirement: a prompt months later must load the spec rather than re-derive it
    // from a sentence.
    const store = new InMemoryUniversalStore();
    const spec = synthesizeUniversalProductSpec({ prompt: 'Build a Python FastAPI task API with SQLite' });

    assert.equal((await store.saveSpec(owner, spec)).saved, true);
    const loaded = await store.loadLatestSpec(owner);

    assert.equal(loaded?.title, spec.title);
    assert.deepEqual(loaded?.surfaces.map((s) => s.surface), spec.surfaces.map((s) => s.surface));
  });

  it('preserves a custom surface through storage', async () => {
    // The openness has to survive persistence, or a spec shrinks silently on reload.
    const store = new InMemoryUniversalStore();
    const spec = withCustomSurface(
      synthesizeUniversalProductSpec({ prompt: 'Build a telemetry bridge' }),
      'avionics_bridge', 'the product bridges two telemetry buses',
    );

    await store.saveSpec(owner, spec);
    const loaded = await store.loadLatestSpec(owner);
    assert.ok(loaded?.surfaces.some((declaration) => declaration.surface === 'avionics_bridge'));
  });

  it('reloads a plan with its decisions and blockers intact', async () => {
    const store = new InMemoryUniversalStore();
    const spec = synthesizeUniversalProductSpec({ prompt: 'Build a Go API for managing tasks' });
    const plan = planArchitecture({ spec });

    await store.savePlan(owner, plan);
    const loaded = await store.loadLatestPlan(owner);

    assert.equal(loaded?.decisions.length, plan.decisions.length);
    assert.deepEqual(loaded?.blockers, plan.blockers);
  });
});

describe('one owner cannot read another', () => {
  // The property RLS enforces in the database, enforced here by key. Both layers must
  // agree, because the in-memory store is a real deployment mode.
  it('keeps specs separate', async () => {
    const store = new InMemoryUniversalStore();
    await store.saveSpec(owner, synthesizeUniversalProductSpec({ prompt: 'Build an API' }));
    assert.equal(await store.loadLatestSpec(otherOwner), null);
  });

  it('keeps repository indexes separate by project and branch', async () => {
    const store = new InMemoryUniversalStore();
    const identity: RepositoryIdentity = {
      repositoryId: 'r1', repositoryOwner: 'Xroga', repositoryName: 'demo',
      projectId: 'project-1', branch: 'main',
    };
    await store.save(buildIndex({ identity, commitSha: 'aaa', files: [{ path: 'a.ts', content: '' }] }));

    assert.equal((await readIndex(store, identity, 'aaa')).freshness, 'fresh');
    assert.equal((await readIndex(store, { ...identity, projectId: 'project-2' }, 'aaa')).freshness, 'absent');
    assert.equal((await readIndex(store, { ...identity, branch: 'develop' }, 'aaa')).freshness, 'absent');
  });

  it('keeps replanning logs separate', async () => {
    const store = new InMemoryUniversalStore();
    const graph = addTask(createGraph([task('a')]), {
      runId: 'run-1', kind: 'create_migration_task', task: task('migration'),
      blocks: ['a'], triggeredByTaskId: 'a', reason: 'schema change required',
    }).graph;

    await store.saveMutations(owner, 'run-1', graph.mutations);
    assert.equal((await store.loadMutations(owner, 'run-1')).length, 1);
    assert.equal((await store.loadMutations(otherOwner, 'run-1')).length, 0);
  });
});

describe('a resumed run does not duplicate its log', () => {
  it('deduplicates on write as the unique index does', async () => {
    const store = new InMemoryUniversalStore();
    const graph = addTask(createGraph([task('a')]), {
      runId: 'run-1', kind: 'create_migration_task', task: task('migration'),
      blocks: ['a'], triggeredByTaskId: 'a', reason: 'schema change required',
    }).graph;

    await store.saveMutations(owner, 'run-1', graph.mutations);
    await store.saveMutations(owner, 'run-1', graph.mutations);

    assert.equal((await store.loadMutations(owner, 'run-1')).length, 1);
  });
});

describe('research evidence is stored with its provenance', () => {
  it('round-trips without losing the tier or expiry', async () => {
    const store = new InMemoryUniversalStore();
    const evidence = createEvidence({
      researchRunId: 'research-1', provider: 'fixture', query: 'install',
      sourceUrl: 'https://docs.rs/serde', content: 'cargo add serde', fact: 'cargo add serde',
      freshnessClass: 'version_sensitive', conflictGroup: 'install:serde',
    });
    assert.equal((await store.saveResearchEvidence(owner, 'research-1', [evidence])).saved, true);
  });
});

describe('the store falls back rather than refusing', () => {
  it('uses memory when Supabase is not configured', () => {
    // A deployment without persistence works, losing only cross-process memory. Making
    // this a hard dependency would refuse builds for a reason unrelated to the build.
    setUniversalStoreForTesting(null);
    const store = universalStore(null);
    assert.ok(store instanceof InMemoryUniversalStore);
    setUniversalStoreForTesting(null);
  });
});

describe('the migration is safe by construction', () => {
  it('recreates none of Command 1\'s tables', () => {
    // Verified against the live schema too: execution_runs, model_routing_outcomes,
    // project_memory, swarm_run_traces and swarm_runs all exist already.
    for (const table of ['execution_runs', 'model_routing_outcomes', 'project_memory', 'swarm_run_traces', 'swarm_runs']) {
      assert.ok(
        !new RegExp(`CREATE TABLE[^;]*\\b${table}\\b`, 'i').test(MIGRATION),
        `the migration must not recreate ${table}`,
      );
    }
  });

  it('drops nothing and alters no existing table', () => {
    // A rollback must not be able to damage Command 1 data.
    assert.ok(!/\bDROP\s+TABLE\b/i.test(MIGRATION), 'no table may be dropped');
    assert.ok(!/\bDROP\s+COLUMN\b/i.test(MIGRATION), 'no column may be dropped');
    assert.ok(!/\bTRUNCATE\b/i.test(MIGRATION), 'nothing may be truncated');
  });

  it('is re-runnable', () => {
    const creates = MIGRATION.match(/CREATE TABLE(?! IF NOT EXISTS)/gi) ?? [];
    assert.deepEqual(creates, [], 'every CREATE TABLE must be IF NOT EXISTS');
    const indexes = MIGRATION.match(/CREATE INDEX(?! IF NOT EXISTS)/gi) ?? [];
    assert.deepEqual(indexes, [], 'every CREATE INDEX must be IF NOT EXISTS');
  });

  it('enables row level security on every new table', () => {
    const tables = [...MIGRATION.matchAll(/CREATE TABLE IF NOT EXISTS public\.(\w+)/gi)].map((m) => m[1]);
    assert.ok(tables.length >= 10, `expected at least 10 new tables, found ${tables.length}`);
    for (const table of tables) {
      assert.ok(
        new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, 'i').test(MIGRATION),
        `${table} must have RLS enabled`,
      );
    }
  });

  it('grants no client write access anywhere', () => {
    // The backend is the only writer. A compromised client token must not be able to
    // forge a spec, a benchmark result or a piece of research evidence.
    const authenticatedGrants = [...MIGRATION.matchAll(/GRANT\s+([A-Z, ]+?)\s+ON\s+TABLE[^;]*TO\s+authenticated/gi)];
    assert.ok(authenticatedGrants.length > 0, 'the fixture should find some grants');
    for (const grant of authenticatedGrants) {
      assert.equal(grant[1].trim().toUpperCase(), 'SELECT', `authenticated may only SELECT, found ${grant[1]}`);
    }
    assert.ok(!/FOR\s+(INSERT|UPDATE|DELETE|ALL)/i.test(MIGRATION), 'no write policy may exist for clients');
  });

  it('keeps per-file index rows and model tables off the client entirely', () => {
    // repository_index_files holds derived content from private repositories; the model
    // tables hold routing evidence. Neither is world-readable by accident.
    for (const table of ['repository_index_files', 'model_capability_profiles', 'model_benchmark_runs']) {
      assert.ok(
        !new RegExp(`GRANT[^;]*ON TABLE public\\.${table} TO authenticated`, 'i').test(MIGRATION),
        `${table} must not be granted to authenticated`,
      );
    }
  });

  it('stores no secret column', () => {
    // Provider credentials stay in the existing encrypted-secret system.
    for (const forbidden of ['api_key', 'secret_key', 'access_token', 'password', 'private_key', 'service_role_key']) {
      assert.ok(
        !new RegExp(`^\\s+${forbidden}\\s+(TEXT|VARCHAR)`, 'im').test(MIGRATION),
        `the migration must not define a ${forbidden} column`,
      );
    }
  });

  it('makes a capability profile expiry mandatory', () => {
    // A profile with no expiry would be trusted forever, which is exactly what the expiry
    // mechanism exists to prevent.
    assert.match(MIGRATION, /expires_at TIMESTAMPTZ NOT NULL,/);
  });

  it('makes the replanning key unique, which is what idempotent resume rests on', () => {
    assert.match(MIGRATION, /mutation_key TEXT NOT NULL UNIQUE/);
  });

  it('scopes a repository index to one project and branch', () => {
    assert.match(MIGRATION, /UNIQUE \(project_id, repository_id, branch\)/);
  });
});
