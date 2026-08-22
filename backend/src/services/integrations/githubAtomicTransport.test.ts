import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeAtomicWriteApi } from './githubAtomicTransport.js';

test('empty repository initialization is one scoped Contents PUT with Xroga identity', async () => {
  const calls: Array<{ token: string; path: string; init?: RequestInit }> = [];
  const fetcher = async (token: string, path: string, init?: RequestInit): Promise<Response> => {
    calls.push({ token, path, init });
    return new Response(JSON.stringify({ commit: { sha: 'bootstrap-sha' } }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const identity = {
    author: { name: 'Xroga AI', email: 'ai@xroga.com', date: '2026-08-22T00:00:00Z' },
    committer: { name: 'Xroga AI', email: 'ai@xroga.com', date: '2026-08-22T00:00:00Z' },
  };
  const api = makeAtomicWriteApi(fetcher, 'token', 'Xroga', 'blank', {
    commitIdentity: identity,
  });

  const result = await api.initializeEmptyRepository({
    branch: 'main',
    path: '.xroga/bootstrap',
    content: 'neutral marker\n',
    message: 'chore: initialize repository for Xroga build',
  });

  assert.deepEqual(result, { commitSha: 'bootstrap-sha' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.path, '/repos/Xroga/blank/contents/.xroga/bootstrap');
  assert.equal(calls[0]?.init?.method, 'PUT');
  const body = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
  assert.equal(body.branch, 'main');
  assert.equal(body.message, 'chore: initialize repository for Xroga build');
  assert.equal(body.content, Buffer.from('neutral marker\n').toString('base64'));
  assert.deepEqual(body.author, identity.author);
  assert.deepEqual(body.committer, identity.committer);
});

test('empty repository initialization rejects a response without a commit id', async () => {
  const api = makeAtomicWriteApi(
    async () => new Response(JSON.stringify({ commit: {} }), { status: 201 }),
    'token',
    'Xroga',
    'blank',
  );

  await assert.rejects(
    api.initializeEmptyRepository({
      branch: 'main',
      path: '.xroga/bootstrap',
      content: 'neutral marker\n',
      message: 'initialize',
    }),
    /without returning a commit id/i,
  );
});

test('repository emptiness is based on commit existence, not rounded repository size', async () => {
  const calls: string[] = [];
  const api = makeAtomicWriteApi(
    async (_token, path) => {
      calls.push(path);
      return new Response(JSON.stringify([{ sha: 'bootstrap-sha' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
    'token',
    'Xroga',
    'bootstrap-only',
  );

  assert.equal(await api.isRepositoryEmpty(), false);
  assert.deepEqual(calls, ['/repos/Xroga/bootstrap-only/commits?per_page=1']);
});

test('GitHub empty-repository response is recognized without guessing other failures', async () => {
  const emptyApi = makeAtomicWriteApi(
    async () => new Response(JSON.stringify({ message: 'Git Repository is empty.' }), { status: 409 }),
    'token',
    'Xroga',
    'blank',
  );
  assert.equal(await emptyApi.isRepositoryEmpty(), true);

  const inaccessibleApi = makeAtomicWriteApi(
    async () => new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403 }),
    'token',
    'Xroga',
    'private',
  );
  await assert.rejects(inaccessibleApi.isRepositoryEmpty(), /state lookup failed \(403\)/i);
});
