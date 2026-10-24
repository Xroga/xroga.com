import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CommunityService } from './service.js';
test('post mutation receipts bind operation, identity and every requested field', async () => {
  let response: { data: unknown; error: unknown } = { data: null, error: null };
  let last: Record<string, unknown> = {};
  const db = { rpc: async (name: string, args: Record<string, unknown>) => {
    assert.equal(name, 'mutate_community_post_authorized'); last = args; return response;
  } } as unknown as SupabaseClient;
  const service = new CommunityService(db);
  for (const data of [null, {}, { operation: 'update', post: { id: 'p', author_id: 'a' } },
    { operation: 'delete', post: { id: 'foreign', author_id: 'a' } }]) {
    response = { data, error: null };
    await assert.rejects(service.deletePost('actor', 'p'), { status: 503 });
  }
  response = { data: { operation: 'delete', post: { id: 'p', author_id: 'a' } }, error: null };
  await service.deletePost('actor', 'p');
  assert.deepEqual(last, { p_actor: 'actor', p_post: 'p', p_operation: 'delete', p_patch: {} });
  response = { data: { operation: 'update', post: { id: 'p', author_id: 'a', title: 'wrong' } }, error: null };
  await assert.rejects(service.updatePost('actor', 'p', { title: 'Correct title' }), { status: 503 });
  response = { data: { operation: 'moderate', post: { id: 'p', author_id: 'a', is_locked: false } }, error: null };
  await assert.rejects(service.moderatePost('actor', 'p', { isLocked: true }), { status: 503 });
  for (const [code,status] of [['42501',403],['P0002',404],['P0003',423],['unknown',503]] as const) {
    response = { data: null, error: { code, message: 'secret' } };
    await assert.rejects(service.deletePost('actor','p'), { status });
  }
});
