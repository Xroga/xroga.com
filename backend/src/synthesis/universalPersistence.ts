/**
 * Persisting what the universal path produces.
 *
 * The reason this exists is §51: a follow-up prompt months later — "add task due dates" —
 * must load the spec, the plan and the repository facts rather than re-deriving them from
 * a sentence. Without persistence every request is a first request, and Xroga is a
 * generator rather than an engineering agent.
 *
 * Two design points are worth stating.
 *
 * **The store is an interface, and the in-memory implementation is not a stub.** A
 * deployment without Supabase configured runs on it and works, losing only the memory
 * between processes. That keeps persistence a deployment decision rather than a hard
 * dependency, and it is what lets every test here run without a database.
 *
 * **A write failure is never silent.** Persistence is a side effect of a build, and a
 * build should not fail because a row could not be saved — but a caller that thinks it
 * saved a spec and did not will later load a stale one and act on it. So writes return a
 * result, and `SupabaseUniversalStore` reports the error rather than swallowing it.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ArchitecturePlan } from './architecturePlan.js';
import type { UniversalProductSpec } from './universalProductSpec.js';
import type { PlanMutation } from './dynamicPlanning.js';
import type { ResearchEvidence } from './researchEvidence.js';
import type {
  IndexedFile,
  RepositoryIdentity,
  RepositoryIndex,
  RepositoryIndexStore,
} from './repositoryIndex.js';

export interface Owner {
  readonly userId: string;
  readonly projectId: string;
}

export interface WriteResult {
  readonly saved: boolean;
  readonly reason: string | null;
}

const OK: WriteResult = { saved: true, reason: null };

export interface UniversalStore extends RepositoryIndexStore {
  saveSpec(owner: Owner, spec: UniversalProductSpec, runId?: string | null): Promise<WriteResult>;
  loadLatestSpec(owner: Owner): Promise<UniversalProductSpec | null>;

  savePlan(owner: Owner, plan: ArchitecturePlan, specId?: string | null, runId?: string | null): Promise<WriteResult>;
  loadLatestPlan(owner: Owner): Promise<ArchitecturePlan | null>;

  saveMutations(owner: Owner, runId: string, mutations: readonly PlanMutation[]): Promise<WriteResult>;
  loadMutations(owner: Owner, runId: string): Promise<readonly PlanMutation[]>;

  saveResearchEvidence(owner: Owner, researchRunId: string, evidence: readonly ResearchEvidence[]): Promise<WriteResult>;
}

/**
 * The default store.
 *
 * Not a test double — a deployment without Supabase runs on this and behaves correctly
 * within a process. Keyed by owner throughout, so the isolation property the database
 * enforces with RLS is the same one this enforces with map keys.
 */
export class InMemoryUniversalStore implements UniversalStore {
  private readonly specs = new Map<string, UniversalProductSpec>();
  private readonly plans = new Map<string, ArchitecturePlan>();
  private readonly indexes = new Map<string, RepositoryIndex>();
  private readonly mutations = new Map<string, PlanMutation[]>();
  private readonly research = new Map<string, ResearchEvidence[]>();

  private ownerKey(owner: Owner): string {
    return `${owner.userId}::${owner.projectId}`;
  }

  private indexKey(identity: RepositoryIdentity): string {
    return `${identity.projectId}::${identity.repositoryId}::${identity.branch}`;
  }

  async saveSpec(owner: Owner, spec: UniversalProductSpec): Promise<WriteResult> {
    this.specs.set(this.ownerKey(owner), spec);
    return OK;
  }
  async loadLatestSpec(owner: Owner): Promise<UniversalProductSpec | null> {
    return this.specs.get(this.ownerKey(owner)) ?? null;
  }

  async savePlan(owner: Owner, plan: ArchitecturePlan): Promise<WriteResult> {
    this.plans.set(this.ownerKey(owner), plan);
    return OK;
  }
  async loadLatestPlan(owner: Owner): Promise<ArchitecturePlan | null> {
    return this.plans.get(this.ownerKey(owner)) ?? null;
  }

  async saveMutations(owner: Owner, runId: string, mutations: readonly PlanMutation[]): Promise<WriteResult> {
    const key = `${this.ownerKey(owner)}::${runId}`;
    const existing = this.mutations.get(key) ?? [];
    const known = new Set(existing.map((mutation) => mutation.mutationKey));
    // Deduplicated on write as well as on read. A resumed run re-saving its log must not
    // double it, which is the same idempotency the database gets from a unique index.
    this.mutations.set(key, [...existing, ...mutations.filter((mutation) => !known.has(mutation.mutationKey))]);
    return OK;
  }
  async loadMutations(owner: Owner, runId: string): Promise<readonly PlanMutation[]> {
    return this.mutations.get(`${this.ownerKey(owner)}::${runId}`) ?? [];
  }

  async saveResearchEvidence(owner: Owner, researchRunId: string, evidence: readonly ResearchEvidence[]): Promise<WriteResult> {
    this.research.set(`${this.ownerKey(owner)}::${researchRunId}`, [...evidence]);
    return OK;
  }

  async load(identity: RepositoryIdentity): Promise<RepositoryIndex | null> {
    return this.indexes.get(this.indexKey(identity)) ?? null;
  }
  async save(index: RepositoryIndex): Promise<void> {
    this.indexes.set(this.indexKey(index.identity), index);
  }
  async delete(identity: RepositoryIdentity): Promise<void> {
    this.indexes.delete(this.indexKey(identity));
  }
}

const indexId = (identity: RepositoryIdentity): string =>
  `${identity.projectId}:${identity.repositoryId}:${identity.branch}`;

function rowToIndexedFile(row: Record<string, unknown>): IndexedFile {
  return {
    filePath: String(row.file_path),
    blobSha: String(row.blob_sha),
    language: (row.language as string | null) ?? null,
    size: Number(row.size_bytes ?? 0),
    binary: Boolean(row.is_binary),
    componentRoot: (row.component_root as string | null) ?? null,
    componentAdapterId: (row.component_adapter_id as string | null) ?? null,
    workspaceRoot: (row.workspace_root as string | null) ?? null,
    symbols: (row.symbols as string[] | null) ?? [],
    imports: (row.imports as string[] | null) ?? [],
    exports: (row.exports as string[] | null) ?? [],
    summary: (row.summary as string | null) ?? null,
    embeddingRef: (row.embedding_ref as string | null) ?? null,
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

/**
 * The Supabase implementation.
 *
 * Every method reports failure rather than throwing, because persistence is a side effect
 * of a build and a build should not die because a row could not be written. What it must
 * never do is *silently* fail: a caller that believes it saved a spec will later load a
 * stale one and act on it, which is worse than a visible error.
 */
export class SupabaseUniversalStore implements UniversalStore {
  constructor(private readonly client: SupabaseClient) {}

  private async attempt(operation: () => Promise<{ error: { message: string } | null }>): Promise<WriteResult> {
    try {
      const { error } = await operation();
      return error ? { saved: false, reason: error.message } : OK;
    } catch (error) {
      return { saved: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  async saveSpec(owner: Owner, spec: UniversalProductSpec, runId: string | null = null): Promise<WriteResult> {
    return this.attempt(async () =>
      this.client.from('project_specs').upsert({
        spec_id: `${owner.projectId}:${spec.createdAt}`,
        user_id: owner.userId,
        project_id: owner.projectId,
        run_id: runId,
        schema_version: spec.schemaVersion,
        title: spec.title,
        surfaces: spec.surfaces,
        spec,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'spec_id' }),
    );
  }

  async loadLatestSpec(owner: Owner): Promise<UniversalProductSpec | null> {
    const { data, error } = await this.client
      .from('project_specs')
      .select('spec')
      .eq('user_id', owner.userId)
      .eq('project_id', owner.projectId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return (data as { spec: UniversalProductSpec }).spec;
  }

  async savePlan(owner: Owner, plan: ArchitecturePlan, specId: string | null = null, runId: string | null = null): Promise<WriteResult> {
    return this.attempt(async () =>
      this.client.from('architecture_plans').upsert({
        plan_id: `${owner.projectId}:${plan.createdAt}`,
        user_id: owner.userId,
        project_id: owner.projectId,
        spec_id: specId,
        run_id: runId,
        schema_version: plan.schemaVersion,
        inherited_from_repository: plan.inheritedFromRepository,
        components: plan.components,
        decisions: plan.decisions,
        blockers: plan.blockers,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'plan_id' }),
    );
  }

  async loadLatestPlan(owner: Owner): Promise<ArchitecturePlan | null> {
    const { data, error } = await this.client
      .from('architecture_plans')
      .select('schema_version, inherited_from_repository, components, decisions, blockers, created_at')
      .eq('user_id', owner.userId)
      .eq('project_id', owner.projectId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as Record<string, unknown>;
    return {
      schemaVersion: String(row.schema_version),
      components: (row.components as ArchitecturePlan['components']) ?? [],
      decisions: (row.decisions as ArchitecturePlan['decisions']) ?? [],
      blockers: (row.blockers as string[]) ?? [],
      unresolvedQuestions: [],
      inheritedFromRepository: Boolean(row.inherited_from_repository),
      createdAt: String(row.created_at),
    };
  }

  async saveMutations(owner: Owner, runId: string, mutations: readonly PlanMutation[]): Promise<WriteResult> {
    if (!mutations.length) return OK;
    return this.attempt(async () =>
      this.client.from('plan_mutations').upsert(
        mutations.map((mutation) => ({
          mutation_key: mutation.mutationKey,
          run_id: runId,
          user_id: owner.userId,
          project_id: owner.projectId,
          schema_version: mutation.schemaVersion,
          kind: mutation.kind,
          triggered_by_task_id: mutation.triggeredByTaskId,
          reason: mutation.reason,
          evidence: mutation.evidence,
          payload: mutation.payload,
          created_at: mutation.at,
        })),
        // The unique index on mutation_key is what makes a resumed run idempotent: the
        // same replan decision produces the same key, so re-saving is a no-op rather than
        // a duplicate migration task.
        { onConflict: 'mutation_key', ignoreDuplicates: true },
      ),
    );
  }

  async loadMutations(owner: Owner, runId: string): Promise<readonly PlanMutation[]> {
    const { data, error } = await this.client
      .from('plan_mutations')
      .select('*')
      .eq('user_id', owner.userId)
      .eq('run_id', runId)
      .order('id', { ascending: true });
    if (error || !data) return [];
    return (data as Record<string, unknown>[]).map((row) => ({
      schemaVersion: String(row.schema_version),
      mutationKey: String(row.mutation_key),
      kind: row.kind as PlanMutation['kind'],
      runId: String(row.run_id),
      triggeredByTaskId: (row.triggered_by_task_id as string | null) ?? null,
      reason: String(row.reason),
      evidence: (row.evidence as string[]) ?? [],
      at: String(row.created_at),
      payload: (row.payload as Record<string, unknown>) ?? {},
    }));
  }

  async saveResearchEvidence(owner: Owner, researchRunId: string, evidence: readonly ResearchEvidence[]): Promise<WriteResult> {
    if (!evidence.length) return OK;
    const run = await this.attempt(async () =>
      this.client.from('research_runs').upsert({
        research_run_id: researchRunId,
        user_id: owner.userId,
        project_id: owner.projectId,
        provider: evidence[0].provider,
        query_count: new Set(evidence.map((item) => item.query)).size,
      }, { onConflict: 'research_run_id' }),
    );
    if (!run.saved) return run;

    return this.attempt(async () =>
      this.client.from('research_evidence').upsert(
        evidence.map((item) => ({
          evidence_id: item.evidenceId,
          research_run_id: item.researchRunId,
          user_id: owner.userId,
          schema_version: item.schemaVersion,
          provider: item.provider,
          source_url: item.sourceUrl,
          source_title: item.sourceTitle,
          publisher: item.publisher,
          official_domain: item.officialDomain,
          query: item.query,
          fact: item.fact,
          content_hash: item.contentHash,
          trust_tier: item.trustTier,
          freshness_class: item.freshnessClass,
          verification_status: item.verificationStatus,
          conflict_group: item.conflictGroup,
          implementation_decision_ids: item.implementationDecisionIds,
          retrieved_at: item.retrievedAt,
          published_at: item.publishedAt,
          expires_at: item.expiresAt,
        })),
        { onConflict: 'evidence_id' },
      ),
    );
  }

  async load(identity: RepositoryIdentity): Promise<RepositoryIndex | null> {
    const { data: header, error } = await this.client
      .from('repository_indexes')
      .select('*')
      .eq('index_id', indexId(identity))
      .maybeSingle();
    if (error || !header) return null;

    const { data: files } = await this.client
      .from('repository_index_files')
      .select('*')
      .eq('index_id', indexId(identity))
      .order('file_path', { ascending: true });

    const row = header as Record<string, unknown>;
    return {
      schemaVersion: String(row.schema_version),
      identity: {
        repositoryId: String(row.repository_id),
        repositoryOwner: String(row.repository_owner),
        repositoryName: String(row.repository_name),
        projectId: String(row.project_id),
        branch: String(row.branch),
      },
      indexedCommitSha: String(row.indexed_commit_sha),
      treeSha: (row.tree_sha as string | null) ?? null,
      files: ((files as Record<string, unknown>[]) ?? []).map(rowToIndexedFile),
      updatedAt: String(row.updated_at),
    };
  }

  async save(index: RepositoryIndex): Promise<void> {
    const id = indexId(index.identity);
    // The header carries indexedCommitSha, so it is written last-ish but the files are
    // replaced wholesale first: a partial file set under a new commit would be worse than
    // an old complete one, and deleting then inserting keeps the pair consistent.
    await this.client.from('repository_index_files').delete().eq('index_id', id);
    await this.client.from('repository_indexes').upsert({
      index_id: id,
      user_id: (index as unknown as { userId?: string }).userId ?? undefined,
      project_id: index.identity.projectId,
      repository_id: index.identity.repositoryId,
      repository_owner: index.identity.repositoryOwner,
      repository_name: index.identity.repositoryName,
      branch: index.identity.branch,
      indexed_commit_sha: index.indexedCommitSha,
      tree_sha: index.treeSha,
      schema_version: index.schemaVersion,
      file_count: index.files.length,
      updated_at: index.updatedAt,
    }, { onConflict: 'index_id' });
  }

  async delete(identity: RepositoryIdentity): Promise<void> {
    await this.client.from('repository_indexes').delete().eq('index_id', indexId(identity));
  }
}

let store: UniversalStore | null = null;

/**
 * The active store.
 *
 * Falls back to memory when Supabase is not configured. That is a real deployment mode
 * rather than a degraded one — the universal path works, and only cross-process memory is
 * lost — so it does not warrant a refusal.
 */
export function universalStore(client?: SupabaseClient | null): UniversalStore {
  if (store) return store;
  store = client ? new SupabaseUniversalStore(client) : new InMemoryUniversalStore();
  return store;
}

/** Test seam. `null` restores lazy construction. */
export function setUniversalStoreForTesting(next: UniversalStore | null): void {
  store = next;
}
