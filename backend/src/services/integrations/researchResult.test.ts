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
