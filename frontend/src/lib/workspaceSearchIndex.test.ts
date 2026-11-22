import assert from 'node:assert/strict';
import test from 'node:test';
import { rankWorkspaceSearch, type WorkspaceSearchCandidate } from './workspaceSearchIndex';
import { workspaceSearchFilter, workspaceSearchTerms } from './workspaceSearchQuery';

const item = (id: string, title: string, options: Partial<WorkspaceSearchCandidate> = {}): WorkspaceSearchCandidate => ({
  id, title, kind: 'chat', href: `/workspace?conversation=${id}`, detail: '', keywords: '', updatedAt: '2026-11-21', ...options,
});

test('search input uses bounded Unicode words, never raw PostgREST syntax', () => {
  assert.deepEqual(workspaceSearchTerms('  CAFÉ Café %(alpha),two_three! four five six seven'), ['café', 'alpha', 'two', 'three', 'four', 'five']);
  assert.equal(workspaceSearchTerms('z'.repeat(150))[0].length, 120);
  assert.deepEqual(workspaceSearchTerms('%,()'), []);
  assert.throws(() => workspaceSearchFilter(['bad,term'], ['title']));
  assert.throws(() => workspaceSearchFilter(['hello'], []));
  assert.throws(() => workspaceSearchFilter(['hello'], ['unexpected' as 'title']));
});

test('each word must match at least one selected field in the same saved record', () => {
  assert.equal(workspaceSearchFilter(['alpha', 'βeta'], ['title', 'preview']),
    'and(or(title.ilike.%alpha%,preview.ilike.%alpha%),or(title.ilike.%βeta%,preview.ilike.%βeta%))');
  assert.equal(workspaceSearchFilter(['alpha'], ['name']), 'name.ilike.%alpha%');
});

test('exact titles outrank content and database substring-only matches are retained', () => {
  const ranked = rankWorkspaceSearch([
    item('word', 'Inventory', { keywords: 'Customer support' }),
    item('exact', 'Support'),
    item('contains', 'Billing', { detail: 'unsupported invoice' }),
  ], ['support']);
  assert.deepEqual(ranked.map(row => row.id), ['exact', 'word', 'contains']);
  assert.ok(ranked.every(row => !('keywords' in row)));
});

test('recent results are bounded, typed and deduplicated', () => {
  const candidates = Array.from({ length: 30 }, (_, i) => item(`older-${i}`, 'Old', { updatedAt: '2025-01-01' }));
  const result = rankWorkspaceSearch([
    ...candidates, item('same', 'Old label'), item('same', 'Renamed chat'),
    item('same', 'Project', { kind: 'project', updatedAt: '2026-11-22' }),
  ], []);
  assert.equal(result.length, 24);
  assert.deepEqual(result.slice(0, 2).map(row => [row.kind, row.title]), [['project', 'Project'], ['chat', 'Renamed chat']]);
});
