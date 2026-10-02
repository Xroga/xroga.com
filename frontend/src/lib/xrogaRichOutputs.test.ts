import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { adaptTrustedA2uiBlock } from './xrogaA2uiAdapter';
import { buildArtifactContextPreamble } from './xrogaArtifactContext';
import { parseXrogaBlock, parseXrogaOutput } from './xrogaBlocks';
import { resolvePresentationIntent, shouldVirtualizeRows } from './xrogaPresentation';

const base = { schemaVersion: 1 as const, id: 'block-1' };

test('presentation intent follows structured result shape instead of prompt keywords', () => {
  assert.equal(resolvePresentationIntent({ rows: [{ month: 'Jan' }], columns: [{ key: 'month' }] }), 'table');
  assert.equal(resolvePresentationIntent({ rows: [{ month: 'Jan', value: 2 }], series: [{ key: 'value' }] }), 'chart');
  assert.equal(resolvePresentationIntent({ mimeType: 'application/pdf' }), 'pdf');
  assert.equal(resolvePresentationIntent({ kind: 'dashboard' }), 'dashboard');
  assert.equal(resolvePresentationIntent({ kind: 'unknown' }), 'artifact');
});

test('all Step 2 rich block families validate with truthful minimum data', () => {
  const blocks = [
    { ...base, type: 'metric', metric: { id: 'm', label: 'Users', value: 12 } },
    { ...base, type: 'metric-group', metrics: [{ id: 'm', label: 'Users', value: 12 }] },
    { ...base, type: 'table', columns: [{ key: 'name', label: 'Name' }], rows: [{ name: 'Ada' }] },
    { ...base, type: 'chart', chartType: 'line', xKey: 'month', data: [{ month: 'Jan', value: 2 }], series: [{ key: 'value', label: 'Value' }], summary: 'Value by month' },
    { ...base, type: 'timeline', events: [{ id: 'e', title: 'Started', date: '2026-10-03' }] },
    { ...base, type: 'graph', nodes: [{ id: 'a', label: 'A' }], edges: [] },
    { ...base, type: 'map', locations: [{ id: 'p', label: 'Office', latitude: 40, longitude: -74 }] },
    { ...base, type: 'form', fields: [{ id: 'email', label: 'Email', inputType: 'email' }] },
    { ...base, type: 'choice', prompt: 'Choose', options: [{ id: 'a', label: 'A' }] },
    { ...base, type: 'gallery', items: [] },
    { ...base, type: 'image', image: { id: 'i', label: 'Image', url: 'https://example.com/a.png' } },
    { ...base, type: 'audio', audio: { id: 'a', label: 'Audio', url: 'https://example.com/a.mp3' } },
    { ...base, type: 'video', video: { id: 'v', label: 'Video', url: 'https://example.com/a.mp4' } },
    { ...base, type: 'dashboard', metrics: [{ id: 'm', label: 'Users', value: 12 }] },
    { ...base, type: 'document', content: '# Report', format: 'markdown' },
    { ...base, type: 'spreadsheet', columns: [{ key: 'name', label: 'Name' }], rows: [] },
    { ...base, type: 'presentation', slides: [{ id: 's', title: 'Opening' }] },
    { ...base, type: 'board', columns: [{ id: 'todo', title: 'To do', items: [] }] },
    { ...base, type: 'database', columns: [{ key: 'id', label: 'ID' }], rows: [] },
    { ...base, type: 'pdf', name: 'report.pdf', metadataOnly: true },
  ];
  for (const block of blocks) assert.ok(parseXrogaBlock(block), `${block.type} did not validate`);
});

test('artifact metadata survives canonical output parsing', () => {
  const parsed = parseXrogaOutput({ schemaVersion: 1, id: 'out', status: 'completed', blocks: [], artifact: { id: 'artifact-1', type: 'dashboard', title: 'Revenue', version: 2, createdAt: '2026-10-03T00:00:00.000Z', updatedAt: '2026-10-03T00:01:00.000Z' } });
  assert.equal(parsed?.artifact?.id, 'artifact-1');
  assert.equal(parsed?.artifact?.version, 2);
});

test('reserved Step 1 rich blocks migrate from the historical data envelope', () => {
  const restored = parseXrogaBlock({ ...base, type: 'table', data: { columns: [{ key: 'name', label: 'Name' }], rows: [{ name: 'Grace' }] } });
  assert.equal(restored?.type, 'table');
  assert.equal(restored && 'rows' in restored ? restored.rows[0]?.name : null, 'Grace');
});

test('A2UI adapter is allowlisted, schema checked, and rejects executable payloads', () => {
  assert.ok(adaptTrustedA2uiBlock({ ...base, type: 'metric', metric: { id: 'm', label: 'Users', value: 12 } }));
  assert.equal(adaptTrustedA2uiBlock({ ...base, type: 'metric', metric: { id: 'm', label: 'Users', value: 12 }, onClick: 'steal()' }), null);
  assert.equal(adaptTrustedA2uiBlock({ ...base, type: 'iframe', url: 'javascript:alert(1)' }), null);
});

test('artifact selection context is bounded and carries identifiers instead of raw records', () => {
  const preamble = buildArtifactContextPreamble({ activeArtifactId: 'artifact-1', activeArtifactTitle: 'Customers', selections: [{ artifactId: 'artifact-1', blockId: 'table-1', kind: 'rows', label: 'selected customers', recordIds: Array.from({ length: 80 }, (_, index) => `row-${index}`) }] });
  assert.match(preamble, /XROGA_ARTIFACT_CONTEXT/);
  assert.match(preamble, /artifact-1/);
  assert.doesNotMatch(preamble, /row-79/);
  assert.ok(preamble.length < 2_000);
});

test('large data threshold and lazy renderer keep simple chat light', () => {
  assert.equal(shouldVirtualizeRows(100), false);
  assert.equal(shouldVirtualizeRows(101), true);
  const registry = readFileSync(new URL('../components/terminal/XrogaBlockView.tsx', import.meta.url), 'utf8');
  const rich = readFileSync(new URL('../components/terminal/XrogaRichBlockView.tsx', import.meta.url), 'utf8');
  assert.match(registry, /lazy\(\(\) => import\('\.\/XrogaRichBlockView'\)/);
  assert.doesNotMatch(registry, /from 'recharts'/);
  assert.match(rich, /@tanstack\/react-table/);
  assert.match(rich, /@tanstack\/react-virtual/);
  assert.match(rich, /from 'recharts'/);
  assert.match(rich, /skipHtml/);
});
