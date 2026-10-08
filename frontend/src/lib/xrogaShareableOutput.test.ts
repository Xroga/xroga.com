import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shareableDocumentText } from './xrogaShareableOutput';
import type { XrogaOutputDocument } from './xrogaBlocks';

test('a saved edited document can be shared without exposing unrelated blocks', () => {
  const output: XrogaOutputDocument = { schemaVersion: 1, id: 'answer', status: 'completed', blocks: [
    { schemaVersion: 1, id: 'code', type: 'code', language: 'ts', content: 'const secret = 1;' },
    { schemaVersion: 1, id: 'report', type: 'document', format: 'markdown', content: '# Verified report\nLatest revision.', version: 2 },
  ] };
  assert.equal(shareableDocumentText(output), '# Verified report\nLatest revision.');
  assert.doesNotMatch(shareableDocumentText(output), /secret/);
});

test('unsupported output has no shareable document', () => {
  assert.equal(shareableDocumentText({ unknown: true }), '');
});
