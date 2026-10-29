import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';

import { gitBlobSha } from '../archive/archivePort.js';
import { readZip } from '../archive/zipReader.js';
import { FakeGitHub, type FakeFile } from '../fakeGitHub.testsupport.js';
import { ExistingSourceService } from '../service.js';
import { InMemorySourceBindingStore } from '../store.js';
import { ExistingSourceError, type SourceBinding } from '../types.js';
import { ChangeDelivery, reviewBranchName } from './delivery.js';
import { GitFake } from './gitFake.testsupport.js';
import { InMemoryChangeStore } from './store.js';
import type { ChangeTask, ResultFile } from './types.js';
import { unifiedDiff } from './unifiedDiff.js';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const BASE_FILES: FakeFile[] = [
  { path: 'package.json', content: '{"name":"cart","scripts":{"test":"node --test"}}\n' },
  { path: 'src/pricing.js', content: 'exports.applyDiscount = (p, pct) => p - pct;\n' },
  { path: 'src/other.js', content: 'exports.other = 1;\n' },
  { path: 'README.md', content: '# cart\n' },
];
const FIXED = 'exports.applyDiscount = (p, pct) => Math.round(p * (100 - pct)) / 100;\n';
const NEW_TEST = "const test = require('node:test');\ntest('x', () => {});\n";

function setup(options: { push?: boolean; files?: FakeFile[] } = {}) {
  const files = options.files ?? BASE_FILES;
  const gh = new FakeGitHub();
  gh.addAccount('tok-alice', '501', 'alice');
  const repo = gh.addRepo({ fullName: 'acme/cart', ownerId: '501', files, access: { '501': { pull: true, push: options.push ?? true } } });
  const source = new ExistingSourceService({ store: new InMemorySourceBindingStore(), tokenFor: async (u) => (u === ALICE ? 'tok-alice' : null), portFor: (t) => gh.port(t), treeCache: new Map(), verifyMaxAgeMs: 0 });
  const git = new GitFake();
  const store = new InMemoryChangeStore();
  const delivery = new ChangeDelivery({ source, store, apiFor: async () => git });
  return { gh, repo, source, git, store, delivery, files };
}

async function taskFor(t: ReturnType<typeof setup>, binding: SourceBinding, over: Partial<ChangeTask> = {}, result?: ResultFile[]): Promise<ChangeTask> {
  t.git.seed(t.files, 'main', binding.baseCommitSha);
  const res: ResultFile[] = result ?? [{ path: 'src/pricing.js', kind: 'modified', content: FIXED }, { path: 'test/discount.test.js', kind: 'created', content: NEW_TEST }];
  const task: ChangeTask = {
    id: 'abcdef12-3456-4789-8abc-def012345678', ownerUserId: ALICE, bindingId: binding.id, instruction: 'Fix the discount bug in applyDiscount', status: 'verified', statusReason: 'ok', baseCommitSha: binding.baseCommitSha,
    scope: null, acceptanceCriteria: [], attempts: 1, maxAttempts: 3, regressionTestAdded: true, reproduction: 'reproduced', deliveries: [], events: [], createdAt: '2026-10-27T00:00:00.000Z', updatedAt: '2026-10-27T00:00:00.000Z', result: res,
    revisions: [{ n: 1, at: '2026-10-27T00:00:00.000Z', digest: 'd'.repeat(64), baseCommitSha: binding.baseCommitSha, files: [], additions: 2, deletions: 1, warnings: [], diff: res.map((r) => unifiedDiff(r.path, r.kind === 'created' ? null : t.files.find((f) => f.path === r.path)?.content ?? null, r.content)).join(''), diffTruncated: false, tests: { status: 'passed', summary: '1 test run passed', runtime: 'node', stages: [], evidence: '' }, note: '' }],
    ...over,
  };
  await t.store.save(ALICE, task);
  return task;
}
const link = async (t: ReturnType<typeof setup>) => (await t.source.link(ALICE, { repositoryId: t.repo })).binding;
const refused = (code: string, message?: RegExp) => (e: unknown) => e instanceof ExistingSourceError && e.code === code && (!message || message.test(e.message));

describe('delivering a verified change as a draft pull request', () => {
  it('writes one commit to a NEW review branch, opens a draft PR, leaves the base branch alone and records a verified receipt', async () => {
    const t = setup(); const binding = await link(t); const task = await taskFor(t, binding);
    const baseBefore = t.git.branches.get('main');
    const out = await t.delivery.deliver(ALICE, task.id);
    assert.equal(out.status, 'delivered');
    if (out.status !== 'delivered') return;
    const branch = reviewBranchName(task, 'd'.repeat(64));
    assert.match(branch, /^xroga\/change-abcdef12-dddddddd$/);
    assert.equal(out.receipt.branch, branch);
    assert.equal(out.receipt.rebased, false);
    assert.equal(out.receipt.verified, true);
    assert.equal(out.receipt.draft, true);
    assert.equal(out.receipt.pullRequestNumber, 1);
    assert.equal(t.git.pullRequests[0]!.draft, true);
    assert.equal(t.git.pullRequests[0]!.base, 'main');
    assert.equal(t.git.branches.get('main'), baseBefore, 'the base branch was never written');
    assert.equal(t.git.fileAt(branch, 'src/pricing.js'), FIXED);
    assert.equal(t.git.fileAt(branch, 'src/other.js'), 'exports.other = 1;\n', 'unchanged files are preserved');
    assert.equal(t.git.fileAt(branch, 'test/discount.test.js'), NEW_TEST);
    const commit = t.git.commits.get(t.git.branches.get(branch)!)!;
    assert.equal(commit.parent, baseBefore, 'exactly one commit on top of the base');
    assert.match(commit.message, /Xroga-Change: abcdef12/);
    assert.match(t.git.pullRequests[0]!.body, /PASSED/);
    assert.match(t.git.pullRequests[0]!.body, /fails on the original code/);
    assert.ok(t.git.calls.every((c) => !c.startsWith('updateRef:main') && !c.startsWith('createRef:main')));
    assert.equal((await t.store.get(ALICE, task.id))!.status, 'delivered');
  });

  it('is idempotent: delivering again creates no second branch, commit or pull request', async () => {
    const t = setup(); const binding = await link(t); const task = await taskFor(t, binding);
    const first = await t.delivery.deliver(ALICE, task.id);
    const commits = t.git.commits.size; const branches = t.git.branches.size;
    const second = await t.delivery.deliver(ALICE, task.id);
    assert.equal(second.status, 'delivered');
    if (first.status === 'delivered' && second.status === 'delivered') { assert.equal(second.alreadyDelivered, true); assert.deepEqual(second.receipt, first.receipt); }
    assert.equal(t.git.commits.size, commits); assert.equal(t.git.branches.size, branches); assert.equal(t.git.pullRequests.length, 1);
  });

  it('rebases onto a moved base branch when none of the changed files moved, and says the tests ran against the old base', async () => {
    const t = setup(); const binding = await link(t); const task = await taskFor(t, binding);
    const head = t.git.advance('main', { 'README.md': '# cart, updated by someone else\n' });
    const out = await t.delivery.deliver(ALICE, task.id);
    assert.equal(out.status, 'delivered');
    if (out.status !== 'delivered') return;
    assert.equal(out.receipt.rebased, true);
    assert.equal(out.receipt.verified, false, 'verification is not carried over to a different base');
    assert.equal(out.receipt.headAtDelivery, head);
    assert.match(out.receipt.note, /retest before merging/);
    assert.equal(t.git.commits.get(t.git.branches.get(out.receipt.branch!)!)!.parent, head);
    assert.equal(t.git.fileAt(out.receipt.branch!, 'README.md'), '# cart, updated by someone else\n', 'the remote change is kept');
    assert.match(t.git.pullRequests[0]!.body, /retest before merging/);
  });

  it('reports a structured conflict and writes nothing when the remote changed a file this change touches', async () => {
    const t = setup(); const binding = await link(t); const task = await taskFor(t, binding);
    const head = t.git.advance('main', { 'src/pricing.js': 'exports.applyDiscount = () => 0;\n', 'test/discount.test.js': 'remote added this too\n' });
    const before = t.git.commits.size;
    const out = await t.delivery.deliver(ALICE, task.id);
    assert.equal(out.status, 'conflict');
    if (out.status !== 'conflict') return;
    assert.equal(out.baseCommitSha, binding.baseCommitSha); assert.equal(out.headCommitSha, head); assert.equal(out.exportAvailable, true);
    assert.deepEqual(out.conflicts.map((c) => [c.path, c.reason]).sort(), [['src/pricing.js', 'changed_on_remote'], ['test/discount.test.js', 'created_on_remote']]);
    assert.equal(t.git.commits.size, before, 'no commit, tree or branch was created');
    assert.ok(![...t.git.branches.keys()].some((b) => b.startsWith('xroga/')));
    assert.equal(t.git.pullRequests.length, 0);
    assert.equal((await t.store.get(ALICE, task.id))!.status, 'verified', 'the change is kept for export');
  });

  it('still delivers to a review branch when the base branch is protected, and never writes the protected branch', async () => {
    const t = setup(); const binding = await link(t); const task = await taskFor(t, binding);
    t.git.protectedBranches.add('main');
    const out = await t.delivery.deliver(ALICE, task.id);
    assert.equal(out.status, 'delivered');
    assert.ok(t.git.calls.every((c) => c !== 'updateRef:main'));
  });

  it('refuses without write permission, for an imported ZIP, after losing access, and for unverified or failed changes', async () => {
    const ro = setup({ push: false }); const rb = await link(ro); const rt = await taskFor(ro, rb);
    await assert.rejects(() => ro.delivery.deliver(ALICE, rt.id), refused('DELIVERY_REFUSED', /cannot push/));
    assert.equal(ro.git.calls.length, 0, 'not a single remote call was made');

    const lost = setup(); const lb = await link(lost); const lt = await taskFor(lost, lb);
    lost.gh.setAccess(lost.repo, '501', { pull: false });
    await assert.rejects(() => lost.delivery.deliver(ALICE, lt.id), (e) => e instanceof ExistingSourceError);
    assert.equal(lost.git.calls.length, 0);

    const unv = setup(); const ub = await link(unv); const ut = await taskFor(unv, ub, { status: 'unverified' });
    await assert.rejects(() => unv.delivery.deliver(ALICE, ut.id), refused('DELIVERY_REFUSED', /not test-verified/));
    const allowed = await unv.delivery.deliver(ALICE, ut.id, { allowUnverified: true });
    assert.equal(allowed.status === 'delivered' && allowed.receipt.verified, false);
    assert.match(unv.git.pullRequests[0]!.body, /Not test-verified/);

    for (const status of ['failed', 'cancelled', 'queued'] as const) {
      const x = setup(); const xb = await link(x); const xt = await taskFor(x, xb, { status });
      await assert.rejects(() => x.delivery.deliver(ALICE, xt.id), refused('DELIVERY_REFUSED'), status);
    }
  });

  it('refuses a change carrying a credential or a workflow/.git path before any remote call', async () => {
    for (const bad of [
      [{ path: 'src/config.js', kind: 'created' as const, content: "const key = 'sk-abcdefghijklmnopqrstuvwxyz0123456789';\n" }],
      [{ path: '.github/workflows/ci.yml', kind: 'modified' as const, content: 'name: pwn\n' }],
      [{ path: '.git/hooks/pre-commit', kind: 'created' as const, content: '#!/bin/sh\n' }],
      [{ path: '../escape.js', kind: 'created' as const, content: 'x' }],
    ]) {
      const t = setup(); const b = await link(t); const task = await taskFor(t, b, {}, bad);
      await assert.rejects(() => t.delivery.deliver(ALICE, task.id), refused('DELIVERY_REFUSED'));
      assert.equal(t.git.calls.length, 0);
    }
  });

  it('adopts a branch left by a lost response only when its files match this change exactly, and refuses one with other content', async () => {
    const t = setup(); const binding = await link(t); const task = await taskFor(t, binding);
    // first attempt: the ref moved but the response was lost
    t.git.loseResponseAfterRefUpdate = true;
    await assert.rejects(() => t.delivery.deliver(ALICE, task.id));
    const branch = reviewBranchName(task, 'd'.repeat(64));
    assert.ok(t.git.branches.has(branch), 'the commit did land');
    const retry = await t.delivery.deliver(ALICE, task.id);
    assert.equal(retry.status, 'delivered');
    if (retry.status === 'delivered') { assert.match(retry.receipt.note, /Adopted/); assert.equal(retry.receipt.pullRequestNumber, 1); }
    assert.equal([...t.git.commits.values()].filter((c) => /Xroga-Change/.test(c.message)).length, 1, 'no second commit');

    const other = setup(); const ob = await link(other); const ot = await taskFor(other, ob);
    other.git.branches.set(branch, other.git.advance('main', {}));
    other.git.advance(branch, { 'src/pricing.js': 'something else\n' });
    await assert.rejects(() => other.delivery.deliver(ALICE, ot.id), refused('DELIVERY_REFUSED', /different content/));
  });

  it('keeps the commit when the pull request cannot be opened, and says so', async () => {
    const t = setup(); const binding = await link(t); const task = await taskFor(t, binding);
    t.git.failPullRequest = true;
    const out = await t.delivery.deliver(ALICE, task.id);
    assert.equal(out.status, 'delivered');
    if (out.status !== 'delivered') return;
    assert.equal(out.receipt.pullRequestNumber, null);
    assert.match(out.receipt.note, /pull request could not be opened/);
    assert.ok(out.receipt.commitSha);
    const branchOnly = setup(); const bb = await link(branchOnly); const bt = await taskFor(branchOnly, bb);
    const b = await branchOnly.delivery.deliver(ALICE, bt.id, { mode: 'branch' });
    assert.equal(b.status === 'delivered' && b.receipt.kind, 'branch');
    assert.equal(branchOnly.git.pullRequests.length, 0);
  });

  it('is not available to another owner', async () => {
    const t = setup(); const binding = await link(t); const task = await taskFor(t, binding);
    await assert.rejects(() => t.delivery.deliver(BOB, task.id), refused('CHANGE_NOT_FOUND'));
    await assert.rejects(() => t.delivery.exportPatch(BOB, task.id), refused('CHANGE_NOT_FOUND'));
    await assert.rejects(() => t.delivery.exportZip(BOB, task.id), refused('CHANGE_NOT_FOUND'));
  });
});

describe('export when nothing can be pushed', () => {
  it('produces a patch that git itself accepts and applies to the exact base', async () => {
    const t = setup(); const binding = await link(t);
    const task = await taskFor(t, binding, {}, [{ path: 'src/pricing.js', kind: 'modified', content: FIXED }, { path: 'test/discount.test.js', kind: 'created', content: NEW_TEST }, { path: 'src/other.js', kind: 'deleted', content: null }]);
    const patch = await t.delivery.exportPatch(ALICE, task.id);
    assert.match(patch.filename, /^xroga-change-abcdef12\.patch$/);
    assert.equal(patch.baseCommitSha, binding.baseCommitSha);
    const dir = await mkdtemp(join(tmpdir(), 'xroga-patch-'));
    try {
      for (const f of BASE_FILES) { const full = join(dir, ...f.path.split('/')); await mkdir(dirname(full), { recursive: true }); await writeFile(full, f.content, 'utf8'); }
      await writeFile(join(dir, 'change.patch'), patch.content, 'utf8');
      execFileSync('git', ['init', '-q'], { cwd: dir });
      execFileSync('git', ['-c', 'core.autocrlf=false', 'apply', '--check', 'change.patch'], { cwd: dir });
      execFileSync('git', ['-c', 'core.autocrlf=false', 'apply', 'change.patch'], { cwd: dir });
      assert.equal(await readFile(join(dir, 'src/pricing.js'), 'utf8'), FIXED);
      assert.equal(await readFile(join(dir, 'test/discount.test.js'), 'utf8'), NEW_TEST);
      assert.equal(await readFile(join(dir, 'README.md'), 'utf8'), '# cart\n');
      await assert.rejects(() => readFile(join(dir, 'src/other.js')), 'the deleted file is gone');
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it('produces a ZIP of only the changed files that the safe reader accepts, and never delivers a credential', async () => {
    const t = setup(); const binding = await link(t);
    const task = await taskFor(t, binding, {}, [{ path: 'src/pricing.js', kind: 'modified', content: FIXED }, { path: 'old.txt', kind: 'deleted', content: null }]);
    const zip = await t.delivery.exportZip(ALICE, task.id);
    const read = readZip(zip.data);
    assert.deepEqual(read.files.map((f) => f.path).sort(), ['XROGA-DELETED.txt', 'src/pricing.js']);
    assert.equal(read.files.find((f) => f.path === 'src/pricing.js')!.data.toString(), FIXED);
    assert.equal(read.files.find((f) => f.path === 'XROGA-DELETED.txt')!.data.toString(), 'old.txt\n');
    assert.deepEqual(read.skipped, []);
    const secret = setup(); const sb = await link(secret); const st = await taskFor(secret, sb, {}, [{ path: 'k.js', kind: 'created', content: 'const t = "ghp_abcdefghijklmnopqrstuvwxyz0123456789";' }]);
    await assert.rejects(() => secret.delivery.exportZip(ALICE, st.id), refused('DELIVERY_REFUSED'));
    await assert.rejects(() => secret.delivery.exportPatch(ALICE, st.id), refused('DELIVERY_REFUSED'));
    assert.equal(gitBlobSha(FIXED).length, 40);
  });
});
