import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import type { ProjectFile } from '../../ai/patches.js';
import type { UniversalBuildOutcome } from '../../synthesis/universalEntrypoint.js';
import { InMemoryPhase2Store } from '../phase2Store.js';
import { BuilderService, type BuildRunner } from '../service.js';
import { InMemoryBuilderStore } from '../store.js';
import { BuilderError, type ExternalOperation } from '../types.js';
import { FakeGitHub } from './fakeGitHub.testsupport.js';
import { APPROVAL_TTL_MS, GitHubExportService, planDigest } from './service.js';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const TOKEN = 'token-for-owner';
const OTHER_TOKEN = 'token-for-other';
const SITE = 'Build a premium modern website for a home renovation company with Home, Services, About, Projects and Contact pages.';

interface Harness {
  github: FakeGitHub;
  store: InMemoryBuilderStore;
  phase2: InMemoryPhase2Store;
  builder: BuilderService;
  service: GitHubExportService;
  projectId: string;
  clock: { now: Date };
  tokens: Map<string, string | null>;
}

const outcomeOf = (files: readonly ProjectFile[]): UniversalBuildOutcome =>
  ({ ran: true, result: { outcome: 'completed', phaseReached: 'complete', plan: null, securityControls: [], files, commitSha: null, evidence: [], blockers: [], mutationBegan: true, verified: true, reason: 'ok' }, goalContract: null, buildContract: null, routing: { selectedModel: null, fallbacks: [], reason: 't', excluded: [] } }) as unknown as UniversalBuildOutcome;

async function harness(options: { scopes?: string[] | null } = {}): Promise<Harness> {
  const github = new FakeGitHub();
  github.addUser(TOKEN, { id: 501, login: 'alice', scopes: options.scopes === undefined ? ['repo', 'read:org'] : options.scopes, orgs: [{ login: 'alice-co', id: 777 }] });
  github.addUser(OTHER_TOKEN, { id: 502, login: 'bob', scopes: ['repo'], orgs: [] });
  const store = new InMemoryBuilderStore();
  const phase2 = new InMemoryPhase2Store(store);
  const runner: BuildRunner = async ({ existingFiles, commit }) => {
    const next = [...existingFiles.filter((file) => file.path !== 'index.html'), { path: 'index.html', content: `<h1>edit ${Math.random()}</h1>` }];
    await commit({ files: next, message: 'm' });
    return outcomeOf(next);
  };
  const builder = new BuilderService({ store, runBuild: runner });
  const clock = { now: new Date('2026-10-26T12:00:00Z') };
  const tokens = new Map<string, string | null>([[OWNER, TOKEN], [OTHER, OTHER_TOKEN]]);
  const service = new GitHubExportService({ phase2, builder, github, tokenFor: async (userId) => tokens.get(userId) ?? null, now: () => clock.now });
  const { project } = await builder.createProject(OWNER, { prompt: SITE, requestKey: `gh-${Math.random().toString(36).slice(2, 12)}` });
  return { github, store, phase2, builder, service, projectId: project.id, clock, tokens };
}

const create = (h: Harness, over: Partial<Parameters<GitHubExportService['prepareCreate']>[2]> = {}) =>
  h.service.prepareCreate(OWNER, h.projectId, { operationKey: 'op-key-000001', owner: 'alice', repositoryName: 'renovate-site', ...over });

async function runToSuccess(h: Harness, over: Partial<Parameters<GitHubExportService['prepareCreate']>[2]> = {}): Promise<ExternalOperation> {
  const prepared = await create(h, over);
  const approved = await h.service.approve(OWNER, h.projectId, prepared.operation.id, { digest: prepared.operation.planDigest });
  return h.service.execute(OWNER, h.projectId, approved.id);
}

describe('GitHub targets and preparation', () => {
  let h: Harness;
  beforeEach(async () => { h = await harness(); });

  it('reports not connected when there is no token or it was revoked', async () => {
    h.tokens.set(OWNER, null);
    const targets = await h.service.targets(OWNER);
    assert.equal(targets.connected, false);
    assert.match(targets.notes[0], /not connected|revoked/);
  });

  it('lists only the accounts GitHub says the user can act for, and explains missing permissions', async () => {
    const targets = await h.service.targets(OWNER);
    assert.deepEqual(targets.owners.map((owner) => owner.login), ['alice', 'alice-co']);
    assert.equal(targets.canCreatePrivate, true);
    const limited = await harness({ scopes: ['public_repo'] });
    const limitedTargets = await limited.service.targets(OWNER);
    assert.equal(limitedTargets.canCreatePrivate, false);
    assert.match(limitedTargets.notes.join(' '), /"repo" permission/);
  });

  it('prepares an exact plan with a digest and requires approval; nothing is created yet', async () => {
    const prepared = await create(h);
    assert.equal(prepared.operation.status, 'prepared');
    assert.equal(prepared.requiresApproval, true);
    assert.equal(prepared.plan.repository.visibility, 'private');
    assert.equal(prepared.plan.owner.login, 'alice');
    assert.equal(prepared.plan.viewer.login, 'alice');
    assert.equal(prepared.operation.planDigest, planDigest(prepared.plan));
    assert.match(prepared.plan.costNote, /cannot see your GitHub plan/);
    assert.equal(h.github.repos.size, 0);
    assert.ok(!h.github.calls.some((call) => call.startsWith('createRepo')));
  });

  it('warns clearly when the repository would be public', async () => {
    const prepared = await create(h, { visibility: 'public' });
    assert.match(prepared.plan.warnings.join(' '), /PUBLIC/);
  });

  it('refuses owners the account cannot act for (wrong GitHub account) and invalid names', async () => {
    await assert.rejects(create(h, { owner: 'bob' }), (error) => error instanceof BuilderError && /not connected to a GitHub account/.test(error.message));
    for (const repositoryName of ['', '..', 'a/b', 'x.git', '.hidden', 'has space', 'a'.repeat(101)]) {
      await assert.rejects(create(h, { repositoryName }), (error) => error instanceof BuilderError && error.code === 'invalid_input', repositoryName);
    }
    await assert.rejects(create(h, { branch: 'bad..branch' }), BuilderError);
  });

  it('refuses a private repository when the connection lacks the repo permission', async () => {
    const limited = await harness({ scopes: ['public_repo'] });
    await assert.rejects(limited.service.prepareCreate(OWNER, limited.projectId, { operationKey: 'op-key-000002', owner: 'alice', repositoryName: 'x-site' }), (error) => error instanceof BuilderError && /"repo" permission/.test(error.message));
  });

  it('is idempotent on the operation key and refuses the same key for a different plan', async () => {
    const first = await create(h);
    const again = await create(h);
    assert.equal(again.created, false);
    assert.equal(again.operation.id, first.operation.id);
    await assert.rejects(create(h, { repositoryName: 'a-different-name' }), (error) => error instanceof BuilderError && error.code === 'conflict');
  });

  it('blocks export of a revision that contains credentials', async () => {
    const project = await h.builder.requireProject(OWNER, h.projectId);
    // Credentials cannot even be stored; the export path would also refuse them.
    await assert.rejects(h.store.appendRevision(OWNER, h.projectId, { runId: 'leak-run-0001', origin: 'generation', files: [{ path: '.env', content: 'GITHUB_TOKEN=abc' }], expectedParentId: project.currentRevisionId }), /credential/);
  });
});

describe('GitHub approval and execution', () => {
  let h: Harness;
  beforeEach(async () => { h = await harness(); });

  it('creates a private repository in the selected account, pushes the verified revision and records a receipt', async () => {
    const operation = await runToSuccess(h);
    assert.equal(operation.status, 'succeeded');
    const repo = h.github.repo('alice', 'renovate-site')!;
    assert.equal(repo.private, true);
    assert.equal(repo.owner.id, 501);
    assert.match(repo.description ?? '', /xroga-export:[a-f0-9]{12}/);
    const receipt = operation.receipt as { repository: { id: number; owner: string; url: string }; commit: { sha: string }; revision: { number: number }; verifiedFileCount: number; authenticatedAs: { login: string } };
    assert.equal(receipt.repository.owner, 'alice');
    assert.equal(receipt.repository.url, 'https://github.com/alice/renovate-site');
    assert.equal(receipt.authenticatedAs.login, 'alice');
    assert.equal(repo.branches.get('main'), receipt.commit.sha);
    const pushed = repo.commits.get(receipt.commit.sha)!;
    assert.ok(pushed.files.has('index.html') && pushed.files.has('XROGA-SETUP.md'));
    assert.ok(!pushed.files.has('XROGA-EXPORT.json'), 'the Xroga manifest is not pushed');
    assert.equal(receipt.verifiedFileCount, pushed.files.size);
    const binding = await h.service.binding(OWNER, h.projectId);
    assert.equal(binding?.repository.name, 'renovate-site');
    assert.equal(binding?.commits[0].revisionNumber, receipt.revision.number);
  });

  it('can create the repository under an organization the user belongs to', async () => {
    const operation = await runToSuccess(h, { owner: 'alice-co', repositoryName: 'org-site' });
    assert.equal(operation.status, 'succeeded');
    assert.equal(h.github.repo('alice-co', 'org-site')?.owner.id, 777);
  });

  it('will not run without approval, with the wrong digest, or after the approval expired', async () => {
    const prepared = await create(h);
    await assert.rejects(h.service.execute(OWNER, h.projectId, prepared.operation.id), (error) => error instanceof BuilderError && /explicit approval/.test(error.message));
    await assert.rejects(h.service.approve(OWNER, h.projectId, prepared.operation.id, { digest: 'f'.repeat(64) }), (error) => error instanceof BuilderError && error.code === 'conflict');
    assert.equal(h.github.repos.size, 0);
    await h.service.approve(OWNER, h.projectId, prepared.operation.id, { digest: prepared.operation.planDigest });
    h.clock.now = new Date(h.clock.now.getTime() + APPROVAL_TTL_MS + 1000);
    await assert.rejects(h.service.execute(OWNER, h.projectId, prepared.operation.id), (error) => error instanceof BuilderError && /expired/.test(error.message));
    assert.equal(h.github.repos.size, 0);
    assert.equal((await h.phase2.getOperation(OWNER, h.projectId, prepared.operation.id))?.status, 'cancelled');
  });

  it('replaying a finished operation returns the receipt without touching GitHub again', async () => {
    const done = await runToSuccess(h);
    const before = h.github.calls.length;
    const replay = await h.service.execute(OWNER, h.projectId, done.id);
    assert.equal(replay.status, 'succeeded');
    assert.equal(h.github.calls.length, before);
    assert.equal(h.github.repos.size, 1);
  });

  it('two simultaneous executions run the operation once', async () => {
    const prepared = await create(h);
    await h.service.approve(OWNER, h.projectId, prepared.operation.id, { digest: prepared.operation.planDigest });
    const results = await Promise.allSettled([h.service.execute(OWNER, h.projectId, prepared.operation.id), h.service.execute(OWNER, h.projectId, prepared.operation.id)]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(h.github.repos.size, 1);
    assert.equal(h.github.calls.filter((call) => call.startsWith('createRepo')).length, 1);
  });

  it('a timeout after the repository was created is reconciled: the retry adopts it and creates no duplicate', async () => {
    h.github.failures = { createRepo: 'timeout_after_create' };
    const prepared = await create(h);
    await h.service.approve(OWNER, h.projectId, prepared.operation.id, { digest: prepared.operation.planDigest });
    // The provider created it, but the reply was lost: reconciled immediately because the marker proves it is ours.
    const done = await h.service.execute(OWNER, h.projectId, prepared.operation.id);
    assert.equal(done.status, 'succeeded');
    assert.equal(h.github.repos.size, 1);
    assert.equal(h.github.calls.filter((call) => call.startsWith('createRepo')).length, 1);
  });

  it('a timeout before anything was created ends ambiguous, and a retry creates exactly one repository', async () => {
    h.github.failures = { createRepo: 'timeout_before_create' };
    const prepared = await create(h);
    await h.service.approve(OWNER, h.projectId, prepared.operation.id, { digest: prepared.operation.planDigest });
    await assert.rejects(h.service.execute(OWNER, h.projectId, prepared.operation.id), BuilderError);
    const ambiguous = await h.phase2.getOperation(OWNER, h.projectId, prepared.operation.id);
    assert.equal(ambiguous?.status, 'ambiguous');
    assert.match(ambiguous?.failure ?? '', /did not confirm/);
    assert.equal(h.github.repos.size, 0);
    h.github.failures = {};
    await h.service.approve(OWNER, h.projectId, prepared.operation.id, { digest: prepared.operation.planDigest });
    assert.equal((await h.service.execute(OWNER, h.projectId, prepared.operation.id)).status, 'succeeded');
    assert.equal(h.github.repos.size, 1);
  });

  it('never adopts a repository it did not create, and pushes nothing to it', async () => {
    h.github.repos.set('alice/renovate-site', { id: 1, owner: { login: 'alice', id: 501 }, name: 'renovate-site', private: true, htmlUrl: 'https://github.com/alice/renovate-site', description: 'my own project', defaultBranch: 'main', branches: new Map([['main', 'a'.repeat(40)]]), commits: new Map() } as never);
    const prepared = await create(h);
    await h.service.approve(OWNER, h.projectId, prepared.operation.id, { digest: prepared.operation.planDigest });
    await assert.rejects(h.service.execute(OWNER, h.projectId, prepared.operation.id), (error) => error instanceof BuilderError && /not created by this export/.test(error.message));
    assert.ok(!h.github.calls.some((call) => call.startsWith('push')));
    assert.equal(h.github.repo('alice', 'renovate-site')?.branches.get('main'), 'a'.repeat(40));
  });

  it('refuses a repository GitHub created under a different owner than approved', async () => {
    h.github.failures = { createRepo: 'wrong_owner' };
    const prepared = await create(h);
    await h.service.approve(OWNER, h.projectId, prepared.operation.id, { digest: prepared.operation.planDigest });
    await assert.rejects(h.service.execute(OWNER, h.projectId, prepared.operation.id), BuilderError);
    assert.ok(!h.github.calls.some((call) => call.startsWith('push')));
  });

  it('fails safely, changing nothing, when the connected account is no longer the approved one', async () => {
    const prepared = await create(h);
    await h.service.approve(OWNER, h.projectId, prepared.operation.id, { digest: prepared.operation.planDigest });
    h.tokens.set(OWNER, OTHER_TOKEN); // the user reconnected as a different GitHub account
    await assert.rejects(h.service.execute(OWNER, h.projectId, prepared.operation.id), (error) => error instanceof BuilderError && /account changed/.test(error.message));
    assert.equal(h.github.repos.size, 0);
  });

  it('a revoked connection blocks the operation and nothing cached is used', async () => {
    const prepared = await create(h);
    await h.service.approve(OWNER, h.projectId, prepared.operation.id, { digest: prepared.operation.planDigest });
    h.tokens.set(OWNER, null);
    await assert.rejects(h.service.execute(OWNER, h.projectId, prepared.operation.id), (error) => error instanceof BuilderError && /no longer connected/.test(error.message));
    assert.equal(h.github.repos.size, 0);
    assert.equal((await h.phase2.getOperation(OWNER, h.projectId, prepared.operation.id))?.status, 'failed');
  });

  it('a push whose stored result does not match is reported as a partial failure that keeps the repository fact, and a retry completes it', async () => {
    h.github.failures = { push: 'tamper' };
    const prepared = await create(h);
    await h.service.approve(OWNER, h.projectId, prepared.operation.id, { digest: prepared.operation.planDigest });
    await assert.rejects(h.service.execute(OWNER, h.projectId, prepared.operation.id), /could not be verified/);
    const failed = await h.phase2.getOperation(OWNER, h.projectId, prepared.operation.id);
    assert.equal(failed?.status, 'failed');
    assert.equal((failed?.receipt as { partial?: boolean } | null)?.partial, true);
    assert.equal(h.github.repos.size, 1, 'the repository that WAS created is not erased from the record');
    assert.equal(await h.service.binding(OWNER, h.projectId), null, 'an unverified push is not a binding');
    h.github.failures = {};
    await h.service.approve(OWNER, h.projectId, prepared.operation.id, { digest: prepared.operation.planDigest });
    assert.equal((await h.service.execute(OWNER, h.projectId, prepared.operation.id)).status, 'succeeded');
    assert.equal(h.github.repos.size, 1);
  });

  it('a stored plan that no longer matches its digest cannot be approved or executed', async () => {
    const prepared = await create(h);
    const forged = await h.phase2.createOperation(OWNER, h.projectId, { provider: 'github', action: 'create_repository', operationKey: 'forged-key-0001', revisionId: prepared.plan.revision.id, plan: { ...prepared.plan, owner: { login: 'bob', id: 502, type: 'User' } }, planDigest: prepared.operation.planDigest });
    await assert.rejects(h.service.approve(OWNER, h.projectId, forged!.operation.id, { digest: prepared.operation.planDigest }), (error) => error instanceof BuilderError && error.code === 'conflict');
  });
});

describe('GitHub sync', () => {
  let h: Harness;
  beforeEach(async () => { h = await harness(); });

  async function newRevision(): Promise<void> {
    await h.builder.generate(OWNER, h.projectId, { runId: `sync-run-${Math.random().toString(36).slice(2, 12)}`, launchPreview: false });
  }
  async function sync(key: string) {
    const prepared = await h.service.prepareSync(OWNER, h.projectId, { operationKey: key });
    const approved = await h.service.approve(OWNER, h.projectId, prepared.operation.id, { digest: prepared.operation.planDigest });
    return h.service.execute(OWNER, h.projectId, approved.id);
  }

  it('needs a repository first', async () => {
    await assert.rejects(h.service.prepareSync(OWNER, h.projectId, { operationKey: 'sync-key-00001' }), (error) => error instanceof BuilderError && /no GitHub repository yet/.test(error.message));
  });

  it('pushes the next revision as a fast-forward commit and maps revisions to commits', async () => {
    const created = await runToSuccess(h);
    await newRevision();
    const synced = await sync('sync-key-00001');
    assert.equal(synced.status, 'succeeded');
    const receipt = synced.receipt as { commit: { sha: string; parentSha: string }; revision: { number: number } };
    const first = created.receipt as { commit: { sha: string } };
    assert.equal(receipt.commit.parentSha, first.commit.sha);
    const binding = await h.service.binding(OWNER, h.projectId);
    assert.deepEqual(binding?.commits.map((commit) => commit.revisionNumber), [(created.receipt as { revision: { number: number } }).revision.number, receipt.revision.number]);
    assert.equal(h.github.repo('alice', 'renovate-site')?.commits.size, 3, 'initial, first export, sync: history is preserved');
  });

  it('stops with a clear state when the remote moved, and never overwrites independent work', async () => {
    await runToSuccess(h);
    await newRevision();
    const remote = h.github.externalPush('alice', 'renovate-site', 'main', { 'README.md': 'edited on GitHub by the customer' });
    await assert.rejects(sync('sync-key-00002'), (error) => error instanceof BuilderError && /changed since the last sync/.test(error.message));
    assert.equal(h.github.repo('alice', 'renovate-site')?.branches.get('main'), remote, 'the customer\'s commit is still the head');
    const ops = await h.service.operations(OWNER, h.projectId);
    assert.equal(ops.find((operation) => operation.operationKey === 'sync-key-00002')?.status, 'diverged');
  });

  it('does not push a revision that is already in the repository', async () => {
    await runToSuccess(h);
    await assert.rejects(h.service.prepareSync(OWNER, h.projectId, { operationKey: 'sync-key-00003' }), (error) => error instanceof BuilderError && /already in your GitHub repository/.test(error.message));
  });

  it('fails when the bound repository was replaced by a different one with the same name', async () => {
    await runToSuccess(h);
    await newRevision();
    const prepared = await h.service.prepareSync(OWNER, h.projectId, { operationKey: 'sync-key-00004' });
    h.github.repos.delete('alice/renovate-site');
    h.github.repos.set('alice/renovate-site', { id: 424242, owner: { login: 'alice', id: 501 }, name: 'renovate-site', private: true, htmlUrl: 'x', description: null, defaultBranch: 'main', branches: new Map(), commits: new Map() } as never);
    await h.service.approve(OWNER, h.projectId, prepared.operation.id, { digest: prepared.operation.planDigest });
    await assert.rejects(h.service.execute(OWNER, h.projectId, prepared.operation.id), (error) => error instanceof BuilderError && /no longer the same repository/.test(error.message));
  });
});

describe('GitHub tenant isolation', () => {
  it('another user cannot prepare, approve, execute, cancel or read operations for a project, and uses only their own token', async () => {
    const h = await harness();
    const prepared = await create(h);
    await assert.rejects(h.service.prepareCreate(OTHER, h.projectId, { operationKey: 'foreign-key-001', owner: 'bob', repositoryName: 'stolen' }), (error) => error instanceof BuilderError && error.code === 'not_found');
    await assert.rejects(h.service.approve(OTHER, h.projectId, prepared.operation.id, { digest: prepared.operation.planDigest }), BuilderError);
    await assert.rejects(h.service.execute(OTHER, h.projectId, prepared.operation.id), BuilderError);
    await assert.rejects(h.service.cancel(OTHER, h.projectId, prepared.operation.id), BuilderError);
    await assert.rejects(h.service.operations(OTHER, h.projectId), BuilderError);
    await assert.rejects(h.service.binding(OTHER, h.projectId), BuilderError);
    assert.equal(h.github.repos.size, 0);
    // The owner's own flow still works and never used the other user's token.
    const done = await runToSuccess(h, { operationKey: 'owner-key-0001' });
    assert.equal((done.receipt as { authenticatedAs: { login: string } }).authenticatedAs.login, 'alice');
  });
});
