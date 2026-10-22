import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const sql=readFileSync(new URL('../../../supabase/migrations/20261022135500_sidebar_owner_rls.sql',import.meta.url),'utf8');

test('sidebar section RLS compares project ownership with its actual parent row',()=>{
 assert.match(sql,/alter policy "sidebar_sections_own" on public\.xroga_sidebar_sections/);
 assert.match(sql,/p\.id = xroga_sidebar_sections\.project_id/);
 assert.match(sql,/p\.user_id = xroga_sidebar_sections\.user_id/);
 assert.doesNotMatch(sql,/p\.user_id\s*=\s*p\.user_id/);
});

test('sidebar item RLS validates both owning project and matching section',()=>{
 assert.match(sql,/alter policy "sidebar_items_own" on public\.xroga_sidebar_items/);
 assert.match(sql,/p\.user_id = xroga_sidebar_items\.user_id/);
 assert.match(sql,/s\.user_id = xroga_sidebar_items\.user_id/);
 assert.match(sql,/s\.project_id = xroga_sidebar_items\.project_id/);
 assert.doesNotMatch(sql,/s\.user_id\s*=\s*s\.user_id/);
 assert.doesNotMatch(sql,/s\.project_id\s*=\s*s\.project_id/);
});

test('RLS tightening preserves all existing saved work and requires an authenticated account',()=>{
 assert.equal((sql.match(/alter policy/g)||[]).length,2);
 assert.match(sql,/to authenticated/);
 assert.match(sql,/\(select auth\.uid\(\)\) = xroga_sidebar_items\.user_id/);
 assert.doesNotMatch(sql,/\bdelete\s+from\b|\btruncate\b|\bupdate\s+public\./i);
});
