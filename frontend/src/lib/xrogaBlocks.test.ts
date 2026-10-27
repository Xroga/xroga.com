import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';

import { parseXrogaBlock, parseXrogaOutput, xrogaApprovalSchema, xrogaEvidenceSchema, xrogaReceiptSchema } from './xrogaBlocks';
import { adaptOutputToXrogaDocument, universalOutputToXrogaBlocks } from './xrogaOutputAdapters';

// This Node-only contract test imports real renderers, not a Next CSS bundle.
// Read actual CSS-module class names during import, then restore the loader.
// Styling itself remains covered by the Next build and browser verification.
const requireRenderer = createRequire(import.meta.url);
const originalCssLoader = requireRenderer.extensions['.css'];
function loadRendererRegistry(): typeof import('../components/terminal/XrogaBlockView') {
  try {
    requireRenderer.extensions['.css'] = (module, filename) => {
      assert.ok(filename.endsWith('.module.css'), 'Only CSS modules are supported by this test adapter');
      const classes = [...readFileSync(filename, 'utf8').matchAll(/\.([a-zA-Z_][a-zA-Z0-9_-]*)/g)];
      module.exports = Object.fromEntries(classes.map(match => [match[1], match[1]]));
    };
    return requireRenderer('../components/terminal/XrogaBlockView');
  } finally {
    if (originalCssLoader) requireRenderer.extensions['.css'] = originalCssLoader;
    else delete requireRenderer.extensions['.css'];
  }
}
const { canRender, getRenderer } = loadRendererRegistry();
assert.equal(requireRenderer.extensions['.css'], originalCssLoader, 'Renderer import must not leak its CSS loader');

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

test('market quote and conversion blocks require observed, safe source data', () => {
  const source = { title: 'Rate provider', url: 'https://example.com/rate', observedAt: '2026-10-24T10:00:00.000Z' };
  assert.equal(parseXrogaBlock({ schemaVersion: 1, id: 'quote', type: 'market-quote', symbol: 'BTC', name: 'Bitcoin', price: 10, currency: 'USD', source })?.type, 'market-quote');
  assert.equal(parseXrogaBlock({ schemaVersion: 1, id: 'conversion', type: 'conversion', from: 'USD', to: 'EUR', rate: 0.9, amount: 100, source })?.type, 'conversion');
  assert.equal(parseXrogaBlock({ schemaVersion: 1, id: 'bad-quote', type: 'market-quote', symbol: 'BTC', name: 'Bitcoin', price: 10, currency: 'USD' }), null);
  assert.equal(parseXrogaBlock({ schemaVersion: 1, id: 'bad-source', type: 'conversion', from: 'USD', to: 'EUR', rate: 0.9, amount: 100, source: { ...source, url: 'javascript:alert(1)' } }), null);
  assert.equal(canRender('market-quote'), true);
  assert.equal(canRender('conversion'), true);
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
  assert.match(activity, /ActivityRow/);
  assert.match(activity, /aria-live="polite"/);
});

test('TerminalChatContext does not retain provider private reasoning in client state', () => {
  const context = readFileSync(new URL('../context/TerminalChatContext.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(context, /setReasoning|ev\.thinking/);
  assert.match(context, /private model working/);
});

test('connection and approval renderers do not expose internal capability or action IDs', () => {
  const view = readFileSync(new URL('../components/terminal/XrogaBlockView.tsx', import.meta.url), 'utf8');
  const connectionStart = view.indexOf('function ConnectionRenderer');
  const connectionEnd = view.indexOf('function WebsiteRenderer', connectionStart);
  const connection = view.slice(connectionStart, connectionEnd);
  assert.match(connection, />Why</);
  assert.match(connection, />Access</);
  assert.match(connection, />Next</);
  assert.doesNotMatch(connection, /block\.capability|block\.action/);

  const approvalStart = view.indexOf('function ApprovalRenderer');
  const approvalEnd = view.indexOf('function ReceiptRenderer', approvalStart);
  assert.doesNotMatch(view.slice(approvalStart, approvalEnd), /block\.approval\.action/);
});
