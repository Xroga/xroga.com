import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { InMemoryProjectRuntimeStore, SupabaseProjectRuntimeStore, persistSoftwareProjectRevision, projectWorkspaceFingerprint } from './store.js';
import type { SoftwareProject } from '../softwareProject.js';

const owner = '11111111-1111-4111-8111-111111111111';
function fixture(): SoftwareProject {
  return { projectId: 'logical-project', runId: 'run', contract: { projectId: 'logical-project', runId: 'run' },
    workspace: { files: [{ path: 'index.html', content: 'OWNER_ORIGINAL_FILE' }] } } as SoftwareProject;
}

test('revision persistence rejects misbound snapshots, malformed receipts and mutable caller races', async () => {
  let requests = 0;
  let override: Record<string, unknown> | null = null;
  let unavailable = false;
  let onPersist: (() => void) | undefined;
  const persisted: SoftwareProject[] = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://localhost');
    assert.equal(url.pathname, '/rest/v1/project_runtime_revisions');
    assert.equal(req.method, 'POST');
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw); requests++;
    persisted.push(body.software_project);
    onPersist?.();
    res.writeHead(unavailable ? 403 : 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(unavailable ? { message: 'PRIVATE_REVISION_DATABASE_CANARY' } : {
      ...body, revision_id: '22222222-2222-4222-8222-222222222222', revision_number: 1, created_at: new Date().toISOString(), ...override,
    }));
  });
  const previous = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    process.env.SUPABASE_URL = `http://127.0.0.1:${address.port}`;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-loopback-only';
    const store = new SupabaseProjectRuntimeStore();
    const memory = new InMemoryProjectRuntimeStore();
    for (const changed of [{ projectId: 'other' }, { runId: 'other' }, { contract: { projectId: 'other', runId: 'run' } }, { contract: null }]) {
      const bad = { ...fixture(), ...changed } as SoftwareProject;
      await assert.rejects(store.saveRevision(owner, bad), /identity is invalid/);
      await assert.rejects(memory.saveRevision(owner, bad), /identity is invalid/);
    }
    assert.equal(requests, 0);
    for (override of [{ revision_id: null }, { revision_id: 'not-a-uuid' }, { revision_number: null }, { revision_number: true },
      { revision_number: 0 }, { revision_number: 1.5 }, { created_at: 'invalid' }, { user_id: 'other' },
      { project_id: 'other' }, { run_id: 'other' }, { workspace_fingerprint: 'other' }]) {
      await assert.rejects(store.saveRevision(owner, fixture()), /persistence evidence is invalid/);
    }
    override = null;
    const source = fixture();
    const original = structuredClone(source);
    onPersist = () => {
      (source as unknown as { projectId: string }).projectId = 'changed-after-insert';
      (source.workspace.files[0] as { content: string }).content = 'CHANGED_AFTER_INSERT';
    };
    const receipt = await store.saveRevision(owner, source);
    assert.deepEqual(receipt.project, original);
    assert.deepEqual(persisted.at(-1), original);
    assert.equal(receipt.projectId, original.projectId);
    assert.equal(receipt.workspaceFingerprint, projectWorkspaceFingerprint(original));
    assert.notEqual(source.projectId, original.projectId);
    onPersist = undefined;
    unavailable = true;
    const failed = await persistSoftwareProjectRevision(owner, fixture());
    assert.equal(failed.saved, false); assert.equal(failed.revisionId, null);
    assert.doesNotMatch(JSON.stringify(failed), /PRIVATE_REVISION_DATABASE_CANARY/);
  } finally {
    if (previous.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previous.key;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
