import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { readZip } from './export/archive.js';
import { makeServices, type ServicesFixture } from './servicesFixture.testsupport.js';
import { BuilderError } from './types.js';

/** Regression tests for the final Batch 2 audit: what leaves Xroga is complete, and production needs the database applied. */
const ALICE = '11111111-1111-4111-8111-111111111111';
const REF = 'abcdefghij1234567890';
const SAAS = 'Build a task-management application with user accounts, dashboard, task creation, editing, completion, deletion, and saved data that remains after a refresh. Different users must not see each other tasks.';
const SITE = 'Build a premium modern website for a home renovation company with Home, Services, About, Projects and Contact pages.';

const world = (): ServicesFixture => makeServices([{ id: ALICE, github: { token: 'gh-a', login: 'alice', id: 1 }, supabase: { token: 'sb-a', projects: [{ ref: REF, name: 'Alice DB' }] }, vercel: { token: 'vc-a', id: 'user_a', username: 'alice' } }]);

describe('audit: a database-backed project leaves Xroga complete', () => {
  it('the ZIP and the GitHub files carry the reviewed migration and a safe .env.example; a static site gets neither', async () => {
    const f = world();
    const { project } = await f.builder.createProject(ALICE, { prompt: SAAS, requestKey: 'audit-delivery-001' });
    const archive = await f.services.exporter.exportRevision(ALICE, project.id, { runId: 'audit-export-000001' });
    const entries = readZip(archive.buffer);
    const migration = entries.find((entry) => entry.path.startsWith('supabase/migrations/'));
    assert.ok(migration, 'the migration is version-controlled with the source');
    assert.match(migration.data.toString('utf8'), /enable row level security/i);
    const env = entries.find((entry) => entry.path === '.env.example')?.data.toString('utf8') ?? '';
    assert.match(env, /NEXT_PUBLIC_SUPABASE_URL=/);
    assert.match(env, /NEXT_PUBLIC_SUPABASE_ANON_KEY=/);
    assert.ok(archive.manifest.files.some((file) => file.path.startsWith('supabase/migrations/')), 'it is verified like every other file');

    const files = f.services.github.filesFor(project, (await f.builder.headFiles(ALICE, project)).revision!);
    assert.ok(files.some((file) => file.path.startsWith('supabase/migrations/')));

    const site = await f.builder.createProject(ALICE, { prompt: SITE, requestKey: 'audit-delivery-002' });
    const siteArchive = await f.services.exporter.exportRevision(ALICE, site.project.id, { runId: 'audit-export-000002' });
    assert.ok(!readZip(siteArchive.buffer).some((entry) => entry.path.startsWith('supabase/')));
  });

  it('production is blocked until the app\'s database schema has been applied, then allowed', async () => {
    const f = world();
    const { project } = await f.builder.createProject(ALICE, { prompt: SAAS, requestKey: 'audit-delivery-003' });
    const preview = await f.services.hosting.preparePreview(ALICE, project.id, { operationKey: 'audit-dprev-000001', scopeId: null, projectName: 'audit-db-app' });
    await f.services.hosting.approve(ALICE, project.id, preview.operation.id, preview.operation.planDigest);
    await f.services.hosting.executePreview(ALICE, project.id, preview.operation.id);
    await assert.rejects(f.services.hosting.preparePromotion(ALICE, project.id, { operationKey: 'audit-dprod-000001', previewOperationId: preview.operation.id }), (error) => error instanceof BuilderError && /database schema/.test(error.message));
    const bind = await f.services.data.prepareBind(ALICE, project.id, { operationKey: 'audit-dbind-000001', projectRef: REF });
    await f.services.data.approve(ALICE, project.id, bind.operation.id, bind.operation.planDigest);
    await f.services.data.executeBind(ALICE, project.id, bind.operation.id);
    const migration = await f.services.data.prepareMigration(ALICE, project.id, { operationKey: 'audit-dmig-0000001' });
    await f.services.data.approve(ALICE, project.id, migration.operation.id, migration.operation.planDigest);
    await f.services.data.executeMigration(ALICE, project.id, migration.operation.id);
    assert.deepEqual(await f.services.data.databaseStatus(ALICE, project.id), { required: true, applied: true });
    const promotion = await f.services.hosting.preparePromotion(ALICE, project.id, { operationKey: 'audit-dprod-000002', previewOperationId: preview.operation.id });
    assert.equal(promotion.created, true);
  });
});
