import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ProjectFile } from '../ai/patches.js';
import type { UniversalBuildOutcome } from '../synthesis/universalEntrypoint.js';
import { describeChanges, diffRevisions } from './diff.js';
import { classifyBuilderIntent } from './intent.js';
import { BuilderService, type BuildRunner } from './service.js';
import { InMemoryBuilderStore } from './store.js';
import { BuilderError } from './types.js';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const SITE = 'Build a premium modern website for a home renovation company with Home, Services, About, Projects and Contact pages.';

function outcome(files: readonly ProjectFile[], verified = true): UniversalBuildOutcome {
  return {
    ran: true,
    result: { outcome: verified ? 'completed' : 'failed', phaseReached: 'complete', plan: null, securityControls: [], files, commitSha: null, evidence: [], blockers: [], mutationBegan: true, verified, reason: verified ? 'ok' : 'validation failed' },
    goalContract: null, buildContract: null, routing: { selectedModel: null, fallbacks: [], reason: 't', excluded: [] },
  } as unknown as UniversalBuildOutcome;
}

/** A canonical-path stand-in: applies `change` to the current files and commits only after "validation" passes. */
const runner = (change: (files: readonly ProjectFile[]) => ProjectFile[], verified = true): BuildRunner => async ({ existingFiles, commit }) => {
  const next = change(existingFiles);
  if (verified) await commit({ files: next, message: 'change' });
  return outcome(next, verified);
};

const setFile = (path: string, content: string) => (files: readonly ProjectFile[]) => [...files.filter((file) => file.path !== path), { path, content }];

async function project(run: BuildRunner) {
  const store = new InMemoryBuilderStore();
  const service = new BuilderService({ store, runBuild: run });
  const { project: created } = await service.createProject(OWNER, { prompt: SITE, requestKey: `iter-${Math.random().toString(36).slice(2, 12)}` });
  return { store, service, id: created.id };
}

describe('revision diff', () => {
  it('reports added, modified and deleted files with line counts and context hunks', () => {
    const before = [{ path: 'a.txt', content: 'one\ntwo\nthree\nfour\nfive' }, { path: 'gone.txt', content: 'x\ny' }, { path: 'same.txt', content: 'same' }];
    const after = [{ path: 'a.txt', content: 'one\ntwo\nTHREE\nfour\nfive' }, { path: 'new.txt', content: 'hello' }, { path: 'same.txt', content: 'same' }];
    const diff = diffRevisions(before, after);
    assert.deepEqual(diff.totals, { added: 1, modified: 1, deleted: 1, additions: 2, deletions: 3 });
    const modified = diff.files.find((file) => file.path === 'a.txt');
    assert.equal(modified?.additions, 1);
    assert.equal(modified?.deletions, 1);
    assert.match(modified?.patch ?? '', /-three\n\+THREE/);
    assert.ok(!diff.files.some((file) => file.path === 'same.txt'), 'unchanged files are not listed');
  });

  it('bounds the work: huge files are summarised, many files are capped', () => {
    const big = Array.from({ length: 3000 }, (_, i) => `line ${i}`).join('\n');
    const diff = diffRevisions([{ path: 'big.txt', content: big }], [{ path: 'big.txt', content: `${big}\nextra` }]);
    assert.equal(diff.files[0].patch, null);
    assert.equal(diff.files[0].truncated, true);
    const many = Array.from({ length: 80 }, (_, i) => ({ path: `f${i}.txt`, content: String(i) }));
    const capped = diffRevisions([], many);
    assert.equal(capped.files.length, 60);
    assert.equal(capped.omittedFiles, 20);
    assert.equal(capped.totals.added, 80);
  });

  it('describes changes in plain language', () => {
    assert.equal(describeChanges({ created: [], modified: [], deleted: [] }), 'no file changes');
    assert.match(describeChanges({ created: ['a', 'b'], modified: ['c'], deleted: ['d'] }), /added 2 files \(a, b\); changed 1 file \(c\); removed 1 file \(d\)/);
  });
});

describe('follow-up intent', () => {
  const inProject = (text: string) => classifyBuilderIntent(text, { hasProject: true });
  it('treats change requests as follow-ups to the existing project', () => {
    for (const text of ['Change my dashboard design.', 'Add another page.', 'Fix the booking system.', 'Add a new feature that exports to CSV', 'Make the sidebar smaller and switch to dark mode', 'rename the hero heading', 'create another page for my site', 'The login button does not work']) {
      assert.equal(inProject(text), 'followup', text);
    }
  });
  it('creates a new product only when the request is clearly for something separate', () => {
    for (const text of ['Start over from scratch', 'Build a brand new website for a bakery', 'create a separate app for invoices', 'I want another project', 'Build me a restaurant website with a menu']) {
      assert.equal(inProject(text), 'new_product', text);
    }
  });
  it('leaves plain questions to ordinary chat', () => {
    for (const text of ['What does this project use for styling?', 'How does the booking page work?', '']) assert.equal(inProject(text), 'other', text);
  });
  it('without a project, only product requests start one', () => {
    assert.equal(classifyBuilderIntent('Build me a booking SaaS with login and a dashboard', { hasProject: false }), 'new_product');
    assert.equal(classifyBuilderIntent('hello there', { hasProject: false }), 'other');
    assert.equal(classifyBuilderIntent('what is the weather', { hasProject: false }), 'other');
  });
});

describe('same-project iteration', () => {
  it('modifies the same project, saves a new revision, keeps the old one and records meaningful changes', async () => {
    const { service, store, id } = await project(runner(setFile('index.html', '<h1>v2 dark</h1>')));
    const state = await service.generate(OWNER, id, { prompt: 'Change the design to dark mode', launchPreview: false });
    assert.equal(state.project.id, id);
    assert.equal(state.project.currentRevisionNumber, 2);
    const history = await service.history(OWNER, id);
    assert.deepEqual(history.map((revision) => [revision.revisionNumber, revision.origin]), [[2, 'generation'], [1, 'starter']]);
    assert.ok(describeChanges(history[0].changeSummary).length > 0);
    const old = await store.getRevision(OWNER, id, history[1].id);
    assert.notEqual(old?.files.find((file) => file.path === 'index.html')?.content, '<h1>v2 dark</h1>', 'the earlier source is untouched');
    const diff = await service.diff(OWNER, id, history[0].id);
    assert.equal(diff.from?.revisionNumber, 1);
    assert.ok(diff.files.some((file) => file.path === 'index.html' && file.status === 'modified'));
  });

  it('preserves existing files the change did not touch', async () => {
    const { service, store, id } = await project(runner(setFile('about.html', '<h1>About</h1>')));
    const before = (await store.getRevision(OWNER, id, (await service.requireProject(OWNER, id)).currentRevisionId as string))!.files.map((file) => file.path);
    await service.generate(OWNER, id, { prompt: 'Add an about page', launchPreview: false });
    const after = await service.headFiles(OWNER, await service.requireProject(OWNER, id));
    for (const path of before) assert.ok(after.files.some((file) => file.path === path), `${path} was preserved`);
    assert.ok(after.files.some((file) => file.path === 'about.html'));
  });

  it('a change that does not validate saves nothing as the current source and leaves the project usable', async () => {
    const { service, id } = await project(runner(setFile('index.html', '<h1>broken</h1>'), false));
    const state = await service.generate(OWNER, id, { prompt: 'Add a feature', launchPreview: false });
    assert.notEqual(state.project.state, 'verified');
    const history = await service.history(OWNER, id);
    assert.equal(history[0].verificationStatus, 'failed', 'the attempt is kept but marked failed');
    assert.equal(history[1].origin, 'starter');
    // The project can be built again afterwards.
    const retry = new BuilderService({ store: (service as unknown as { deps: { store: InMemoryBuilderStore } }).deps.store, runBuild: runner(setFile('index.html', '<h1>fixed</h1>')) });
    assert.equal((await retry.generate(OWNER, id, { prompt: 'Try again', launchPreview: false })).project.state, 'partial');
  });

  it('an unchanged result creates no revision and keeps the previous state', async () => {
    const { service, id } = await project(runner((files) => files.map((file) => ({ ...file }))));
    const before = await service.requireProject(OWNER, id);
    const state = await service.generate(OWNER, id, { prompt: 'Keep everything as is', launchPreview: false });
    assert.equal(state.project.currentRevisionNumber, before.currentRevisionNumber);
    assert.equal(state.project.state, before.state);
  });

  it('retrying the same run is idempotent: one revision, not two', async () => {
    const store = new InMemoryBuilderStore();
    const service = new BuilderService({ store, runBuild: runner(setFile('index.html', '<h1>retry</h1>')) });
    const { project: created } = await service.createProject(OWNER, { prompt: SITE, requestKey: 'idempotent-retry-1' });
    await service.generate(OWNER, created.id, { runId: 'retry-run-00000001', launchPreview: false });
    await service.generate(OWNER, created.id, { runId: 'retry-run-00000001', launchPreview: false });
    assert.equal((await service.history(OWNER, created.id)).length, 2);
  });

  it('rejects a second simultaneous change and never overwrites a newer head', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const slow: BuildRunner = async (input) => { await gate; return runner(setFile('a.html', '<h1>a</h1>'))(input); };
    const { service, id } = await project(slow);
    const first = service.generate(OWNER, id, { launchPreview: false });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await assert.rejects(service.generate(OWNER, id, { launchPreview: false }), (error) => error instanceof BuilderError && error.code === 'conflict');
    release();
    await first;
    assert.equal((await service.history(OWNER, id)).length, 2);
  });

  it('a build that finds the head moved fails with a conflict instead of overwriting', async () => {
    const store = new InMemoryBuilderStore();
    const service = new BuilderService({ store, runBuild: runner(setFile('index.html', '<h1>late</h1>')) });
    const { project: created } = await service.createProject(OWNER, { prompt: SITE, requestKey: 'moved-head-0001' });
    const run = await service.beginRun(OWNER, created.id, { runId: 'moving-run-0000001' });
    // Someone else advances the head after this run read its source.
    await store.appendRevision(OWNER, created.id, { runId: 'other-writer-0001', origin: 'followup', files: [{ path: 'x.txt', content: '1' }], expectedParentId: created.currentRevisionId });
    await assert.rejects(run.commit({ files: [{ path: 'index.html', content: 'stale' }], message: 'm' }), (error) => error instanceof BuilderError && error.code === 'conflict');
    assert.equal((await service.history(OWNER, created.id)).length, 2);
  });
});

describe('safe restore', () => {
  it('restores an earlier revision as a new revision on top and keeps everything in between', async () => {
    const { service, id, store } = await project(runner(setFile('index.html', '<h1>second</h1>')));
    await service.generate(OWNER, id, { launchPreview: false });
    const original = (await service.history(OWNER, id)).find((revision) => revision.origin === 'starter')!;
    const result = await service.restoreRevision(OWNER, id, original.id);
    assert.equal(result.restoredFrom, 1);
    assert.equal(result.revision?.revisionNumber, 3);
    assert.equal(result.revision?.origin, 'restore');
    assert.equal(result.revision?.parentRevisionId, (await service.history(OWNER, id))[1].id);
    assert.match(result.notice, /external database, GitHub repository or deployment is unchanged/);
    const head = await service.headFiles(OWNER, await service.requireProject(OWNER, id));
    const first = await store.getRevision(OWNER, id, original.id);
    assert.deepEqual(head.files.map((file) => file.content).sort(), first!.files.map((file) => file.content).sort());
    assert.equal((await service.history(OWNER, id)).length, 3);
    assert.equal(result.state.project.state, 'partial', 'a restored revision is unverified until it is tested again');
  });

  it('restoring the current source changes nothing and keeps the project state', async () => {
    const { service, id } = await project(runner(setFile('index.html', '<h1>x</h1>')));
    await service.generate(OWNER, id, { launchPreview: false });
    const head = (await service.history(OWNER, id))[0];
    const before = await service.requireProject(OWNER, id);
    const result = await service.restoreRevision(OWNER, id, head.id);
    assert.equal(result.unchanged, true);
    assert.equal(result.revision, null);
    assert.equal((await service.history(OWNER, id)).length, 2);
    assert.equal(result.state.project.state, before.state);
  });

  it('denies restore and diff across tenants and for unknown revisions', async () => {
    const { service, id } = await project(runner(setFile('index.html', '<h1>x</h1>')));
    const revision = (await service.history(OWNER, id))[0];
    await assert.rejects(service.restoreRevision(OTHER, id, revision.id), (error) => error instanceof BuilderError && error.code === 'not_found');
    await assert.rejects(service.diff(OTHER, id, revision.id), BuilderError);
    await assert.rejects(service.restoreRevision(OWNER, id, '00000000-0000-4000-8000-000000000000'), (error) => error instanceof BuilderError && error.code === 'not_found');
  });

  it('cannot restore while a build is running', async () => {
    const { service, id, store } = await project(runner(setFile('index.html', '<h1>x</h1>')));
    const revision = (await service.history(OWNER, id))[0];
    await store.claimRun(OWNER, id, 'running-build-0001', new Date(Date.now() - 60 * 60 * 1000));
    await assert.rejects(service.restoreRevision(OWNER, id, revision.id), (error) => error instanceof BuilderError && error.code === 'conflict');
  });
});
