import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ProjectFile } from '../ai/patches.js';
import type { UniversalBuildOutcome } from '../synthesis/universalEntrypoint.js';
import { readZip } from './export/archive.js';
import { classifyBuilderIntent } from './intent.js';
import { makeServices } from './servicesFixture.testsupport.js';
import type { BuildRunner } from './service.js';
import { BuilderError } from './types.js';

/**
 * The complete customer journey across all three phases, through the production services in one
 * flow: describe -> durable project -> build -> browser QA -> follow-up -> history/restore -> verified
 * source ZIP -> GitHub -> Supabase -> Vercel preview -> remote tests -> production -> provenance.
 * Only the providers (GitHub, Supabase, Vercel), the browser driver and the coding engine are stand-ins;
 * every service, store, approval gate and state machine is the production one.
 */
const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const REF = 'abcdefghij1234567890';
const SAAS = 'Build a task-management application with user accounts, dashboard, task creation, editing, completion, deletion, and saved data that remains after a refresh. Different users must not see each other tasks.';

function outcome(files: readonly ProjectFile[]): UniversalBuildOutcome {
  return {
    ran: true,
    result: { outcome: 'completed', phaseReached: 'complete', plan: null, securityControls: [], files, commitSha: null, evidence: [], blockers: [], mutationBegan: true, verified: true, reason: 'ok' },
    goalContract: null, buildContract: null, routing: { selectedModel: null, fallbacks: [], reason: 'test', excluded: [] },
  } as unknown as UniversalBuildOutcome;
}

/** The canonical engine's behaviour as seen by the builder: applies the request to the current files and commits once. */
const engine = (): BuildRunner => async ({ existingFiles, prompt, commit }) => {
  const marker = /search filter/i.test(prompt) ? 'features/search.txt' : /dark mode/i.test(prompt) ? 'features/theme.txt' : 'features/generated.txt';
  const next: ProjectFile[] = [...existingFiles.filter((file) => file.path !== marker), { path: marker, content: `implements: ${prompt.slice(0, 80)}` }];
  await commit({ files: next, message: 'change' });
  return outcome(next);
};

describe('Batch 2 end to end: one customer, one project, every stage connected', () => {
  it('takes a plain-language request all the way to a verified, exported, database-backed, published app, with truthful provenance', async () => {
    const f = makeServices([
      { id: ALICE, github: { token: 'gh-a', login: 'alice', id: 1 }, supabase: { token: 'sb-a', projects: [{ ref: REF, name: 'Alice DB' }] }, vercel: { token: 'vc-a', id: 'user_a', username: 'alice' } },
      { id: BOB, github: { token: 'gh-b', login: 'bob', id: 2 }, supabase: { token: 'sb-b', projects: [{ ref: 'zzzzzzzzzz9999999999', name: 'Bob DB' }] } },
    ], { runBuild: engine() });

    // 1-3. Plain language is recognised as a new product, and a retry of the same message creates the same project.
    assert.equal(classifyBuilderIntent(SAAS, { hasProject: false }), 'new_product');
    const first = await f.builder.createProject(ALICE, { prompt: SAAS, requestKey: 'journey-0001' });
    const again = await f.builder.createProject(ALICE, { prompt: SAAS, requestKey: 'journey-0001' });
    assert.equal(first.created, true);
    assert.equal(again.created, false);
    assert.equal(again.project.id, first.project.id);
    const id = first.project.id;
    assert.equal(first.project.starter.starterId, 'xroga-nextjs-app', 'an approved starter with recorded provenance');

    // 4. The engine builds; the result is a durable revision, and nothing claims a preview that did not run.
    const built = await f.builder.generate(ALICE, id, { prompt: SAAS, launchPreview: false });
    const afterBuild = await f.builder.history(ALICE, id);
    assert.equal(afterBuild.length, 2, 'starter revision plus the generated revision');
    assert.notEqual(built.project.state, 'verified', 'not verified before it was tested');

    // 5. Browser QA: without a running app it does not pass. With one, every check that can run does, and the
    // persistence check (which needs a disposable database) is reported as not run, so the result is PARTIAL, never a false PASS.
    f.runtime.available = false;
    const none = await f.services.qa.runQa(ALICE, id);
    assert.equal(none.report.status, 'pending_runtime');
    f.runtime.available = true;
    const qa = await f.services.qa.runQa(ALICE, id);
    assert.equal(qa.report.status, 'partial');
    assert.equal(qa.report.failedChecks, 0);
    assert.ok(qa.report.pendingChecks >= 1 && qa.report.executedChecks >= 6);
    assert.equal((await f.builder.history(ALICE, id))[0].verificationStatus, 'partial');

    // 6. A follow-up in conversation changes the SAME project and keeps the earlier verified revision.
    assert.equal(classifyBuilderIntent('Add a customer search filter and make the dashboard dark mode', { hasProject: true }), 'followup');
    const verifiedRevision = (await f.builder.history(ALICE, id))[0];
    await f.builder.generate(ALICE, id, { prompt: 'Add a customer search filter', launchPreview: false });
    const history = await f.builder.history(ALICE, id);
    assert.equal(history.length, 3);
    assert.equal(history[0].parentRevisionId, verifiedRevision.id, 'a linear, recoverable history');
    assert.equal((await f.builder.getState(ALICE, id)).project.id, id, 'still one project');
    const diff = await f.builder.diff(ALICE, id, history[0].id);
    assert.ok(diff.files.some((file) => file.path === 'features/search.txt' && file.status === 'added'));

    // 7. Undo restores a known revision as a NEW revision; nothing external is touched.
    const restored = await f.builder.restoreRevision(ALICE, id, verifiedRevision.id);
    assert.equal(restored.unchanged, false);
    assert.equal((await f.builder.history(ALICE, id)).length, 4);
    assert.equal(f.github.repos?.size ?? 0, 0);
    assert.equal(f.supabase.appliedSql.length, 0);
    assert.equal(f.vercel.projects.size, 0);

    // 8. The verified source archive reads back with every file and a checksum manifest, and carries no credentials.
    const archive = await f.services.exporter.exportRevision(ALICE, id, { runId: 'journey-export-0001' });
    const entries = readZip(archive.buffer);
    assert.ok(entries.some((entry) => entry.path === 'XROGA-EXPORT.json'));
    assert.ok(entries.some((entry) => entry.path === 'package.json'));
    assert.ok(!entries.some((entry) => /\.env($|\.)/.test(entry.path) && !/example|sample/i.test(entry.path)));

    // 9. GitHub: nothing exists until the user approves the exact plan; then it is created in THEIR account.
    const repo = await f.services.github.prepareCreate(ALICE, id, { operationKey: 'journey-repo-0001', owner: 'alice', repositoryName: 'journey-app' });
    assert.equal(f.github.repos?.size ?? 0, 0, 'preparing creates nothing');
    await assert.rejects(f.services.github.execute(ALICE, id, repo.operation.id), BuilderError);
    await f.services.github.approve(ALICE, id, repo.operation.id, { digest: repo.operation.planDigest });
    const pushed = await f.services.github.execute(ALICE, id, repo.operation.id);
    assert.equal(pushed.status, 'succeeded');
    assert.equal((await f.services.github.binding(ALICE, id))?.repository.owner, 'alice');

    // 10. Supabase: choose their project, review the exact SQL, approve, read back.
    const bind = await f.services.data.prepareBind(ALICE, id, { operationKey: 'journey-bind-0001', projectRef: REF });
    await f.services.data.approve(ALICE, id, bind.operation.id, bind.operation.planDigest);
    await f.services.data.executeBind(ALICE, id, bind.operation.id);
    const migration = await f.services.data.prepareMigration(ALICE, id, { operationKey: 'journey-migrate-001' });
    assert.match((migration.plan as { sql: string }).sql, /enable row level security/i);
    await f.services.data.approve(ALICE, id, migration.operation.id, migration.operation.planDigest);
    const applied = await f.services.data.executeMigration(ALICE, id, migration.operation.id);
    assert.equal((applied.receipt as { verified: { rlsEnabled: boolean } }).verified.rlsEnabled, true);

    // 11. Vercel: preview of the exact head revision, remote tests, then a separately confirmed production release.
    const preview = await f.services.hosting.preparePreview(ALICE, id, { operationKey: 'journey-prev-0001', scopeId: null, projectName: 'journey-app' });
    await f.services.hosting.approve(ALICE, id, preview.operation.id, preview.operation.planDigest);
    const deployed = await f.services.hosting.executePreview(ALICE, id, preview.operation.id);
    assert.equal(deployed.status, 'succeeded');
    assert.equal(f.vercel.promoted.length, 0, 'a preview is not production');
    const promotion = await f.services.hosting.preparePromotion(ALICE, id, { operationKey: 'journey-prod-0001', previewOperationId: preview.operation.id });
    await f.services.hosting.approvePromotion(ALICE, id, promotion.operation.id, { digest: promotion.operation.planDigest, confirmation: (promotion.plan as { confirmationPhrase: string }).confirmationPhrase });
    assert.equal((await f.services.hosting.executePromotion(ALICE, id, promotion.operation.id)).status, 'succeeded');
    assert.equal(f.vercel.promoted.length, 1);

    // 12. Provenance for the head revision says exactly what happened, and nothing more.
    const head = (await f.services.provenance(ALICE, id))[0];
    assert.deepEqual([head.github.level, head.supabase.level, head.vercelPreview.level, head.remoteTests.level, head.production.level], ['RECORDED', 'RECORDED', 'RECORDED', 'RECORDED', 'RECORDED']);

    // Regression: once database and hosting operations exist on the project, GitHub sync still works and maps revisions to commits.
    await f.builder.generate(ALICE, id, { prompt: 'Make the dashboard dark mode', launchPreview: false });
    const sync = await f.services.github.prepareSync(ALICE, id, { operationKey: 'journey-sync-0001' });
    await f.services.github.approve(ALICE, id, sync.operation.id, { digest: sync.operation.planDigest });
    assert.equal((await f.services.github.execute(ALICE, id, sync.operation.id)).status, 'succeeded');
    assert.equal((await f.services.github.binding(ALICE, id))?.commits.length, 2);
    assert.equal((await f.services.github.operations(ALICE, id)).every((operation) => operation.provider === 'github'), true);

    // Another customer sees none of it and can change none of it.
    await assert.rejects(f.builder.getState(BOB, id), (error) => error instanceof BuilderError && error.code === 'not_found');
    await assert.rejects(f.services.provenance(BOB, id), BuilderError);
    await assert.rejects(f.services.github.prepareSync(BOB, id, { operationKey: 'bob-sync-000001' }), BuilderError);
    await assert.rejects(f.services.exporter.exportRevision(BOB, id, { runId: 'bob-export-000001' }), BuilderError);
    await assert.rejects(f.builder.generate(BOB, id, { prompt: 'take it', launchPreview: false }), BuilderError);
    assert.equal((await f.builder.history(ALICE, id)).length, 5, "Bob's attempts changed nothing");
  });

  it('refuses a second build while one is running, and a failed build leaves the verified revision intact', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let calls = 0;
    const f = makeServices([{ id: ALICE }], {
      runBuild: async ({ existingFiles, commit }) => {
        calls += 1;
        if (calls === 1) await gate;
        if (calls === 3) return { ...outcome(existingFiles), result: { ...outcome(existingFiles).result, outcome: 'failed', verified: false, reason: 'boom' } } as unknown as UniversalBuildOutcome;
        const next = [...existingFiles, { path: `f${calls}.txt`, content: String(calls) }];
        await commit({ files: next, message: 'm' });
        return outcome(next);
      },
    });
    const { project } = await f.builder.createProject(ALICE, { prompt: SAAS, requestKey: 'journey-0002' });
    const running = f.builder.generate(ALICE, project.id, { prompt: 'first', launchPreview: false });
    await new Promise((resolve) => setTimeout(resolve, 20));
    await assert.rejects(f.builder.generate(ALICE, project.id, { prompt: 'second', launchPreview: false }), /already running/);
    release();
    await running;
    const headBefore = (await f.builder.history(ALICE, project.id))[0].id;
    await f.builder.generate(ALICE, project.id, { prompt: 'third', launchPreview: false });
    await f.builder.generate(ALICE, project.id, { prompt: 'fourth-fails', launchPreview: false });
    const after = await f.builder.history(ALICE, project.id);
    assert.ok(after.some((revision) => revision.id === headBefore), 'earlier revisions are never lost');
  });
});
