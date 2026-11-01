import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachResearchResult, markResearchUnavailable, pendingResearchConfirmation } from './researchHandoff';
const id = '221fe7f9-f0dd-4b12-b03a-bcb57a13f655';
const message = { id: 'original-message', role: 'assistant', content: `Research requires approval. [Review](/dashboard/actions/confirm/${id})` };
const result = { confirmationId: id, receiptId: 'receipt', text: '', omittedSourceCount: 0,
  sources: [{ title: 'Retrieved page', url: 'https://example.com/page', snippet: 'Actual returned excerpt.', source: 'parallel' }] };
test('attaches evidence only to the exact originating approval and keeps original context', () => {
  assert.equal(pendingResearchConfirmation(message), id);
  const updated = attachResearchResult(message, result);
  assert.ok(updated.content.startsWith(message.content));
  assert.ok(updated.content.includes('Actual returned excerpt.'));
  assert.deepEqual(attachResearchResult(updated, result), updated);
  assert.deepEqual(attachResearchResult(JSON.parse(JSON.stringify(updated)), result), updated);
  assert.equal(attachResearchResult(message, { ...result, confirmationId: 'different' }), message);
  assert.equal(pendingResearchConfirmation({ ...message, role: 'user' }), null);
  assert.equal(pendingResearchConfirmation({ ...message, content: message.content + message.content }), null);
  const unavailable = markResearchUnavailable(message, id);
  assert.equal(markResearchUnavailable(unavailable, id), unavailable);
  assert.ok(!attachResearchResult(unavailable, result).content.includes('currently unavailable'));
  const chat = attachResearchResult({ ...message, featureOutput: { type: 'chat', content: message.content } }, result);
  assert.equal(chat.featureOutput.content, chat.content);
});

test('retains ordered rich blocks, source evidence and old citations through unavailable and recovered states', () => {
  const graph = { schemaVersion: 1, id: 'architecture', type: 'graph', nodes: [{ id: 'api', label: 'API' }], edges: [] };
  const original = { ...message, webSources: [{ title: 'Earlier evidence', url: 'https://example.com/earlier', snippet: 'Original excerpt.' }], featureOutput: {
    schemaVersion: 1, id: 'answer', status: 'completed', composition: 'source-order', sourceText: 'Original model protocol',
    blocks: [{ schemaVersion: 1, id: 'intro', type: 'narrative', text: message.content }, graph],
  } };
  const updated = attachResearchResult(markResearchUnavailable(original, id), result);
  assert.deepEqual(updated.featureOutput.blocks.slice(0, 2), original.featureOutput.blocks);
  assert.equal(updated.featureOutput.blocks.length, 3);
  assert.equal(updated.featureOutput.sourceText, original.featureOutput.sourceText);
  assert.equal(updated.featureOutput.blocks.filter(b => b.type === 'narrative').map(b => 'text' in b ? b.text : '').join('\n\n'), updated.content);
  assert.equal(updated.webSources.length, 2);
  assert.deepEqual(attachResearchResult(JSON.parse(JSON.stringify(updated)), result), updated);
});
