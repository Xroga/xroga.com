/**
 * The code-map service: build it, refresh it, search it, locate the code a request is about, and hand a model a compact passport.
 *
 * Correctness rules, enforced here:
 *  - The binding is verified on every call, so a lost connection, transfer or changed account stops the map being served exactly as it
 *    stops file reads.
 *  - A map is served only for the binding's CURRENT base commit with a fingerprint that still matches its rows. A map for another
 *    commit is `stale`: it is never returned, only used as a source of reusable rows for the next build.
 *  - Working-tree edits are applied as an overlay, so a symbol an edit removed or renamed cannot come back from an old row.
 *  - A partial map says so (and why), and a missing result from a partial map is never presented as proof of absence.
 */
import { LIMITS } from '../../ai/repositoryTools.js';
import type { ExistingSourceService } from '../service.js';
import { ExistingSourceError, type SourceBinding } from '../types.js';
import { applyOverlay, buildCodeIndex, isCurrentFor, type BuildLimits, type CodeIndexView, type OverlayFile } from './codeIndex.js';
import type { CodeIndexStore } from './codeIndexStore.js';
import { buildGraph, affectedBy, type CodeGraph } from './graph.js';
import { buildPassport, locateRelevant, type Passport, type Relevance } from './relevance.js';
import type { BuildMetrics, CodeIndex, IndexedCodeFile, SymbolInfo } from './types.js';

/** Process-wide coordination of builds: shared by every request so concurrent requests share one build and an owner's load is bounded. */
export class IndexCoordinator {
  readonly inflight = new Map<string, Promise<EnsureResult>>();
  readonly running = new Map<string, number>();
  readonly graphs = new Map<string, CodeGraph>();
}
const defaultCoordinator = new IndexCoordinator();

export interface IntelligenceDeps {
  readonly coordinator?: IndexCoordinator;
  readonly source: ExistingSourceService;
  readonly store: CodeIndexStore;
  readonly limits?: Partial<BuildLimits>;
  /** Builds one owner may run at once. More are refused, not queued: a build is bounded provider spend. */
  readonly maxBuildsPerOwner?: number;
  readonly clock?: () => number;
}

export type MapStatus = 'not_indexed' | 'valid' | 'partial' | 'stale' | 'unavailable';

export interface IndexStatusView {
  readonly bindingId: string;
  readonly status: MapStatus;
  readonly baseCommitSha: string;
  readonly indexedCommitSha: string | null;
  /** Whether the branch has moved past the base commit (the map still describes the base). Null when unknown. */
  readonly behindHead: boolean | null;
  readonly filesIndexed: number | null;
  readonly coverage: CodeIndex['coverage'] | null;
  readonly contentFingerprint: string | null;
  readonly builtAt: string | null;
  readonly reason: string;
}

export interface EnsureResult {
  readonly index: CodeIndex;
  readonly metrics: BuildMetrics;
  readonly persisted: boolean;
}

export interface SearchHit {
  readonly path: string;
  readonly name: string | null;
  readonly kind: SymbolInfo['kind'] | 'file';
  readonly line: number | null;
  readonly signature: string | null;
  readonly exported: boolean | null;
  readonly score: number;
}

const GRAPH_CACHE_MAX = 6;
const safe = (path: string): string => {
  if (typeof path !== 'string' || !path || path.includes('\0') || path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path) || path.replace(/\\/g, '/').split('/').some((s) => s === '..' || s === '' || s === '.git')) {
    throw new ExistingSourceError('INVALID_REQUEST', 'That is not a valid repository path.');
  }
  return path.replace(/\\/g, '/');
};

export class ExistingSourceIntelligence {
  private readonly inflight: Map<string, Promise<EnsureResult>>;
  private readonly running: Map<string, number>;
  private readonly graphs: Map<string, CodeGraph>;

  constructor(private readonly deps: IntelligenceDeps) {
    const c = deps.coordinator ?? defaultCoordinator;
    this.inflight = c.inflight; this.running = c.running; this.graphs = c.graphs;
  }

  async status(userId: string, bindingId: string): Promise<IndexStatusView> {
    const verified = await this.deps.source.verify(userId, bindingId);
    const binding = verified.binding;
    if (binding.state !== 'linked') {
      return { bindingId, status: 'unavailable', baseCommitSha: binding.baseCommitSha, indexedCommitSha: null, behindHead: null, filesIndexed: null, coverage: null, contentFingerprint: null, builtAt: null, reason: binding.stateReason || 'This link is not active.' };
    }
    const behindHead = verified.head ? verified.head.moved : null;
    const stored = await this.deps.store.load(userId, bindingId, binding.baseCommitSha);
    if (stored && isCurrentFor(stored, binding.baseCommitSha)) {
      return {
        bindingId, status: stored.status === 'valid' ? 'valid' : 'partial', baseCommitSha: binding.baseCommitSha, indexedCommitSha: stored.commitSha, behindHead,
        filesIndexed: stored.files.length, coverage: stored.coverage, contentFingerprint: stored.contentFingerprint, builtAt: stored.builtAt,
        reason: stored.status === 'valid' ? `The code map matches the linked commit ${binding.baseCommitSha.slice(0, 7)}.` : `The code map is partial: ${stored.coverage.partialReason ?? 'some files were not indexed'}.`,
      };
    }
    const prior = await this.deps.store.latest(userId, bindingId);
    if (prior && prior.commitSha !== binding.baseCommitSha) {
      return { bindingId, status: 'stale', baseCommitSha: binding.baseCommitSha, indexedCommitSha: prior.commitSha, behindHead, filesIndexed: null, coverage: null, contentFingerprint: null, builtAt: prior.builtAt, reason: `The stored code map was built at ${prior.commitSha.slice(0, 7)}, not the linked commit ${binding.baseCommitSha.slice(0, 7)}. It will not be used; refreshing reuses its unchanged files.` };
    }
    return { bindingId, status: 'not_indexed', baseCommitSha: binding.baseCommitSha, indexedCommitSha: null, behindHead, filesIndexed: null, coverage: null, contentFingerprint: null, builtAt: null, reason: 'No code map has been built for this commit yet.' };
  }

  /** The map for the current base commit: reused as is when it is current, otherwise built (incrementally when an older map exists). */
  async ensure(userId: string, bindingId: string, options: { force?: boolean } = {}): Promise<EnsureResult> {
    const { binding } = await this.deps.source.activeBinding(userId, bindingId);
    if (!options.force) {
      const stored = await this.deps.store.load(userId, bindingId, binding.baseCommitSha);
      if (stored && isCurrentFor(stored, binding.baseCommitSha)) {
        return { index: stored, persisted: true, metrics: { kind: 'reused', blobFetches: 0, bytesFetched: 0, reusedRows: stored.files.length, analyzedRows: 0, durationMs: 0 } };
      }
    }
    const key = `${userId}:${bindingId}:${binding.baseCommitSha}`;
    const existing = this.inflight.get(key);
    if (existing) return existing; // concurrent requests for the same map share one build
    const max = this.deps.maxBuildsPerOwner ?? 2;
    if ((this.running.get(userId) ?? 0) >= max) throw new ExistingSourceError('INDEX_BUSY', 'Other code maps are still being built for your account. Try again shortly.');
    this.running.set(userId, (this.running.get(userId) ?? 0) + 1);
    const job = this.build(userId, binding).finally(() => {
      this.inflight.delete(key);
      this.running.set(userId, Math.max(0, (this.running.get(userId) ?? 1) - 1));
    });
    this.inflight.set(key, job);
    return job;
  }

  private async build(userId: string, binding: SourceBinding): Promise<EnsureResult> {
    const prior = await this.deps.store.latest(userId, binding.id);
    await this.deps.source.setIndexStatus(userId, binding.id, 'indexing');
    try {
      const open = await this.deps.source.openForIndex(userId, binding.id);
      const { index, metrics } = await buildCodeIndex({
        commitSha: open.binding.baseCommitSha, treeSha: open.treeSha, tree: open.tree, blobs: open.blobs, prior, limits: this.deps.limits, clock: this.deps.clock,
      });
      const persisted = await this.deps.store.save(userId, binding.id, index);
      await this.deps.source.setIndexStatus(userId, binding.id, index.status === 'valid' ? 'valid' : 'partial');
      return { index, metrics, persisted };
    } catch (error) {
      await this.deps.source.setIndexStatus(userId, binding.id, 'failed').catch(() => undefined);
      throw error;
    }
  }

  private graphFor(view: CodeIndexView): CodeGraph {
    const key = `${view.base.commitSha}:${view.base.contentFingerprint}:${view.overlayFingerprint}`;
    const hit = this.graphs.get(key);
    if (hit) { this.graphs.delete(key); this.graphs.set(key, hit); return hit; }
    const graph = buildGraph(view.files, view.packages);
    this.graphs.set(key, graph);
    while (this.graphs.size > GRAPH_CACHE_MAX) this.graphs.delete(this.graphs.keys().next().value as string);
    return graph;
  }

  private async view(userId: string, bindingId: string, options: { autoBuild: boolean; overlay?: readonly OverlayFile[] }) {
    const verified = await this.deps.source.activeBinding(userId, bindingId);
    const binding = verified.binding;
    let built: EnsureResult | null = null;
    let index = await this.deps.store.load(userId, bindingId, binding.baseCommitSha);
    if (!index || !isCurrentFor(index, binding.baseCommitSha)) {
      if (!options.autoBuild) throw new ExistingSourceError('INDEX_UNAVAILABLE', 'There is no current code map for the linked commit. Build it first.');
      built = await this.ensure(userId, bindingId);
      index = built.index;
    }
    const view = applyOverlay(index, options.overlay ?? []);
    return { binding, index, view, graph: this.graphFor(view), built, behindHead: verified.head ? verified.head.moved : null };
  }

  /** Symbol and file search over the current map (working-tree edits applied when given). */
  async search(userId: string, bindingId: string, input: { query: string; kind?: 'symbol' | 'file' | 'any'; limit?: number; overlay?: readonly OverlayFile[] }) {
    const q = String(input.query ?? '').trim();
    if (q.length < 2 || q.length > 120) throw new ExistingSourceError('INVALID_REQUEST', 'Search for between 2 and 120 characters.');
    const { binding, index, view } = await this.view(userId, bindingId, { autoBuild: false, overlay: input.overlay });
    const limit = Math.max(1, Math.min(50, Math.floor(input.limit ?? 20)));
    const ql = q.toLowerCase(); const kind = input.kind ?? 'any';
    const hits: SearchHit[] = [];
    for (const f of view.files) {
      if (kind !== 'file') for (const s of f.analysis.symbols) {
        if (s.kind === 'module') continue;
        const nl = s.name.toLowerCase();
        const score = nl === ql ? 100 : nl.startsWith(ql) ? 70 : nl.includes(ql) ? 45 : 0;
        if (score) hits.push({ path: f.path, name: s.name, kind: s.kind, line: s.line || null, signature: s.signature ?? null, exported: s.exported, score: score + (s.exported ? 3 : 0) });
      }
      if (kind !== 'symbol') {
        const pl = f.path.toLowerCase(); const base = pl.slice(pl.lastIndexOf('/') + 1);
        const score = base === ql ? 90 : base.startsWith(ql) ? 60 : pl.includes(ql) ? 30 : 0;
        if (score) hits.push({ path: f.path, name: null, kind: 'file', line: null, signature: null, exported: null, score });
      }
    }
    hits.sort((a, b) => b.score - a.score || (a.path < b.path ? -1 : 1) || (a.line ?? 0) - (b.line ?? 0));
    return {
      commitSha: binding.baseCommitSha, overlayFingerprint: view.overlayFingerprint, results: hits.slice(0, limit), totalMatches: hits.length,
      // a partial map cannot prove absence
      complete: index.status === 'valid', coverageNote: index.status === 'valid' ? null : `The code map is partial (${index.coverage.partialReason ?? 'some files were not indexed'}); a missing result is not proof the code is absent.`,
    };
  }

  /** The code a plain-language request is about, with the reasons, the tests that cover it and a compact passport for a model. */
  async locate(userId: string, bindingId: string, input: { instruction: string; overlay?: readonly OverlayFile[]; budgetTokens?: number; autoBuild?: boolean }): Promise<{
    commitSha: string; overlayFingerprint: string; relevance: Relevance; passport: Passport; status: IndexStatusView['status']; built: BuildMetrics | null; behindHead: boolean | null;
  }> {
    const instruction = String(input.instruction ?? '').trim();
    if (instruction.length < 3 || instruction.length > 8_000) throw new ExistingSourceError('INVALID_REQUEST', 'Describe what you want changed in between 3 and 8000 characters.');
    const { binding, index, view, graph, built, behindHead } = await this.view(userId, bindingId, { autoBuild: input.autoBuild ?? true, overlay: input.overlay });
    const relevance = locateRelevant(view, instruction, {}, graph);
    const passport = buildPassport({
      repository: binding.repositoryFullName, branch: binding.baseBranch, commitSha: binding.baseCommitSha, ...(view.overlayFingerprint ? { overlayFingerprint: view.overlayFingerprint } : {}),
      status: index.status, coverageNote: index.status === 'valid' ? undefined : `partial (${index.coverage.partialReason ?? 'some files not indexed'}); ${index.coverage.filesIndexed} of ${index.coverage.filesKnown} files`,
      request: instruction, relevance, files: new Map(view.files.map((f) => [f.path, f] as [string, IndexedCodeFile])), packages: view.packages, budgetTokens: input.budgetTokens,
    });
    return { commitSha: binding.baseCommitSha, overlayFingerprint: view.overlayFingerprint, relevance, passport, status: index.status === 'valid' ? 'valid' : 'partial', built: built?.metrics ?? null, behindHead };
  }

  /** Imports, importers, tests and the transitively affected files for one path. */
  async neighborhood(userId: string, bindingId: string, input: { path: string; overlay?: readonly OverlayFile[] }) {
    const path = safe(input.path);
    const { binding, view, graph } = await this.view(userId, bindingId, { autoBuild: false, overlay: input.overlay });
    const file = view.files.find((f) => f.path === path);
    if (!file) throw new ExistingSourceError('SOURCE_UNREADABLE', 'That file is not in the code map for the linked commit.');
    const edges = graph.edges.get(path) ?? [];
    return {
      commitSha: binding.baseCommitSha, path, language: file.analysis.language, parse: file.analysis.parse, malformed: file.analysis.malformed, isTest: file.analysis.isTest,
      symbols: file.analysis.symbols.slice(0, 100), dependsOn: graph.dependsOn.get(path) ?? [], dependedOnBy: graph.dependedOnBy.get(path) ?? [],
      external: edges.filter((e) => e.external).map((e) => e.specifier).slice(0, 50), unresolved: edges.filter((e) => !e.external && !e.to).map((e) => e.specifier).slice(0, 50),
      tests: graph.testsFor.get(path) ?? [], testTargets: graph.testTargets.get(path) ?? [], affected: affectedBy(graph, [path], LIMITS.maxMatches),
    };
  }

  /** Drops every derived map for a binding (unlink, lost connection). */
  async purge(userId: string, bindingId: string): Promise<void> {
    await this.deps.store.deleteForBinding(userId, bindingId);
    for (const k of [...this.inflight.keys()]) if (k.startsWith(`${userId}:${bindingId}:`)) this.inflight.delete(k);
  }
}
