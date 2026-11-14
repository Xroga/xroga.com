import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { harness } from '../../storage/testing/harness.js';
import { setStorageServiceForTests } from '../../storage/runtime.js';
import { createTenantContext } from '../../security/tenantContext.js';
import { preparedActionDigest } from '../../security/authority/digest.js';
import { presentResearchResult, readResearchResult, saveResearchResult } from './researchResult.js';
import type { SafeBusinessActionConfirmation } from './businessActionConfirmations.js';

afterEach(() => setStorageServiceForTests(undefined));
const raw = { ok: true, operation: 'search', result: { results: [
  { title: 'Page A', url: 'https://example.com/a', excerpts: ['Retrieved excerpt A'] },
  { title: 'Page A again', url: 'https://example.com/a#heading', excerpts: ['Duplicate'] },
  { title: 'Page B', url: 'https://example.com/b', excerpts: ['Retrieved excerpt B'] },
  { title: 'Unsafe', url: 'http://127.0.0.1/', excerpts: ['Never render'] },
] } };

test('research normalization deduplicates pages, keeps distinct pages, rejects unsafe URLs', () => {
  const result = presentResearchResult(raw);
  assert.deepEqual(result.sources.map(s => s.url), ['https://example.com/a', 'https://example.com/b']);
  assert.equal(result.omittedSourceCount, 1);
  assert.equal(result.text, ''); // Search snippets are not an invented synthesized answer.
});

test('saved DeepSeek research retains native inline evidence and rejects an invented source ID', () => {
  const webSource = { title: 'Documentation', url: 'https://example.com/a', snippet: 'Retrieved excerpt', source: 'web',
    siteName: 'Example', siteIconDomain: 'example.com', publishedAt: '2026-10-17T00:00:00.000Z' };
  const program = 'root = Col([Text(["See the documentation. ", Source("source-1")])])';
  const receipt = { ok: true, operation: 'search', result: { provider: 'deepseek', results: [{
    title: webSource.title, url: webSource.url, excerpts: [webSource.snippet], site_name: webSource.siteName,
    site_icon_domain: webSource.siteIconDomain, publish_date: webSource.publishedAt,
  }] }, answer: { response: 'See the documentation [1].', completion: { status: 'complete' },
    webSources: [webSource], responseSource: { format: 'xroga-openui-v1', text: program } } };
  assert.deepEqual(presentResearchResult(receipt).sources, [webSource]);
  assert.deepEqual(presentResearchResult(receipt).answer, receipt.answer);
  const invalid = structuredClone(receipt);
  invalid.answer.responseSource.text = program.replace('source-1', 'source-2');
  assert.equal(presentResearchResult(invalid).answerFailure, 'INVALID_SAVED_ANSWER');
});

test('an official-only receipt shows evidence from approved domains only, including after reopening', async () => {
  const h = harness();
  setStorageServiceForTests(h.svc);
  const context = createTenantContext({ userId: h.alice.userId, via: 'local_jwt' });
  const id = randomUUID();
  const retrieved = { ok: true, operation: 'search', result: { output_text: 'Unattributed provider text', results: [
    { title: 'Third-party article', url: 'https://example.org/guide', excerpts: ['Third-party excerpt'] },
    { title: 'Lookalike host', url: 'https://docs.python.org.example.org/guide' },
    { title: 'Pathlib documentation', url: 'https://docs.python.org/3/library/pathlib.html', excerpts: ['Owner-approved domain'] },
  ] } };
  const digest = preparedActionDigest(retrieved);
  const confirmation: SafeBusinessActionConfirmation = {
    id, status: 'consumed', summary: 'Official Python documentation', toolkit: 'xroga-native-research', risk: 'read', createdAt: '', expiresAt: '',
    approval: { preparedActionId: id, actionDigest: 'a'.repeat(64), accountReference: 'platform', operation: 'search',
      actionClass: 'SENSITIVE_DATA_EXPORT', destination: 'official Search', spendMaximumMicroUsd: '5750', currency: 'USD',
      criticalParameters: { answerRequest: { goalContract: { sourcePolicy: { mode: 'official_only', officialDomains: ['DOCS.PYTHON.ORG'] } } } } },
    receipt: { id, outcome: 'provider_reported_success', recordedAt: '', resultDigest: digest },
  };
  await saveResearchResult(context, id, JSON.stringify(retrieved), digest, h.aliceProject);
  const result = await readResearchResult(context, confirmation);
  assert.deepEqual(result?.sources.map(source => source.title), ['Pathlib documentation']);
  assert.equal(result?.text, '');
  assert.deepEqual(await readResearchResult(context, confirmation), result);
  assert.deepEqual(presentResearchResult(retrieved, ['peps.python.org']), {
    text: '', sources: [], omittedSourceCount: 0, answerFailure: 'NO_QUALIFYING_SOURCES',
  });
});

test('private result survives repeated reads with issued owner and matching consumed receipt only', async () => {
  const h = harness(); setStorageServiceForTests(h.svc);
  const context = createTenantContext({ userId: h.alice.userId, via: 'local_jwt' });
  const other = createTenantContext({ userId: h.bob.userId, via: 'local_jwt' });
  const id = randomUUID(); const digest = preparedActionDigest(raw);
  const confirmation: SafeBusinessActionConfirmation = { id, status: 'consumed', summary: 'Search', toolkit: 'xroga-native-research', risk: 'read', createdAt: '', expiresAt: '',
    receipt: { id: randomUUID(), outcome: 'provider_reported_success', recordedAt: '', resultDigest: digest } };
  await saveResearchResult(context, id, JSON.stringify(raw), digest, h.aliceProject);
  const first = await readResearchResult(context, confirmation);
  assert.equal(first?.sources.length, 2);
  assert.deepEqual(await readResearchResult(context, confirmation), first);
  assert.equal(h.repo.objects.size, 1);
  assert.equal(await readResearchResult(other, confirmation), null);
  assert.equal(await readResearchResult(context, { ...confirmation, status: 'pending' }), null);
  assert.equal(await readResearchResult(context, { ...confirmation, receipt: { ...confirmation.receipt!, resultDigest: '0'.repeat(64) } }), null);
  await assert.rejects(readResearchResult({ ...context }, confirmation), { code: 'TENANT_AUTH_REQUIRED' });
  await assert.rejects(saveResearchResult(context, randomUUID(), JSON.stringify(raw), '0'.repeat(64)), /integrity/);
  h.repo.projects.set(h.aliceProject, h.bob.userId);
  await assert.rejects(readResearchResult(context, confirmation));
});
