import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';

import { FakeGitHub, type FakeFile } from '../fakeGitHub.testsupport.js';
import { ExistingSourceService } from '../service.js';
import { InMemorySourceBindingStore } from '../store.js';
import { ExistingSourceError } from '../types.js';
import { InMemoryCodeIndexStore } from './codeIndexStore.js';
import { ExistingSourceIntelligence, IndexCoordinator } from './service.js';
import { GROUND_TRUTH, monorepoFiles } from './monorepoFixture.testsupport.js';
import { PARSER_VERSION } from './types.js';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const blobPrefix = (content: string) => createHash('sha1').update(`blob:${content}`).digest('hex').slice(0, 7);
const refused = (code: string) => (e: unknown) => e instanceof ExistingSourceError && e.code === code;

function setup(files: FakeFile[], options: { recursiveLimit?: number; limits?: { maxBlobFetches?: number }; maxBuildsPerOwner?: number } = {}) {
  const gh = new FakeGitHub();
  gh.addAccount('tok-alice', '501', 'alice'); gh.addAccount('tok-bob', '502', 'bob');
  const repo = gh.addRepo({ fullName: 'acme/monorepo', ownerId: '501', files, access: { '501': { pull: true, push: true } } });
  if (options.recursiveLimit) gh.recursiveLimit = options.recursiveLimit;
  const bindings = new InMemorySourceBindingStore();
  const indexes = new InMemoryCodeIndexStore();
  let now = Date.parse('2026-10-27T12:00:00Z');
  const tokens = new Map<string, string | null>([[ALICE, 'tok-alice'], [BOB, 'tok-bob']]);
  const holder: { intel?: ExistingSourceIntelligence } = {};
  const source = new ExistingSourceService({
    store: bindings, tokenFor: async (u) => tokens.get(u) ?? null, portFor: (t) => gh.port(t), now: () => now, verifyMaxAgeMs: 0,
    onBindingClosed: async (u, id) => { await holder.intel?.purge(u, id); },
  });
  const intel = new ExistingSourceIntelligence({ source, store: indexes, coordinator: new IndexCoordinator(), limits: options.limits, maxBuildsPerOwner: options.maxBuildsPerOwner });
  holder.intel = intel;
  return { gh, repo, source, intel, indexes, bindings, tokens, advance: (ms: number) => { now += ms; } };
}

describe('the code map on a realistic monorepo', () => {
  const files = monorepoFiles();

  it('builds a complete map, never fetches credential, vendored, generated, lock or binary files, and says what it skipped', async () => {
    const t = setup(files);
    assert.ok(files.length >= 500, `fixture has ${files.length} files`);
    const { binding } = await t.source.link(ALICE, { repositoryId: t.repo });
    t.gh.calls.length = 0;
    const { index, metrics } = await t.intel.ensure(ALICE, binding.id);
    assert.equal(index.status, 'valid');
    assert.equal(index.commitSha, binding.baseCommitSha);
    assert.equal(metrics.kind, 'cold');
    assert.equal(metrics.blobFetches, index.files.length, 'one blob per indexed file and no more');
    const fetched = t.gh.calls.filter((c) => c.startsWith('blob:')).map((c) => c.split(':')[2]);
    for (const secret of ['DATABASE_URL=postgres://user:secret@db/acme\n']) assert.ok(!fetched.includes(blobPrefix(secret)), 'the .env blob was never requested');
    const paths = new Set(index.files.map((f) => f.path));
    for (const gone of ['.env', 'package-lock.json', 'node_modules/left-pad/index.js', 'packages/billing/dist/index.js', 'apps/admin-web/public/logo.png', 'libs/shared/src/generated/schema.min.js']) assert.ok(!paths.has(gone), gone);
    assert.ok(paths.has('packages/billing/src/notifications/validateInvoiceNotification.ts'));
    const x = index.coverage.excluded;
    assert.deepEqual([x.sensitive, x.lockfile, x.vendored, x.generated, x.binary], [1, 1, 1, 2, 1]);
    assert.equal(index.coverage.treeComplete, true);
    assert.ok(index.packages.some((p) => p.name === '@acme/billing' && p.testCommand === 'jest'));
  });

  it('reuses the map for the same commit with no source reads at all', async () => {
    const t = setup(files);
    const { binding } = await t.source.link(ALICE, { repositoryId: t.repo });
    await t.intel.ensure(ALICE, binding.id);
    t.gh.calls.length = 0;
    const again = await t.intel.ensure(ALICE, binding.id);
    assert.equal(again.metrics.kind, 'reused');
    assert.equal(again.metrics.blobFetches, 0);
    assert.equal(t.gh.count('blob:') + t.gh.count('tree:') + t.gh.count('commit:'), 0, 'no tree, commit or blob request');
    const status = await t.intel.status(ALICE, binding.id);
    assert.equal(status.status, 'valid');
  });

  for (const task of GROUND_TRUTH) {
    it(`locates the right code for: ${task.id}`, async () => {
      const t = setup(files);
      const { binding } = await t.source.link(ALICE, { repositoryId: t.repo });
      const found = await t.intel.locate(ALICE, binding.id, { instruction: task.request });
      const targets = found.relevance.targets.map((x) => x.path);
      for (const expected of task.targets) assert.ok(targets.includes(expected), `target ${expected} in ${targets.join(', ')}`);
      assert.ok(task.targets.includes(targets[0]!), `the top target is a correct one, got ${targets[0]}`);
      assert.ok(targets.length <= task.targets.length + 1, `few unrelated targets: ${targets.join(', ')}`);
      const consumers = found.relevance.consumers.map((x) => x.path);
      for (const c of task.consumers) assert.ok(consumers.includes(c), `consumer ${c} in ${consumers.join(', ')}`);
      const tests = found.relevance.tests.map((x) => x.path);
      for (const tst of task.tests) assert.ok(tests.includes(tst), `test ${tst} in ${tests.join(', ')}`);
      assert.notEqual(found.relevance.confidence, 'low');
      assert.ok(found.passport.estimatedTokens <= 3_500, `passport is compact: ${found.passport.estimatedTokens} tokens`);
      assert.match(found.passport.text, new RegExp(binding.baseCommitSha.slice(0, 12)));
    });
  }

  it('follows a re-exporting barrel: the cross-package consumer is found, and the barrel is reported apart', async () => {
    const t = setup(files);
    const { binding } = await t.source.link(ALICE, { repositoryId: t.repo });
    const found = await t.intel.locate(ALICE, binding.id, { instruction: GROUND_TRUTH[0]!.request });
    const reminder = found.relevance.consumers.find((c) => c.path === 'packages/invoicing/src/reminders/reminderJob.ts');
    assert.ok(reminder, 'reminderJob imports validateInvoiceNotification through @acme/billing');
    assert.match(reminder!.reasons[0]!, /through packages\/billing\/src\/index\.ts/);
    assert.ok(found.relevance.reexporters.some((r) => r.path === 'packages/billing/src/index.ts'));
    assert.ok(!found.relevance.consumers.some((c) => c.path === 'packages/billing/src/index.ts'));
    // an importer of the barrel that uses only OTHER names is not a consumer of the target
    assert.ok(!found.relevance.consumers.some((c) => c.path.startsWith('packages/orders/')));
  });

  it('explains the neighbourhood of a file: imports, importers, tests and the transitively affected', async () => {
    const t = setup(files);
    const { binding } = await t.source.link(ALICE, { repositoryId: t.repo });
    await t.intel.ensure(ALICE, binding.id);
    const n = await t.intel.neighborhood(ALICE, binding.id, { path: 'packages/billing/src/notifications/validateInvoiceNotification.ts' });
    assert.ok(n.dependedOnBy.includes('packages/billing/src/notifications/sendInvoiceNotification.ts'));
    assert.ok(n.dependedOnBy.includes('packages/billing/src/index.ts'));
    assert.ok(n.tests.includes('packages/billing/src/notifications/validateInvoiceNotification.test.ts'));
    assert.ok(n.affected.includes('packages/invoicing/src/reminders/reminderJob.ts'), 'transitively affected through the barrel');
    await assert.rejects(t.intel.neighborhood(ALICE, binding.id, { path: '../etc/passwd' }), refused('INVALID_REQUEST'));
    await assert.rejects(t.intel.neighborhood(ALICE, binding.id, { path: 'nope.ts' }), refused('SOURCE_UNREADABLE'));
  });

  it('searches symbols and files, and reports that a partial map cannot prove absence', async () => {
    const t = setup(files);
    const { binding } = await t.source.link(ALICE, { repositoryId: t.repo });
    await t.intel.ensure(ALICE, binding.id);
    const sym = await t.intel.search(ALICE, binding.id, { query: 'validateInvoiceNotification', kind: 'symbol' });
    assert.equal(sym.results[0]!.path, 'packages/billing/src/notifications/validateInvoiceNotification.ts');
    assert.equal(sym.results[0]!.kind, 'function');
    assert.match(sym.results[0]!.signature!, /notification: InvoiceNotification/);
    assert.equal(sym.complete, true);
    const file = await t.intel.search(ALICE, binding.id, { query: 'reminderJob.ts', kind: 'file' });
    assert.equal(file.results[0]!.path, 'packages/invoicing/src/reminders/reminderJob.ts');
    await assert.rejects(t.intel.search(ALICE, binding.id, { query: 'a' }), refused('INVALID_REQUEST'));
  });
});

describe('incremental refresh', () => {
  const base = monorepoFiles();

  it('after a small commit only the changed files are fetched, and the result equals a cold build at that commit', async () => {
    const t = setup(base);
    const { binding } = await t.source.link(ALICE, { repositoryId: t.repo });
    const first = await t.intel.ensure(ALICE, binding.id);
    const changed = base.map((f) => (f.path === 'packages/orders/src/pricing/calculateOrderTotal.ts' ? { ...f, content: f.content + '\nexport const ROUNDING_MODE = "half-up";\n' } : f))
      .concat([{ path: 'packages/orders/src/pricing/discountCap.ts', content: 'export function capDiscount(p: number): number { return Math.min(p, 50); }\n' }]);
    t.gh.commit(t.repo, 'main', changed);
    await t.source.refreshBase(ALICE, binding.id);
    t.gh.calls.length = 0;
    const second = await t.intel.ensure(ALICE, binding.id);
    assert.equal(second.metrics.kind, 'incremental');
    assert.equal(second.metrics.blobFetches, 2, 'one changed file and one new file');
    assert.equal(second.metrics.reusedRows, first.index.files.length - 1);
    assert.ok(second.index.files.some((f) => f.path === 'packages/orders/src/pricing/discountCap.ts'));
    assert.ok(second.index.files.find((f) => f.path === 'packages/orders/src/pricing/calculateOrderTotal.ts')!.analysis.symbols.some((s) => s.name === 'ROUNDING_MODE'));

    // the incremental map is exactly what a cold build of the same commit produces
    const cold = setup(changed);
    const { binding: coldBinding } = await cold.source.link(ALICE, { repositoryId: cold.repo });
    const coldIndex = (await cold.intel.ensure(ALICE, coldBinding.id)).index;
    assert.equal(second.index.contentFingerprint, coldIndex.contentFingerprint);
    assert.deepEqual(second.index.files.map((f) => [f.path, f.analysis.symbols.map((s) => s.name)]), coldIndex.files.map((f) => [f.path, f.analysis.symbols.map((s) => s.name)]));
  });

  it('a renamed file costs no source read, keeps its analysis, and updates the import graph', async () => {
    const t = setup(base);
    const { binding } = await t.source.link(ALICE, { repositoryId: t.repo });
    await t.intel.ensure(ALICE, binding.id);
    const from = 'packages/shipping/src/label/createShipmentLabel.ts'; const to = 'packages/shipping/src/labels/createShipmentLabel.ts';
    const moved = base.map((f) => (f.path === from ? { ...f, path: to } : f))
      .map((f) => (f.path === 'packages/shipping/src/index.ts' ? { ...f, content: "export { createShipmentLabel } from './labels/createShipmentLabel';\n" } : f));
    t.gh.commit(t.repo, 'main', moved);
    await t.source.refreshBase(ALICE, binding.id);
    t.gh.calls.length = 0;
    const r = await t.intel.ensure(ALICE, binding.id);
    assert.equal(r.metrics.blobFetches, 1, 'only the edited barrel is read; the moved file is reused by its blob');
    assert.ok(r.index.files.some((f) => f.path === to) && !r.index.files.some((f) => f.path === from));
    const n = await t.intel.neighborhood(ALICE, binding.id, { path: to });
    assert.ok(n.dependedOnBy.includes('packages/shipping/src/index.ts'));
  });

  it('a force-pushed, unrelated history is handled the same way: reuse by content, not by ancestry', async () => {
    const t = setup(base);
    const { binding } = await t.source.link(ALICE, { repositoryId: t.repo });
    const first = await t.intel.ensure(ALICE, binding.id);
    // a rewritten branch: same files except one removed and one new, committed as a fresh unrelated commit
    const rewritten = base.filter((f) => f.path !== 'packages/support/src/ticket/ticket.routes.ts').concat([{ path: 'packages/support/src/ticket/ticketHistory.ts', content: 'export const history: string[] = [];\n' }]);
    t.gh.commit(t.repo, 'main', rewritten);
    await t.source.refreshBase(ALICE, binding.id);
    const r = await t.intel.ensure(ALICE, binding.id);
    assert.equal(r.metrics.blobFetches, 1);
    assert.equal(r.index.files.length, first.index.files.length);
    assert.ok(!r.index.files.some((f) => f.path.endsWith('ticket.routes.ts')));
  });

  it('never serves a map for another commit: it is stale until refreshed, and refreshing reuses its rows', async () => {
    const t = setup(base);
    const { binding } = await t.source.link(ALICE, { repositoryId: t.repo });
    await t.intel.ensure(ALICE, binding.id);
    t.gh.commit(t.repo, 'main', base.concat([{ path: 'extra.ts', content: 'export const extra = 1;\n' }]));
    await t.source.refreshBase(ALICE, binding.id);
    const status = await t.intel.status(ALICE, binding.id);
    assert.equal(status.status, 'stale');
    assert.notEqual(status.indexedCommitSha, status.baseCommitSha);
    await assert.rejects(t.intel.search(ALICE, binding.id, { query: 'validateInvoiceNotification' }), refused('INDEX_UNAVAILABLE'));
    await assert.rejects(t.intel.locate(ALICE, binding.id, { instruction: 'change the invoice notification validation', autoBuild: false }), refused('INDEX_UNAVAILABLE'));
    const rebuilt = await t.intel.locate(ALICE, binding.id, { instruction: 'change the invoice notification validation' });
    assert.equal(rebuilt.built?.kind, 'incremental');
    assert.equal(rebuilt.built?.blobFetches, 1);
    assert.equal((await t.intel.status(ALICE, binding.id)).status, 'valid');
  });

  it('rows built by another parser version are never reused', async () => {
    const t = setup(base);
    const { binding } = await t.source.link(ALICE, { repositoryId: t.repo });
    const first = await t.intel.ensure(ALICE, binding.id);
    await t.indexes.save(ALICE, binding.id, { ...first.index, parserVersion: `${PARSER_VERSION}-old`, commitSha: 'a'.repeat(40) });
    await t.indexes.deleteForBinding(ALICE, binding.id);
    await t.indexes.save(ALICE, binding.id, { ...first.index, parserVersion: 'something-else', commitSha: 'b'.repeat(40) });
    const rebuilt = await t.intel.ensure(ALICE, binding.id, { force: true });
    assert.equal(rebuilt.metrics.blobFetches, first.index.files.length, 'a full refetch, because the prior rows came from different extraction');
  });
});

describe('working-tree edits', () => {
  const files = monorepoFiles();

  it('an uncommitted rename or deletion cannot come back from the committed rows', async () => {
    const t = setup(files);
    const { binding } = await t.source.link(ALICE, { repositoryId: t.repo });
    await t.intel.ensure(ALICE, binding.id);
    const path = 'packages/orders/src/pricing/calculateOrderTotal.ts';
    const edited = files.find((f) => f.path === path)!.content.replace(/calculateOrderTotal/g, 'computeOrderTotal');
    const committed = await t.intel.search(ALICE, binding.id, { query: 'calculateOrderTotal', kind: 'symbol' });
    assert.ok(committed.results.some((r) => r.path === path));
    const dirty = await t.intel.search(ALICE, binding.id, { query: 'calculateOrderTotal', kind: 'symbol', overlay: [{ path, content: edited }] });
    assert.ok(!dirty.results.some((r) => r.path === path), 'the removed symbol is not returned from the old row');
    assert.ok(dirty.overlayFingerprint.length === 64);
    const renamed = await t.intel.search(ALICE, binding.id, { query: 'computeOrderTotal', kind: 'symbol', overlay: [{ path, content: edited }] });
    assert.equal(renamed.results[0]!.path, path);
    const deleted = await t.intel.search(ALICE, binding.id, { query: 'calculateOrderTotal', kind: 'file', overlay: [{ path, content: null }] });
    assert.ok(!deleted.results.some((r) => r.path === path));
    const located = await t.intel.locate(ALICE, binding.id, { instruction: 'fix `computeOrderTotal` rounding', overlay: [{ path, content: edited }] });
    assert.equal(located.relevance.targets[0]!.path, path);
    assert.notEqual(located.overlayFingerprint, '');
  });

  it('with no overlay the view equals the committed map, and the overlay fingerprint changes with the edit', async () => {
    const t = setup(files);
    const { binding } = await t.source.link(ALICE, { repositoryId: t.repo });
    await t.intel.ensure(ALICE, binding.id);
    const a = await t.intel.search(ALICE, binding.id, { query: 'roundMoney' });
    assert.equal(a.overlayFingerprint, '');
    const p = 'libs/shared/src/moneyMath/roundMoney.ts';
    const x = await t.intel.search(ALICE, binding.id, { query: 'roundMoney', overlay: [{ path: p, content: 'export function roundMoney(v: number): number { return v; }\n' }] });
    const y = await t.intel.search(ALICE, binding.id, { query: 'roundMoney', overlay: [{ path: p, content: 'export function roundMoney(v: number, mode: string): number { return v; }\n' }] });
    assert.notEqual(x.overlayFingerprint, y.overlayFingerprint);
    assert.match(y.results.find((r) => r.path === p)!.signature!, /mode: string/);
  });
});

describe('limits, failures and isolation', () => {
  const files = monorepoFiles();

  it('a fetch budget gives a partial map that says so, keeps manifests first and does not claim absence', async () => {
    const t = setup(files, { limits: { maxBlobFetches: 60 } });
    const { binding } = await t.source.link(ALICE, { repositoryId: t.repo });
    const { index } = await t.intel.ensure(ALICE, binding.id);
    assert.equal(index.status, 'partial');
    assert.match(index.coverage.partialReason!, /fetch_budget/);
    assert.ok(index.coverage.filesIndexed <= 60);
    assert.ok(index.coverage.excluded.budget! > 0);
    assert.ok(index.packages.some((p) => p.name === '@acme/billing'), 'manifests were read first');
    const s = await t.intel.search(ALICE, binding.id, { query: 'validateInvoiceNotification' });
    assert.equal(s.complete, false);
    assert.match(s.coverageNote!, /not proof the code is absent/);
    assert.equal((await t.intel.status(ALICE, binding.id)).status, 'partial');
    assert.equal((await t.bindings.get(ALICE, binding.id))!.indexStatus, 'partial');
  });

  it('an incomplete repository listing produces a partial map, never a silent one', async () => {
    const t = setup(files, { recursiveLimit: 50 });
    t.gh.directoryLimit = 5;
    const { binding } = await t.source.link(ALICE, { repositoryId: t.repo });
    const { index } = await t.intel.ensure(ALICE, binding.id);
    assert.equal(index.coverage.treeComplete, false);
    assert.equal(index.status, 'partial');
    assert.match(index.coverage.partialReason!, /tree_directory_truncated/);
  });

  it('a provider outage during the build keeps what was read and reports partial instead of failing the request', async () => {
    const t = setup(files);
    const { binding } = await t.source.link(ALICE, { repositoryId: t.repo });
    let n = 0;
    const real = t.gh.port('tok-alice');
    const flaky = new ExistingSourceService({
      store: t.bindings, tokenFor: async () => 'x', verifyMaxAgeMs: 0,
      portFor: () => ({ ...real, getBlob: async (id, sha) => { if (++n > 30) throw new Error('boom'); return real.getBlob(id, sha); } }),
    });
    const intel = new ExistingSourceIntelligence({ source: flaky, store: new InMemoryCodeIndexStore(), coordinator: new IndexCoordinator(), limits: { concurrency: 1 } });
    const { index } = await intel.ensure(ALICE, binding.id);
    assert.equal(index.status, 'partial');
    assert.match(index.coverage.partialReason!, /provider_unavailable/);
    assert.ok(index.files.length >= 25 && index.files.length < files.length);
  });

  it('concurrent requests share one build, and an owner cannot run unlimited builds', async () => {
    const t = setup(files, { maxBuildsPerOwner: 1 });
    const { binding } = await t.source.link(ALICE, { repositoryId: t.repo });
    t.gh.calls.length = 0;
    const [a, b] = await Promise.all([t.intel.ensure(ALICE, binding.id), t.intel.ensure(ALICE, binding.id)]);
    assert.equal(a.index.contentFingerprint, b.index.contentFingerprint);
    assert.equal(t.gh.count('blob:'), a.index.files.length, 'one build, not two');

    const second = t.gh.addRepo({ fullName: 'acme/other', ownerId: '501', files: [{ path: 'a.ts', content: 'export const a = 1;\n' }], access: { '501': { pull: true } } });
    const other = await t.source.link(ALICE, { repositoryId: second });
    t.gh.commit(t.repo, 'main', files.concat([{ path: 'new.ts', content: 'export const n = 1;\n' }]));
    await t.source.refreshBase(ALICE, binding.id);
    const slow = t.intel.ensure(ALICE, binding.id);
    await assert.rejects(t.intel.ensure(ALICE, other.binding.id), refused('INDEX_BUSY'));
    await slow;
    assert.ok((await t.intel.ensure(ALICE, other.binding.id)).index.files.length >= 1, 'allowed again once the first build finished');
  });

  it('is tenant isolated: another owner cannot read, build, search or locate against a binding, and maps are not shared', async () => {
    const t = setup(files);
    t.gh.setAccess(t.repo, '502', { pull: true });
    const a = await t.source.link(ALICE, { repositoryId: t.repo });
    await t.intel.ensure(ALICE, a.binding.id);
    for (const op of [() => t.intel.status(BOB, a.binding.id), () => t.intel.ensure(BOB, a.binding.id), () => t.intel.search(BOB, a.binding.id, { query: 'validate' }), () => t.intel.locate(BOB, a.binding.id, { instruction: 'change validation' }), () => t.intel.neighborhood(BOB, a.binding.id, { path: 'package.json' })]) {
      await assert.rejects(op(), refused('BINDING_NOT_FOUND'));
    }
    const b = await t.source.link(BOB, { repositoryId: t.repo });
    assert.equal((await t.intel.status(BOB, b.binding.id)).status, 'not_indexed', "Bob's own binding does not inherit Alice's map");
    assert.equal(await t.indexes.load(BOB, a.binding.id, a.binding.baseCommitSha), null);
  });

  it('losing the connection stops the map being served and discards it; unlinking discards it too', async () => {
    const t = setup(files);
    const { binding } = await t.source.link(ALICE, { repositoryId: t.repo });
    await t.intel.ensure(ALICE, binding.id);
    assert.equal(t.indexes.count(ALICE, binding.id), 1);
    t.tokens.set(ALICE, null);
    t.advance(120_000);
    const status = await t.intel.status(ALICE, binding.id);
    assert.equal(status.status, 'unavailable');
    await assert.rejects(t.intel.search(ALICE, binding.id, { query: 'validateInvoiceNotification' }), refused('REPO_PERMISSION_REVOKED'));
    await t.source.connectionRemoved(ALICE);
    assert.equal(t.indexes.count(ALICE, binding.id), 0, 'the derived map is gone');

    const t2 = setup(files);
    const l2 = await t2.source.link(ALICE, { repositoryId: t2.repo });
    await t2.intel.ensure(ALICE, l2.binding.id);
    await t2.source.unlink(ALICE, l2.binding.id);
    assert.equal(t2.indexes.count(ALICE, l2.binding.id), 0);
  });

  it('a file that does not parse keeps its partial result, is flagged, and never makes the map invalid', async () => {
    const broken = files.concat([{ path: 'packages/billing/src/broken.ts', content: 'export function fine() {}\nexport function broken( {\n const s = "never closed\n' }, { path: 'packages/billing/src/empty.ts', content: '' }]);
    const t = setup(broken);
    const { binding } = await t.source.link(ALICE, { repositoryId: t.repo });
    const { index } = await t.intel.ensure(ALICE, binding.id);
    assert.equal(index.status, 'valid');
    const row = index.files.find((f) => f.path === 'packages/billing/src/broken.ts')!;
    assert.equal(row.analysis.malformed, true);
    assert.ok(row.analysis.symbols.some((s) => s.name === 'fine'));
    assert.ok(!row.analysis.symbols.some((s) => s.name === 'never'));
  });

  it('a request that names nothing findable is low confidence and says so', async () => {
    const t = setup(files);
    const { binding } = await t.source.link(ALICE, { repositoryId: t.repo });
    const found = await t.intel.locate(ALICE, binding.id, { instruction: 'make it feel snappier somehow' });
    assert.equal(found.relevance.confidence, 'low');
    assert.match(found.passport.text, /ask or search before editing/);
    await assert.rejects(t.intel.locate(ALICE, binding.id, { instruction: 'ab' }), refused('INVALID_REQUEST'));
  });
});
