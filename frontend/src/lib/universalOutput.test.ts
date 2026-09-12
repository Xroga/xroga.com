import assert from 'node:assert/strict';
import { test } from 'node:test';
import { artifactPresentation, isUniversalOutput, safeArtifactUri } from './universalOutput';

test('descriptor rendering is based on media type and falls back for unknown types', () => {
  const artifact = { id: 'generated', name: 'thing', mediaType: 'application/x-arbitrary', sizeBytes: 9, validation: [] };
  assert.equal(artifactPresentation(artifact), 'download');
  assert.equal(artifactPresentation({ ...artifact, mediaType: 'image/x-new' }), 'image');
  assert.equal(isUniversalOutput({ type: 'xroga.output', version: '1.0', summary: 'ok', status: 'completed', artifacts: [artifact], blockers: [], nextActions: [] }), true);
  assert.equal(safeArtifactUri('https://artifacts.example/result.bin'), 'https://artifacts.example/result.bin');
  assert.equal(safeArtifactUri('/api/artifacts/generated'), '/api/artifacts/generated');
  assert.equal(safeArtifactUri('javascript:alert(1)'), null);
});
