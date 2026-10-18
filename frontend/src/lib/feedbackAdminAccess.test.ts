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
  assert.match(promptStyles, /font-family: ui-monospace/);
  assert.doesNotMatch(prompt, /bg-gradient-to-br|#006aff/);
});

test('feedback submissions persist to Supabase rather than one browser', () => {
  assert.match(storage, /from\('product_feedback'\)\.insert/);
  assert.match(storage, /supabase\.auth\.getSession\(\)/);
  assert.match(storage, /page_path: pagePath/);
  assert.doesNotMatch(storage, /localStorage|xroga_user_feedback|SEED/);
});

test('feedback admin page verifies the signed-in email before querying submissions', () => {
  assert.match(adminPage, /const FEEDBACK_ADMIN_EMAIL = 'hello@xroga\.com'/);
  assert.match(adminPage, /supabase\.auth\.getUser\(\)/);
  assert.match(adminPage, /redirect\('\/auth\/login\?next=%2Fadmin%2Ffeedback'\)/);
  assert.match(adminPage, /user\.email\?\.trim\(\)\.toLowerCase\(\) !== FEEDBACK_ADMIN_EMAIL/);
  const authorization = adminPage.indexOf("user.email?.trim().toLowerCase() !== FEEDBACK_ADMIN_EMAIL");
  const query = adminPage.indexOf(".from('product_feedback')");
  assert.ok(authorization >= 0 && query > authorization, 'authorization must run before the feedback query');
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
