import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyDocumentEdit } from './xrogaDocumentEdits';
import type { XrogaOutputDocument } from './xrogaBlocks';

const output: XrogaOutputDocument = {
  schemaVersion: 1, id: 'response', status: 'completed', blocks: [
    { schemaVersion: 1, id: 'intro', type: 'narrative', text: 'Keep this answer.' },
    { schemaVersion: 1, id: 'report', type: 'document', format: 'markdown', content: 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.' },
  ],
};

test('editing one paragraph preserves other blocks and creates a recoverable version', () => {
  const changed = applyDocumentEdit(output, 'report', 'First paragraph.\n\nChanged second paragraph.\n\nThird paragraph.', '2026-10-09T00:00:00.000Z');
  assert.ok(changed);
  assert.deepEqual(changed.blocks[0], output.blocks[0]);
  const document = changed.blocks[1];
  assert.equal(document.type, 'document');
  if (document.type !== 'document') return;
  assert.equal(document.version, 2);
  assert.equal(document.revisions?.[0]?.content, 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.');
  assert.equal(document.content, 'First paragraph.\n\nChanged second paragraph.\n\nThird paragraph.');
  assert.deepEqual(applyDocumentEdit(changed, 'report', document.revisions![0]!.content, '2026-10-09T00:01:00.000Z')?.blocks[1], {
    ...document,
    version: 3,
    content: output.blocks[1] && 'content' in output.blocks[1] ? output.blocks[1].content : '',
    revisions: [...document.revisions!, { version: 2, content: document.content, savedAt: '2026-10-09T00:01:00.000Z' }],
  });
});

test('unchanged, unknown, and oversized edits are refused', () => {
  assert.equal(applyDocumentEdit(output, 'missing', 'new'), null);
  assert.equal(applyDocumentEdit(output, 'report', 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.'), null);
  assert.equal(applyDocumentEdit(output, 'report', 'x'.repeat(200_001)), null);
});
