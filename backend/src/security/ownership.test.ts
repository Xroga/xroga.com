import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { createTenantContext } from './tenantContext.js';
import { requireOwnedResource, requireOwnedFile, type OwnedResourceKind } from './ownership.js';
import { TenantAccessError } from './tenantErrors.js';

const context = createTenantContext({ userId: '11111111-1111-4111-8111-111111111111', via: 'local_jwt' });
test('all discovered direct-owner resources send owner predicates and never retrieve secrets', async () => {
  const seen: URL[] = [];
  const client = createClient('http://127.0.0.1:1', 'fixture-only-key', { global: {fetch: async input => {
    const url = new URL(String(input)); seen.push(url);
    return new Response(JSON.stringify({id:'fixture'}), {headers:{'Content-Type':'application/json'}});
  }}, auth:{persistSession:false,autoRefreshToken:false} });
  for (const kind of ['project','chat','provider_connection','run','runtime_session','cost_record'] as OwnedResourceKind[]) await requireOwnedResource(context, kind, 'fixture-id', client);
  assert.equal(seen.length, 6);
  for (const url of seen) { assert.equal(url.searchParams.get('user_id'), `eq.${context.userId}`); assert.ok(['id','session_id'].includes(url.searchParams.get('select')!)); }
  await requireOwnedFile(context, 'file-fixture', client);
  assert.equal(seen[6].searchParams.get('projects.user_id'), `eq.${context.userId}`);
  assert.equal(seen[6].searchParams.get('select'), 'id,projects!inner(user_id)');
});
test('foreign/missing row is 404; database failures are safe 503; malformed IDs send no request', async () => {
  let requests = 0, failure = false;
  const client = createClient('http://127.0.0.1:1', 'fixture-only-key', {global:{fetch:async () => {
    requests++; return new Response(JSON.stringify(failure ? {message:'SECRET_DIAGNOSTIC_CANARY',code:'TEST'} : null), {status:failure?500:200,headers:{'Content-Type':'application/json'}});
  }}, auth:{persistSession:false,autoRefreshToken:false} });
  await assert.rejects(requireOwnedResource(context, 'project', 'foreign', client), (error:unknown) => error instanceof TenantAccessError && error.status === 404);
  failure = true;
  await assert.rejects(requireOwnedResource(context, 'project', 'own', client), (error:unknown) => error instanceof TenantAccessError && error.status === 503 && !error.message.includes('CANARY'));
  const before = requests;
  await assert.rejects(requireOwnedResource(context, 'project', '', client), TenantAccessError);
  await assert.rejects(requireOwnedFile(context, ' ', client), TenantAccessError);
  await assert.rejects(requireOwnedResource({...context}, 'project', 'own', client), TenantAccessError);
  assert.equal(requests, before);
});

test('injected clients cannot turn invalid resource kinds or malformed file IDs into a query', async () => {
  let requests = 0;
  const client = createClient('http://127.0.0.1:1', 'fixture-only', {
    auth: {persistSession:false,autoRefreshToken:false},
    global: {fetch:async () => { requests++; throw new Error('Must not be reached'); }},
  });
  for (const kind of ['__proto__', 'constructor', 'toString', 'unapproved_table']) {
    await assert.rejects(requireOwnedResource(context, kind as OwnedResourceKind, 'valid-id', client), {status:404});
  }
  for (const id of [null, undefined, 17, {}, '', ' ', 'x'.repeat(201)]) {
    await assert.rejects(requireOwnedFile(context, id as string, client), {status:404});
  }
  await assert.rejects(requireOwnedFile({...context}, 'valid-id', client), {status:401});
  assert.equal(requests, 0);
});
