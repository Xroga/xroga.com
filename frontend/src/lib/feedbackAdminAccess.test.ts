import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const prompt = read('../components/feedback/ScheduledFeedbackPrompt.tsx');
const promptStyles = read('../components/feedback/ScheduledFeedbackPrompt.module.css');
const storage = read('./feedbackStorage.ts');
const adminPage = read('../app/admin/feedback/page.tsx');
const migration = read('../../../supabase/migrations/20261018211950_product_feedback_admin.sql');

test('scheduled feedback uses the requested neutral experience card', () => {
  assert.match(prompt, /How was your experience today\?/);
  for (const label of ['Good', 'Excellent', 'Fair', 'Poor']) {
    assert.match(prompt, new RegExp(`label: '${label}'`));
  }
  assert.match(prompt, /What worked well\?/);
  assert.match(prompt, /What should we improve\?/);
  assert.match(prompt, /await addFeedback/);
  assert.match(promptStyles, /background: #f9fafb/);
  assert.equal((prompt.match(/<textarea/g) ?? []).length, 1);
  assert.match(prompt, /if \(!interactedRef.current\) setOpen\(false\)/);
  assert.match(prompt, /onFocusCapture=\{keepOpen\}/);
  assert.doesNotMatch(prompt, /bg-gradient-to-br|#006aff/);
});

test('feedback submissions persist to Supabase rather than one browser', () => {
  assert.match(storage, /from\('product_feedback'\)\.insert/);
  assert.match(storage, /supabase\.auth\.getSession\(\)/);
  assert.match(storage, /page_path: pagePath/);
  assert.doesNotMatch(storage, /localStorage|xroga_user_feedback|SEED/);
});

test('feedback admin page uses canonical verified founder policy before querying submissions', () => {
  assert.match(adminPage, /supabase\.auth\.getUser\(\)/);
  assert.match(adminPage, /redirect\('\/auth\/login\?next=%2Fadmin%2Ffeedback'\)/);
  assert.match(adminPage, /authorizeFounderRequest\(/);
  assert.match(adminPage, /supabase\.rpc\('current_community_role'\)/);
  assert.match(adminPage, /getAuthenticatorAssuranceLevel\(\)/);
  const authorization = adminPage.indexOf('if (!decision.allowed)');
  const query = adminPage.indexOf(".from('product_feedback')");
  assert.ok(authorization >= 0 && query > authorization, 'authorization must run before the feedback query');
});

test('feedback SQL independently requires current confirmed identity, owner role and AAL2', () => {
  const sql = read('../../../supabase/migrations/20261021100000_feedback_founder_authorization.sql');
  for (const text of ["auth.jwt() ->> 'aal'", "= 'aal2'", 'auth.users u', 'u.email_confirmed_at is not null', "p.role = 'owner'", "= 'hello@xroga.com'", 'as restrictive for select to authenticated']) assert.ok(sql.includes(text));
  assert.match(sql, /security definer\s+set search_path = pg_catalog/);
  assert.doesNotMatch(sql, /user_metadata|grant.*service_role/i);
});

test('database RLS permits submission but reserves reading for hello@xroga.com', () => {
  assert.match(migration, /alter table public\.product_feedback enable row level security/);
  assert.match(migration, /for insert\s+to anon, authenticated/);
  assert.match(migration, /user_id is not distinct from \(select auth\.uid\(\)\)/);
  assert.match(migration, /for select\s+to authenticated/);
  assert.match(migration, /= 'hello@xroga\.com'/);
  assert.match(migration, /grant insert on public\.product_feedback to anon, authenticated/);
  assert.match(migration, /grant select on public\.product_feedback to authenticated/);
  assert.doesNotMatch(migration, /user_metadata/);
});
