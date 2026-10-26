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

describe('audit: credentials in generated source are refused before they can be stored or leave Xroga', () => {
  const jwt = (role: string) => `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ iss: 'supabase', role, ref: 'abcdefghij' })).toString('base64url')}.${'a'.repeat(43)}`;

  it('refuses a service-role JWT, Supabase secret key, AWS, Stripe and Slack keys, and allows the public anon key', async () => {
    const { looksLikeSecret, assertSnapshotAcceptable } = await import('./snapshot.js');
    for (const secret of [jwt('service_role'), 'sb_secret_' + 'a'.repeat(30), 'AKIA' + 'A'.repeat(16), 'sk_live_' + 'a'.repeat(24), 'xoxb-' + '1'.repeat(24), `const key = "${jwt('service_role')}";`]) {
      assert.equal(looksLikeSecret(secret), true, secret.slice(0, 20));
      assert.throws(() => assertSnapshotAcceptable([{ path: 'lib/config.ts', content: secret }]), BuilderError);
    }
    assert.equal(looksLikeSecret(`const anon = "${jwt('anon')}";`), false, 'the anon key is public by design');
    assert.equal(looksLikeSecret('const note = "eyJ.not.a.token";'), false);
  });
});

describe('audit: one GitHub repository per project, and a release only by the account that tested the preview', () => {
  it('a second repository for the same project is refused; sync is the way to add versions', async () => {
    const f = world();
    const { project } = await f.builder.createProject(ALICE, { prompt: SITE, requestKey: 'audit-onerepo-0001' });
    const first = await f.services.github.prepareCreate(ALICE, project.id, { operationKey: 'audit-repo-one-0001', owner: 'alice', repositoryName: 'one-repo' });
    await f.services.github.approve(ALICE, project.id, first.operation.id, { digest: first.operation.planDigest });
    await f.services.github.execute(ALICE, project.id, first.operation.id);
    await assert.rejects(f.services.github.prepareCreate(ALICE, project.id, { operationKey: 'audit-repo-two-0001', owner: 'alice', repositoryName: 'two-repo' }), (error) => error instanceof BuilderError && /already has a GitHub repository/.test(error.message));
  });

  it('production is refused when the connected Vercel account is not the one that built the preview', async () => {
    const f = world();
    const { project } = await f.builder.createProject(ALICE, { prompt: SITE, requestKey: 'audit-viewer-0001' });
    const preview = await f.services.hosting.preparePreview(ALICE, project.id, { operationKey: 'audit-viewer-prev-1', scopeId: null, projectName: 'viewer-app' });
    await f.services.hosting.approve(ALICE, project.id, preview.operation.id, preview.operation.planDigest);
    await f.services.hosting.executePreview(ALICE, project.id, preview.operation.id);
    // The customer disconnects and connects a different Vercel account.
    f.vercel.addAccount('vc-other', { id: 'user_other', username: 'someone-else' });
    f.tokens.vercel.set(ALICE, 'vc-other');
    await assert.rejects(f.services.hosting.preparePromotion(ALICE, project.id, { operationKey: 'audit-viewer-prod-1', previewOperationId: preview.operation.id }), (error) => error instanceof BuilderError && /not the one that built/.test(error.message));
  });
});
