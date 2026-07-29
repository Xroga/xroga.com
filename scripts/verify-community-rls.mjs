import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !publicKey || !serviceKey) throw new Error('SUPABASE_URL, public publishable key, and SUPABASE_SERVICE_ROLE_KEY are required');

const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const password = `Xr!${crypto.randomUUID()}a9`;
const users = [];
let postId = '';
let adminNoteId = '';
let result = null;

function assert(condition, message) { if (!condition) throw new Error(message); }
async function userClient(label) {
  const email = `community-qa-${label}-${suffix}@example.com`;
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `Community QA ${label}` } });
  if (error || !data.user) throw new Error(`create ${label}: ${error?.message || 'no user'}`);
  users.push(data.user.id);
  const client = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw new Error(`sign in ${label}: ${signIn.error.message}`);
  return { id: data.user.id, client };
}

try {
  const memberA = await userClient('member-a');
  const memberB = await userClient('member-b');
  const staff = await userClient('admin');
  const promote = await service.from('profiles').update({ role: 'admin' }).eq('id', staff.id);
  if (promote.error) throw new Error(`promote test admin: ${promote.error.message}`);

  const inserted = await memberA.client.from('community_posts').insert({ author_id: memberA.id, category: 'bug', title: 'Community RLS verification', body: 'Isolated durable test for community row level security.' }).select('id').single();
  if (inserted.error) throw new Error(`member insert: ${inserted.error.message}`);
  postId = inserted.data.id;

  const visible = await anon.from('community_posts').select('id').eq('id', postId).maybeSingle();
  assert(!visible.error && visible.data?.id === postId, 'public user cannot read visible post');

  const spoof = await memberB.client.from('community_posts').insert({ author_id: memberA.id, category: 'feedback', title: 'Spoof attempt title', body: 'This author spoof must be rejected by RLS or trigger.' });
  assert(Boolean(spoof.error), 'member could create a post as another user');

  const elevate = await memberA.client.from('community_posts').update({ status: 'released', is_pinned: true }).eq('id', postId);
  assert(Boolean(elevate.error), 'member could update administrative post fields');

  const official = await memberA.client.from('community_comments').insert({ post_id: postId, author_id: memberA.id, body: 'Fake official response', official_identity: 'xroga_owner' });
  assert(Boolean(official.error), 'member could assign official identity');

  const voteOne = await memberA.client.from('community_votes').insert({ post_id: postId, user_id: memberA.id });
  if (voteOne.error) throw new Error(`first vote: ${voteOne.error.message}`);
  const voteTwo = await memberA.client.from('community_votes').insert({ post_id: postId, user_id: memberA.id });
  assert(Boolean(voteTwo.error), 'duplicate vote was accepted');

  const hide = await staff.client.from('community_posts').update({ is_hidden: true, is_locked: true }).eq('id', postId);
  if (hide.error) throw new Error(`admin moderation: ${hide.error.message}`);
  const hidden = await anon.from('community_posts').select('id').eq('id', postId).maybeSingle();
  assert(!hidden.error && !hidden.data, 'anonymous user could read hidden post');
  const lockedReply = await memberA.client.from('community_comments').insert({ post_id: postId, author_id: memberA.id, body: 'Reply on a locked post' });
  assert(Boolean(lockedReply.error), 'member could reply to locked post');

  const officialReply = await staff.client.from('community_comments').insert({ post_id: postId, author_id: staff.id, body: 'Verified Xroga Team response.', official_identity: 'xroga_team' });
  if (officialReply.error) throw new Error(`staff official reply: ${officialReply.error.message}`);
  const note = await staff.client.from('community_admin_notes').insert({ post_id: postId, author_id: staff.id, note: 'Isolated QA note—must remain private.' }).select('id').single();
  if (note.error) throw new Error(`staff note: ${note.error.message}`);
  adminNoteId = note.data.id;
  const memberNotes = await memberB.client.from('community_admin_notes').select('id').eq('id', adminNoteId);
  assert(Boolean(memberNotes.error) || memberNotes.data.length === 0, 'ordinary member could read private admin note');

  result = { status: 'passed', checks: 10, projectHost: new URL(url).host };
} finally {
  if (postId) await service.from('community_posts').delete().eq('id', postId);
  for (const id of users) await service.auth.admin.deleteUser(id).catch(() => undefined);
}
console.log(JSON.stringify({ ...result, fixturesCleaned: true }));
