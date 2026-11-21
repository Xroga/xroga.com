import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Real independently authenticated users on the existing disposable CI stack. */
type ApiRequest = (path: string, token?: string, method?: string, body?: unknown) => Promise<Response>;
export function registerTeamMembershipTests(admin: SupabaseClient, request: ApiRequest) {
  test('Team membership isolates identities, rejects browser RPC and serializes removal', async () => {
    const url = process.env.SUPABASE_URL;
    assert.equal(url, 'http://127.0.0.1:54321');
    assert.equal(process.env.XB01_DISPOSABLE_SUPABASE, '1');
    const people = await Promise.all(Array.from({ length: 3 }, async () => {
      const email = `teams-${randomUUID()}@example.invalid`;
      const password = `Synthetic-${randomUUID()}!`;
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      assert.equal(created.error, null);
      assert.ok(created.data.user);
      const client = createClient(url!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
      const signed = await client.auth.signInWithPassword({ email, password });
      assert.equal(signed.error, null);
      assert.equal(signed.data.user?.id, created.data.user.id);
      assert.ok(signed.data.session);
      return { id: created.data.user.id, email, client, token: signed.data.session.access_token };
    }));
    const [owner, member, stranger] = people;
    assert.equal((await request('/api/team-membership')).status, 401);
    assert.equal((await request('/api/team-membership', owner.token)).status, 403);
    const start = new Date(), end = new Date(start.getTime() + 86400000);
    const paid = await admin.rpc('activate_xroga_paid_cycle', { p_user_id: owner.id,
      p_provider_reference: `teams-synthetic-${randomUUID()}`, p_starts_at: start.toISOString(), p_ends_at: end.toISOString() });
    assert.equal(paid.error, null);
    const billingMember = await admin.from('whop_memberships').insert({ user_id: owner.id,
      whop_membership_id: `mem_teams_${randomUUID()}`, whop_plan_id: 'plan_hlV1A10I5QfSP',
      whop_account_id: 'biz_qhYONL4RebGX96', status: 'active' });
    assert.equal(billingMember.error, null);
    assert.equal((await request('/api/team-membership?userId=' + owner.id, stranger.token)).status, 403);
    const teamId = randomUUID();
    const otherId = randomUUID();
    const act = (p_actor: string, p_action: string, args: Record<string, string> = {}) =>
      admin.rpc('xroga_team_membership', { p_actor, p_action, ...args });
    const createdTeam = await request('/api/team-membership', owner.token, 'POST',
      { action: 'create', requestId: teamId, name: 'Synthetic team A' });
    assert.equal(createdTeam.status, 200);
    assert.deepEqual(await createdTeam.json(), { data: { id: teamId } });
    assert.equal((await act(owner.id, 'create', { p_request_id: teamId, p_value: 'Synthetic team A' })).error, null);
    assert.equal((await act(stranger.id, 'create', { p_request_id: otherId, p_value: 'Synthetic team B' })).error, null);
    for (const person of people) {
      assert.ok((await person.client.rpc('xroga_team_membership', { p_actor: owner.id, p_action: 'list' })).error);
      const direct = await person.client.from('xroga_team_members').select('*');
      if (!direct.error) assert.deepEqual(direct.data, []);
    }
    assert.deepEqual((await act(stranger.id, 'list')).data?.map((team: { id: string }) => team.id), [otherId]);
    assert.equal((await act(stranger.id, 'detail', { p_team: teamId })).error?.code, '42501');
    assert.equal((await act(owner.id, 'invite', { p_team: teamId, p_value: member.email })).error, null);
    const pendingRoster = await act(owner.id, 'detail', { p_team: teamId });
    assert.equal(pendingRoster.error, null);
    assert.deepEqual(pendingRoster.data.members.map((row: { userId: string }) => row.userId), [owner.id]);
    assert.equal((await request('/api/team-membership', member.token, 'POST', { action: 'accept', teamId })).status, 403);
    assert.equal((await act(member.id, 'detail', { p_team: teamId })).error?.code, '42501');
    assert.equal((await act(stranger.id, 'accept', { p_team: teamId })).error?.code, '42501');
    const race = await Promise.all([
      act(member.id, 'accept', { p_team: teamId }),
      act(owner.id, 'remove', { p_team: teamId, p_target: member.id }),
    ]);
    assert.equal(race[1].error, null);
    assert.equal((await act(member.id, 'detail', { p_team: teamId })).error?.code, '42501');
    assert.equal((await act(owner.id, 'remove', { p_team: teamId, p_target: owner.id })).error?.code, '42501');
    assert.equal((await act(owner.id, 'detail', { p_team: teamId })).error, null);
    const delivery = (action: string, requestId = randomUUID()) =>
      admin.rpc('xroga_team_claim_invite_email', { p_actor: owner.id, p_team: teamId, p_email: member.email, p_action: action, p_request: requestId });
    const sameRequestId = randomUUID();
    const claims = await Promise.all([delivery('invite', sameRequestId), delivery('invite', sameRequestId)]);
    for (const claim of claims) assert.equal(claim.error, null);
    assert.equal(claims.filter(claim => claim.data.claimed === true).length, 1);
    assert.deepEqual((await delivery('resend')).data, { claimed: false }, 'cooldown blocks resends');
    const revokeRequest = randomUUID();
    assert.deepEqual((await delivery('revoke', revokeRequest)).data, { claimed: false });
    assert.equal((await act(member.id, 'accept', { p_team: teamId })).error?.code, '42501');
    assert.equal((await act(owner.id, 'invite', { p_team: teamId, p_value: member.email })).error, null);
    assert.deepEqual((await delivery('revoke', revokeRequest)).data, { claimed: false });
    assert.equal((await act(member.id, 'list')).data?.[0]?.status, 'pending');
    const expired = await admin.from('xroga_team_members').update({ invited_until: new Date(Date.now()-60000).toISOString() })
      .eq('team_id', teamId).eq('user_id', member.id);
    assert.equal(expired.error, null);
    assert.equal((await act(member.id, 'accept', { p_team: teamId })).error?.code, '42501');
    assert.deepEqual((await delivery('resend')).data, { claimed: false }, 'expired invitations cannot be resent');
    assert.ok((await stranger.client.rpc('xroga_team_claim_invite_email',
      { p_actor: owner.id, p_team: teamId, p_email: member.email, p_action: 'invite', p_request: randomUUID() })).error);
    // The entire isolated stack is torn down after this suite; never delete application teams via client APIs.
  });
}
