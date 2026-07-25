import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewBuildOutput } from './qa.js';

test('the persisted selected reviewer route performs the structured review', async () => {
  let calledModel = '';
  const result = await reviewBuildOutput({
    prompt: 'secure auth changes', html: '<main>ok</main>', css: '', js: '',
    files: [{ path: 'index.html', content: '<!doctype html><html><body><main>ok</main></body></html>' }],
    reviewerModel: 'grok_4_5',
    completion: async (model) => {
      calledModel = model;
      return {
        text: JSON.stringify({ ok: true, issues: [], fixHints: [], findings: [] }),
        inputTokens: 10, outputTokens: 10, totalTokens: 20, modelId: model,
        apiModel: 'test-reviewer', provider: 'test-provider',
      };
    },
  });
  assert.equal(calledModel, 'grok_4_5');
  assert.equal(result.reviewerModel, 'grok_4_5');
});
