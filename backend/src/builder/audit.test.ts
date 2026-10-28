import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { makeServices, type ServicesFixture } from './servicesFixture.testsupport.js';
import { BuilderError } from './types.js';

/**
 * Regression tests for defects found by the final Batch 2 audit. Each one failed before its fix.
 */
const ALICE = '11111111-1111-4111-8111-111111111111';
const REF = 'abcdefghij1234567890';
const SAAS = 'Build a task-management application with user accounts, dashboard, task creation, editing, completion, deletion, and saved data that remains after a refresh. Different users must not see each other tasks.';

const world = (): ServicesFixture => makeServices([{ id: ALICE, github: { token: 'gh-a', login: 'alice', id: 1 }, supabase: { token: 'sb-a', projects: [{ ref: REF, name: 'Alice DB' }] }, vercel: { token: 'vc-a', id: 'user_a', username: 'alice' } }]);

async function preparedPromotion(f: ServicesFixture) {
  const { project } = await f.builder.createProject(ALICE, { prompt: SAAS, requestKey: `audit-${Math.random().toString(36).slice(2, 10)}` });
  const bind = await f.services.data.prepareBind(ALICE, project.id, { operationKey: 'audit-bind-000001', projectRef: REF });
  await f.services.data.approve(ALICE, project.id, bind.operation.id, bind.operation.planDigest);
  await f.services.data.executeBind(ALICE, project.id, bind.operation.id);
  const migration = await f.services.data.prepareMigration(ALICE, project.id, { operationKey: 'audit-migrate-0001' });
  await f.services.data.approve(ALICE, project.id, migration.operation.id, migration.operation.planDigest);
  await f.services.data.executeMigration(ALICE, project.id, migration.operation.id);
  const preview = await f.services.hosting.preparePreview(ALICE, project.id, { operationKey: 'audit-prev-000001', scopeId: null, projectName: 'audit-app' });
  await f.services.hosting.approve(ALICE, project.id, preview.operation.id, preview.operation.planDigest);
  await f.services.hosting.executePreview(ALICE, project.id, preview.operation.id);
  const promotion = await f.services.hosting.preparePromotion(ALICE, project.id, { operationKey: 'audit-prod-000001', previewOperationId: preview.operation.id });
  return { projectId: project.id, promotion, preview };
}

describe('audit: an operation can only be approved, cancelled or run through its own provider and action', () => {
  it('a production release cannot be approved with the digest alone through a preview, GitHub or Supabase approval', async () => {
    const f = world();
    const { projectId, promotion } = await preparedPromotion(f);
    const digest = promotion.operation.planDigest;
    for (const attempt of [
      f.services.hosting.approve(ALICE, projectId, promotion.operation.id, digest),
      f.services.github.approve(ALICE, projectId, promotion.operation.id, { digest }),
      f.services.data.approve(ALICE, projectId, promotion.operation.id, digest),
    ]) await assert.rejects(attempt, (error) => error instanceof BuilderError && error.code === 'not_found');
    await assert.rejects(f.services.hosting.executePromotion(ALICE, projectId, promotion.operation.id), BuilderError);
    assert.equal(f.vercel.promoted.length, 0, 'nothing was published');
    // The real path still works, and needs the typed confirmation.
    await assert.rejects(f.services.hosting.approvePromotion(ALICE, projectId, promotion.operation.id, { digest, confirmation: 'yes' }), BuilderError);
    await f.services.hosting.approvePromotion(ALICE, projectId, promotion.operation.id, { digest, confirmation: (promotion.plan as { confirmationPhrase: string }).confirmationPhrase });
    assert.equal((await f.services.hosting.executePromotion(ALICE, projectId, promotion.operation.id)).status, 'succeeded');
  });

  it('GitHub, Supabase and Vercel services never approve, cancel or run another provider\'s operation', async () => {
    const f = world();
    const { projectId, promotion, preview } = await preparedPromotion(f);
    const vercelOps = [promotion.operation.id, preview.operation.id];
    for (const id of vercelOps) {
      await assert.rejects(f.services.github.cancel(ALICE, projectId, id), (error) => error instanceof BuilderError && error.code === 'not_found');
      await assert.rejects(f.services.github.execute(ALICE, projectId, id), (error) => error instanceof BuilderError && error.code === 'not_found');
      await assert.rejects(f.services.data.cancel(ALICE, projectId, id), (error) => error instanceof BuilderError && error.code === 'not_found');
    }
    // The Vercel production operation is untouched by all of that.
    const [op] = (await f.phase2.listOperations(ALICE, projectId)).filter((row) => row.id === promotion.operation.id);
    assert.equal(op.status, 'prepared');
    const repo = await f.services.github.prepareCreate(ALICE, projectId, { operationKey: 'audit-repo-000001', owner: 'alice', repositoryName: 'audit-app' });
    await assert.rejects(f.services.hosting.cancel(ALICE, projectId, repo.operation.id), (error) => error instanceof BuilderError && error.code === 'not_found');
    await assert.rejects(f.services.hosting.approve(ALICE, projectId, repo.operation.id, repo.operation.planDigest), (error) => error instanceof BuilderError && error.code === 'not_found');
  });
});

describe('audit: a Vercel preview can be retried and redeployed without orphaning the project it created', () => {
  const deploy = async (f: ServicesFixture, projectId: string, key: string, extra: { projectName?: string } = {}) => {
    const prepared = await f.services.hosting.preparePreview(ALICE, projectId, { operationKey: key, scopeId: null, ...extra });
    await f.services.hosting.approve(ALICE, projectId, prepared.operation.id, prepared.operation.planDigest);
    return { prepared, executed: await f.services.hosting.executePreview(ALICE, projectId, prepared.operation.id).catch((error) => error as Error) };
  };

  it('retrying after the build failed resumes the project that attempt created', async () => {
    const f = world();
    const { project } = await f.builder.createProject(ALICE, { prompt: SAAS, requestKey: 'audit-retry-0001' });
    f.vercel.failures = { deployment: 'error' };
    const first = await deploy(f, project.id, 'audit-retry-prev-1', { projectName: 'retry-app' });
    assert.ok(first.executed instanceof Error, 'the build failed');
    assert.equal(f.vercel.projects.size, 1, 'the project exists');
    f.vercel.failures = {};
    await f.services.hosting.approve(ALICE, project.id, first.prepared.operation.id, first.prepared.operation.planDigest);
    const retried = await f.services.hosting.executePreview(ALICE, project.id, first.prepared.operation.id);
    assert.equal(retried.status, 'succeeded', 'the retry adopted its own project instead of refusing');
    assert.equal(f.vercel.projects.size, 1, 'no second project was created');
  });

  it('a newer version goes to the same project, and a same-named project the customer already owns is never adopted', async () => {
    const f = world();
    const { project } = await f.builder.createProject(ALICE, { prompt: SAAS, requestKey: 'audit-redeploy-0001' });
    const first = await deploy(f, project.id, 'audit-redeploy-p1', { projectName: 'redeploy-app' });
    assert.equal((first.executed as { status: string }).status, 'succeeded');
    const second = await f.services.hosting.preparePreview(ALICE, project.id, { operationKey: 'audit-redeploy-p2', scopeId: null });
    assert.equal(second.plan.project.name, 'redeploy-app');
    assert.equal(second.plan.project.mode, 'existing');

    // A project of the customer's with that name that Xroga did not create stays off limits.
    const g = world();
    const { project: other } = await g.builder.createProject(ALICE, { prompt: SAAS, requestKey: 'audit-redeploy-0002' });
    await g.vercel.createProject('vc-a', { kind: 'personal', id: null, slug: 'alice', name: 'alice' }, { name: 'their-own-app', framework: null });
    await assert.rejects(g.services.hosting.preparePreview(ALICE, other.id, { operationKey: 'audit-redeploy-p3', scopeId: null, projectName: 'their-own-app' }), /already exists/);
  });
});
