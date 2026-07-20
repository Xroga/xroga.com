import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildUserSupabaseProvisionSql,
  projectRefFromUrl,
} from './supabaseProvision.js';

describe('supabaseProvision', () => {
  it('parses project ref from URL', () => {
    assert.equal(projectRefFromUrl('https://abcdxyz.supabase.co'), 'abcdxyz');
    assert.equal(projectRefFromUrl('https://abcdxyz.supabase.co/'), 'abcdxyz');
    assert.equal(projectRefFromUrl('not-a-url'), null);
  });

  it('builds provision SQL with memory + app tables', () => {
    const sql = buildUserSupabaseProvisionSql({ projectName: 'Acme App', includeStorage: true });
    assert.match(sql, /xroga_project_memory/);
    assert.match(sql, /xroga_session_memory/);
    assert.match(sql, /xroga_user_id/);
    assert.match(sql, /public\.profiles/);
    assert.match(sql, /app_items/);
    assert.match(sql, /xroga-uploads/);
    assert.match(sql, /enable row level security/i);
    assert.match(sql, /xroga_uploads_select_own/);
    assert.match(sql, /storage\.objects/);
  });
});
