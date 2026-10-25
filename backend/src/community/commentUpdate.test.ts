import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CommunityService } from './service.js';

test('comment mutation uses server actor and fails closed on absent, wrong or incomplete receipts', async () => {
  let response: { data: unknown; error: unknown } = { data: null, error: null };
  const db = { rpc: async (name: string, args: Record<string, unknown>) => {
    assert.equal(name, 'update_community_comment_authorized');
    assert.deepEqual(args, { p_actor: 'actor', p_comment: 'comment', p_patch: { body: 'new' } });
    return response;
  } } as unknown as SupabaseClient;
  const service = new CommunityService(db);
  for (const data of [null, [], {}, { id: 'other' }, { id: 'comment', author_id: 'a', post_id: 'p', body: 'old' }]) {
    response = { data, error: null };
    await assert.rejects(service.updateComment('actor', 'comment', { body: 'new' }), { status: 503 });
  }
  response = { data: { id: 'comment', author_id: 'a', post_id: 'p', body: 'new' }, error: null };
  await service.updateComment('actor', 'comment', { body: 'new' });
  for (const [code, status] of [['42501', 403], ['P0002', 404], ['unknown', 503]] as const) {
    response = { data: null, error: { code, message: 'secret' } };
    await assert.rejects(service.updateComment('actor', 'comment', { body: 'new' }), (error: unknown) => {
      assert.equal((error as { status: number }).status, status);
      assert.equal(String(error).includes('secret'), false); return true;
    });
  }
});
