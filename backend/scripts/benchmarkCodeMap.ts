/**
 * Phase 2 benchmark: the code map against the retrieval it replaces, on the generated TypeScript monorepo (fixture, ~500 files).
 * Run:  node --import tsx scripts/benchmarkCodeMap.ts [--json]
 *
 * The provider is the in-memory FakeGitHub, so API call counts, bytes and context tokens are exact and repeatable, while timings are
 * CPU only (no network latency). Real GitHub latency would add roughly (API calls x round trip) to the "before" column and to the
 * first build; it is deliberately not invented here.
 *
 * "Before" is the retrieval Xroga had for an existing repository: hydrate the repository (tree plus every text blob), grep the
 * request words over the content, and hand a model the top 8 files whole. It has no memory between requests.
 */
import { FakeGitHub, type FakeFile } from '../src/existingSource/fakeGitHub.testsupport.js';
import { InMemoryCodeIndexStore } from '../src/existingSource/intelligence/codeIndexStore.js';
import { GROUND_TRUTH, monorepoFiles } from '../src/existingSource/intelligence/monorepoFixture.testsupport.js';
import { ExistingSourceIntelligence, IndexCoordinator } from '../src/existingSource/intelligence/service.js';
import { ExistingSourceService } from '../src/existingSource/service.js';
import { InMemorySourceBindingStore } from '../src/existingSource/store.js';
import { isSensitivePath } from '../src/existingSource/sensitivePaths.js';

const USER = '11111111-1111-4111-8111-111111111111';
const STOP = new Set(['the', 'and', 'only', 'its', 'for', 'that', 'with', 'when', 'it', 'should', 'be', 'a', 'an', 'in', 'to', 'of', 'is', 'so', 'by', 'at', 'on', 'from', 'off', 'get', 'users', 'error', 'returns', 'there', 'than', 'this', 'than', 'out', 'one', 'cent', 'apply', 'applies', 'fix', 'change', 'service', 'handler', 'clear', 'early', 'logged', 'missing']);
const tokensOf = (bytes: number) => Math.ceil(bytes / 4);

interface Row { task: string; precision: number; recall: number; contextTokens: number; unrelatedFilesRead: number; unrelatedFilesInContext: number; apiCalls: number; bytes: number }

function setup(files: FakeFile[]) {
  const gh = new FakeGitHub();
  gh.addAccount('tok', '501', 'alice');
  const repo = gh.addRepo({ fullName: 'acme/monorepo', ownerId: '501', files, access: { '501': { pull: true, push: true } } });
  const source = new ExistingSourceService({ store: new InMemorySourceBindingStore(), tokenFor: async () => 'tok', portFor: (t) => gh.port(t), verifyMaxAgeMs: 0 });
  const intel = new ExistingSourceIntelligence({ source, store: new InMemoryCodeIndexStore(), coordinator: new IndexCoordinator() });
  return { gh, repo, source, intel };
}

/** Before: read everything, grep, take the top 8 files whole. */
async function baseline(gh: FakeGitHub, repoId: string, commitSha: string, request: string) {
  const port = gh.port('tok');
  gh.calls.length = 0;
  const treeSha = (await port.getCommitTreeSha(repoId, commitSha))!;
  const tree = (await port.getTree(repoId, treeSha, true))!;
  const contents = new Map<string, string>(); let bytes = 0;
  for (const e of tree.tree) {
    if (e.type !== 'blob' || !/\.(tsx?|jsx?|json|md)$/.test(e.path!) || isSensitivePath(e.path!)) continue;
    const blob = await port.getBlob(repoId, e.sha!);
    if (!blob) continue;
    const text = Buffer.from(blob.content, 'base64').toString('utf8'); bytes += Buffer.byteLength(text); contents.set(e.path!, text);
  }
  const apiCalls = gh.reads();
  const words = [...new Set(request.toLowerCase().match(/[a-z][a-z0-9]{2,}/g) ?? [])].filter((w) => !STOP.has(w));
  const scored = [...contents].map(([path, text]) => {
    const lower = text.toLowerCase(); const pl = path.toLowerCase(); let score = 0;
    for (const w of words) { score += (lower.split(w).length - 1) + 5 * (pl.split(w).length - 1); }
    return { path, score, bytes: Buffer.byteLength(text) };
  }).sort((a, b) => b.score - a.score || (a.path < b.path ? -1 : 1)).slice(0, 8);
  return { picked: scored.map((s) => s.path), apiCalls, bytes, contextBytes: scored.reduce((n, s) => n + s.bytes, 0), files: contents.size };
}

const relevantCount = (truth: { targets: readonly string[]; consumers: readonly string[]; tests: readonly string[] }) => new Set([...truth.targets, ...truth.consumers, ...truth.tests]).size;
const score = (picked: string[], truth: { targets: readonly string[]; consumers: readonly string[]; tests: readonly string[] }) => {
  const targets = new Set(truth.targets);
  const relevant = new Set([...truth.targets, ...truth.consumers, ...truth.tests]);
  const hit = picked.filter((p) => targets.has(p)).length;
  return { precision: picked.length ? hit / picked.length : 0, recall: targets.size ? hit / targets.size : 1, unrelated: picked.filter((p) => !relevant.has(p)).length };
};

async function main() {
  const files = monorepoFiles();
  const t = setup(files);
  const { binding } = await t.source.link(USER, { repositoryId: t.repo });
  const out: Record<string, unknown> = { repositoryFiles: files.length, commit: binding.baseCommitSha.slice(0, 7), tasks: GROUND_TRUTH.length };

  // before: first visit and second request are the same cost (no memory)
  const before: Row[] = [];
  for (const task of GROUND_TRUTH) {
    const r = await baseline(t.gh, t.repo, binding.baseCommitSha, task.request);
    const s = score(r.picked, task);
    before.push({ task: task.id, precision: s.precision, recall: s.recall, contextTokens: tokensOf(r.contextBytes), unrelatedFilesRead: r.files - relevantCount(task), unrelatedFilesInContext: s.unrelated, apiCalls: r.apiCalls, bytes: r.bytes });
  }

  // after: first visit builds the map once
  t.gh.calls.length = 0;
  const t0 = performance.now();
  const first = await t.intel.ensure(USER, binding.id);
  const buildMs = performance.now() - t0;
  const firstApi = t.gh.reads();
  const after: Row[] = [];
  for (const task of GROUND_TRUTH) {
    t.gh.calls.length = 0;
    const loc = await t.intel.locate(USER, binding.id, { instruction: task.request, autoBuild: false });
    const picked = loc.relevance.targets.map((x) => x.path);
    const s = score(picked, task);
    after.push({ task: task.id, precision: s.precision, recall: s.recall, contextTokens: loc.passport.estimatedTokens, unrelatedFilesRead: 0, unrelatedFilesInContext: s.unrelated, apiCalls: t.gh.reads(), bytes: 0 });
  }
  // a model then reads only the files it will change
  const targetBytes = GROUND_TRUTH.map((task) => task.targets.reduce((n, p) => n + Buffer.byteLength(files.find((f) => f.path === p)?.content ?? ''), 0));

  // second request at the same commit
  t.gh.calls.length = 0;
  const again = await t.intel.ensure(USER, binding.id);
  const secondApi = t.gh.reads();

  // a small commit: one file changed
  const changedPath = 'packages/orders/src/pricing/calculateOrderTotal.ts';
  const edited = files.map((f) => (f.path === changedPath ? { ...f, content: `${f.content}\n// rounding note\n` } : f));
  t.gh.commit(t.repo, 'main', edited);
  await t.source.refreshBase(USER, binding.id);
  t.gh.calls.length = 0;
  const t1 = performance.now();
  const inc = await t.intel.ensure(USER, binding.id);
  const incMs = performance.now() - t1;
  const incApi = t.gh.reads();

  const avg = (rows: Row[], k: keyof Row) => rows.reduce((n, r) => n + (r[k] as number), 0) / rows.length;
  out.before = { perRequest: { apiCalls: avg(before, 'apiCalls'), bytes: avg(before, 'bytes'), contextTokens: avg(before, 'contextTokens'), unrelatedFilesRead: avg(before, 'unrelatedFilesRead'), unrelatedFilesInContext: avg(before, 'unrelatedFilesInContext'), targetPrecisionTop8: avg(before, 'precision'), targetRecall: avg(before, 'recall') }, rows: before };
  out.after = {
    firstVisit: { apiCalls: firstApi, bytes: first.metrics.bytesFetched, buildMs: Math.round(buildMs), kind: first.metrics.kind, filesIndexed: first.index.files.length },
    secondRequestSameCommit: { apiCalls: secondApi, kind: again.metrics.kind },
    afterOneFileCommit: { apiCalls: incApi, blobFetches: inc.metrics.blobFetches, buildMs: Math.round(incMs), kind: inc.metrics.kind, reusedRows: inc.metrics.reusedRows, analyzedRows: inc.metrics.analyzedRows },
    perRequest: { apiCalls: avg(after, 'apiCalls'), contextTokens: avg(after, 'contextTokens'), unrelatedFilesRead: 0, unrelatedFilesInContext: avg(after, 'unrelatedFilesInContext'), contextTokensWithTargetBodies: Math.round(avg(after, 'contextTokens') + tokensOf(targetBytes.reduce((a, b) => a + b, 0) / targetBytes.length)), targetPrecision: avg(after, 'precision'), targetRecall: avg(after, 'recall'), targetFileBytesToRead: targetBytes.reduce((a, b) => a + b, 0) / targetBytes.length },
    rows: after,
  };
  if (process.argv.includes('--json')) { console.log(JSON.stringify(out, null, 2)); return; }
  console.log(JSON.stringify(out, null, 2));
}

void main();
