import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  communityListSchema,
  createCommunityCommentSchema,
  createCommunityPostSchema,
  moderateCommunityPostSchema,
} from './schemas.js';
import { canPermanentlyDelete, canUseOfficialIdentity, isCommunityStaff } from './types.js';

const migration = readFileSync(new URL('../../../supabase/migrations/20260729192159_community_platform.sql', import.meta.url), 'utf8');
const publicReadPolicyMigration = readFileSync(new URL('../../../supabase/migrations/20260730020500_community_split_public_read_policies.sql', import.meta.url), 'utf8');

test('community post validation enforces category and content bounds', () => {
  assert.equal(createCommunityPostSchema.safeParse({ category: 'bug', title: 'Valid title', body: 'A reproducible bug report.' }).success, true);
  assert.equal(createCommunityPostSchema.safeParse({ category: 'other', title: 'no', body: 'short' }).success, false);
  assert.equal(createCommunityPostSchema.safeParse({ category: 'feedback', title: 'Valid title', body: 'x'.repeat(5001) }).success, false);
});

test('list input is bounded and strips unknown administration parameters', () => {
  assert.equal(communityListSchema.safeParse({ limit: 51 }).success, false);
  assert.equal(communityListSchema.safeParse({ filter: 'new', role: 'owner' }).success, false);
});

test('official identities are validated and role authorization is explicit', () => {
  assert.equal(createCommunityCommentSchema.safeParse({ body: 'Helpful answer', officialIdentity: 'fake_ceo' }).success, false);
  assert.equal(canUseOfficialIdentity('member', 'xroga_team'), false);
  assert.equal(canUseOfficialIdentity('moderator', 'xroga_team'), true);
  assert.equal(canUseOfficialIdentity('admin', 'xroga_owner'), false);
  assert.equal(canUseOfficialIdentity('owner', 'xroga_owner'), true);
});

test('permanent deletion and staff permissions follow role boundaries', () => {
  assert.equal(isCommunityStaff('member'), false);
  assert.equal(isCommunityStaff('moderator'), true);
  assert.equal(canPermanentlyDelete('moderator'), false);
  assert.equal(canPermanentlyDelete('admin'), true);
  assert.equal(canPermanentlyDelete('owner'), true);
});

test('moderation schema rejects member-write fields and unknown payload keys', () => {
  assert.equal(moderateCommunityPostSchema.safeParse({ status: 'planned', authorId: crypto.randomUUID() }).success, false);
  assert.equal(moderateCommunityPostSchema.safeParse({ isPinned: true, isHidden: false }).success, true);
});

test('migration establishes all durable tables and duplicate-vote protection', () => {
  for (const table of ['community_posts', 'community_comments', 'community_votes', 'community_admin_notes']) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(migration, /unique \(post_id, user_id\)/);
});

test('migration prevents role, author, official identity, and moderation spoofing', () => {
  assert.match(migration, /protect_profile_privileges/);
  assert.match(migration, /guard_community_post_write/);
  assert.match(migration, /guard_community_comment_write/);
  assert.match(migration, /new\.author_id is distinct from requester/);
  assert.match(migration, /members cannot set official or moderation fields/);
  assert.match(migration, /members cannot change moderation fields/);
});

test('public policy excludes hidden content and notes remain staff-only', () => {
  assert.match(migration, /Community posts are publicly readable[\s\S]*not is_hidden/);
  assert.match(migration, /Community comments are publicly readable[\s\S]*not is_hidden/);
  assert.match(migration, /Community staff read admin notes/);
  assert.doesNotMatch(migration, /admin notes are publicly readable/);
});

test('anonymous reads never depend on staff-only helper execution', () => {
  assert.match(publicReadPolicyMigration, /to anon\s+using \(not is_hidden\)/);
  assert.match(publicReadPolicyMigration, /Visible community comments are publicly readable[\s\S]*to anon/);
  const anonymousPolicies = [...publicReadPolicyMigration.matchAll(/create policy "Visible community [^"]+"([\s\S]*?);/g)].map((match) => match[1]).join('\n');
  assert.doesNotMatch(anonymousPolicies, /community_private\.is_staff/);
  assert.match(publicReadPolicyMigration, /to authenticated[\s\S]*community_private\.is_staff/);
});

test('profile grants expose only public identity and deny browser role writes', () => {
  assert.match(migration, /grant select \(id, username, display_name, avatar_url, created_at\)/);
  assert.match(migration, /grant update \(username, display_name, avatar_url, timezone, language, companion_preferences\)/);
  assert.doesNotMatch(migration, /grant update \([^)]*role[^)]*\)/);
});
