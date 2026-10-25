import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LibraryFilePreview } from './LibraryFilePreview.js';

const projectId = '11111111-1111-4111-8111-111111111111';
const fileId = '22222222-2222-4222-8222-222222222222';
const file = { id: fileId, file_name: 'private.txt', file_path: null, file_type: 'text',
  file_url: `/api/private-files/${projectId}/${fileId}`, content: 'OWNER_ONLY_FIXTURE', version: 1, created_at: '2026-10-23T00:00:00Z' };

test('Library exposes existing private download, timed copy and revocation controls for the exact selected project/file', () => {
  const html = renderToStaticMarkup(createElement(LibraryFilePreview, { projectId, file }));
  assert.ok(html.includes(`href="${file.file_url}"`));
  for (const text of ['Download selected file', 'Copy 60-second link', 'Revoke timed links', 'OWNER_ONLY_FIXTURE']) assert.ok(html.includes(text));
  assert.doesNotMatch(html, /Download All/);
});

test('Library refuses substituted private project/file URLs and executable URLs without removing safe external previews', () => {
  for (const file_url of [`/api/private-files/${fileId}/${fileId}`, `/api/private-files/${projectId}/${projectId}`, 'javascript:alert(1)', '//foreign.invalid/file']) {
    const html = renderToStaticMarkup(createElement(LibraryFilePreview, { projectId, file: { ...file, file_url } }));
    assert.doesNotMatch(html, /href=|Copy 60-second link|Revoke timed links/);
  }
  const html = renderToStaticMarkup(createElement(LibraryFilePreview, { projectId, file: { ...file, file_url: 'https://example.test/saved.txt' } }));
  assert.match(html, /Open saved file/);
  assert.match(html, /noopener noreferrer/);
});

test('Library keeps preview bounds and remounts account-local state when verified identity changes', () => {
  const html = renderToStaticMarkup(createElement(LibraryFilePreview, { projectId, file: { ...file, content: 'x'.repeat(6000) } }));
  assert.match(html, /Preview limited to 5,000 characters/);
  assert.ok(!html.includes('x'.repeat(5001)));
  const source = readFileSync(new URL('./LibraryWorkspace.tsx', import.meta.url), 'utf8');
  assert.ok(source.includes('key={`${identity.status}:${identity.userId ?? \'unresolved\'}`}'));
  assert.ok(source.includes('<LibraryFilePreview projectId={projectId} file={selectedFile} />'));
  const route = readFileSync(new URL('../../app/(shell)/dashboard/projects/[id]/page.tsx', import.meta.url), 'utf8');
  assert.ok(route.includes("redirect('/workspace?project='+encodeURIComponent(id))"), 'Keep main’s unified Workspace redirect');
});
