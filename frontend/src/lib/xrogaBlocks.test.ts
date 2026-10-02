import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { canRender, getRenderer } from '../components/terminal/XrogaBlockView';
import { parseXrogaBlock, parseXrogaOutput, xrogaApprovalSchema, xrogaEvidenceSchema, xrogaReceiptSchema } from './xrogaBlocks';
import { adaptOutputToXrogaDocument, universalOutputToXrogaBlocks } from './xrogaOutputAdapters';

test('canonical output validation accepts semantic blocks and rejects malformed blocks', () => {
  const valid = parseXrogaOutput({
    schemaVersion: 1,
    id: 'result-1',
    status: 'partial',
    blocks: [{ schemaVersion: 1, id: 'notice-1', type: 'notice', text: 'The project is saved. Deployment needs attention.', tone: 'warning' }],
  });
  assert.equal(valid?.status, 'partial');
  assert.equal(parseXrogaBlock({ schemaVersion: 1, id: 'bad', type: 'receipt', receipt: {} }), null);
});

test('evidence, approval, and receipt contracts retain real linkage', () => {
  assert.equal(xrogaEvidenceSchema.parse({ id: 'ev-1', type: 'check', title: 'Tests passed', relatedEventIds: ['event-1'] }).relatedEventIds?.[0], 'event-1');
  assert.equal(xrogaApprovalSchema.parse({ id: 'approval-1', action: 'Deploy', title: 'Deploy production', status: 'requested' }).action, 'Deploy');
  assert.equal(xrogaReceiptSchema.parse({ id: 'receipt-1', action: 'Published', target: 'owner/repo', service: 'GitHub', status: 'completed', timestamp: '2026-10-02T10:00:00.000Z', externalReference: 'abc123' }).externalReference, 'abc123');
});

test('UniversalOutput becomes canonical narrative, artifacts, evidence, and independent blockers', () => {
  const blocks = universalOutputToXrogaBlocks({
    type: 'xroga.output', version: '1.0', status: 'partial', summary: 'Files are ready; publication failed.',
    artifacts: [{ id: 'file-1', name: 'report.txt', mediaType: 'text/plain', sizeBytes: 4, inline: 'done', validation: [] }],
    evidence: [{ kind: 'check', detail: 'Tests passed' }], blockers: ['GitHub authorization expired'], nextActions: [],
  });
  assert.deepEqual(blocks.map((block) => block.type), ['narrative', 'artifact', 'evidence', 'error']);
});

test('engineering artifacts and historical landing outputs use canonical website blocks', () => {
  const engineering = adaptOutputToXrogaDocument({
    type: 'engineering_artifact', artifactVersion: 1, summary: 'Ready', status: 'verified', verified: true,
    outcome: 'implemented', phaseReached: 'verification', reason: '', blockers: [], files: [], fileCount: 0,
    repository: null, commitSha: null, verificationEvidence: [], preview: null, nextAction: null,
  });
  assert.equal(engineering?.blocks[0].type, 'website');
  assert.equal(engineering?.status, 'completed');

  const legacy = adaptOutputToXrogaDocument({ type: 'landing_page', projectName: 'Restored project' });
  assert.equal(legacy?.blocks[0].type, 'website');
});

test('renderer registry covers foundation blocks and safely falls back for future blocks', () => {
  for (const type of ['narrative', 'notice', 'status', 'plan', 'activity', 'evidence', 'citation', 'source', 'approval', 'receipt', 'code', 'diff', 'terminal', 'file', 'website', 'artifact', 'connection-request', 'error', 'empty-state']) {
    assert.equal(canRender(type), true, `${type} is not registered`);
  }
  assert.equal(typeof getRenderer('future-unknown'), 'function');
  const restored = adaptOutputToXrogaDocument({
    schemaVersion: 1,
    id: 'future-result',
    status: 'completed',
    blocks: [{ schemaVersion: 1, id: 'future-1', type: 'future-widget', payload: {} }],
  });
  assert.equal(restored?.blocks[0].type, 'empty-state');
});

test('copy and activity UI use Lucide semantics and contain no dot status element', () => {
  const copy = readFileSync(new URL('../components/ui/InlineCopyButton.tsx', import.meta.url), 'utf8');
  const activity = readFileSync(new URL('../components/terminal/TerminalLiveActivity.tsx', import.meta.url), 'utf8');
  assert.match(copy, /<Copy/);
  assert.match(copy, /Copied/);
  assert.doesNotMatch(activity, /xv-term-livedot/);
  assert.match(activity, /function iconFor/);
  assert.match(activity, /function ActivityRow/);
  assert.match(activity, /aria-live="polite"/);
});

test('TerminalChatContext does not retain provider private reasoning in client state', () => {
  const context = readFileSync(new URL('../context/TerminalChatContext.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(context, /setReasoning|ev\.thinking/);
  assert.match(context, /private model working/);
});
