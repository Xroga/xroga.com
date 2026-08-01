import assert from 'node:assert/strict';
import test from 'node:test';
import { grokLiveSearch } from './research.js';

test('Grok live research uses the current Responses API web and X tools', async () => {
  let requestUrl = '';
  let requestBody: Record<string, unknown> = {};
  const result = await grokLiveSearch(
    'current DeFi protocol documentation',
    'protected-test-key',
    { includeX: true, forceX: true },
    async (url, init) => {
      requestUrl = String(url);
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        id: 'response-safe-id',
        output: [{
          type: 'message',
          content: [{
            type: 'output_text',
            text: 'Current evidence-backed summary.',
            annotations: [
              { type: 'url_citation', url: 'https://docs.example.com/defi', title: 'Docs' },
              { type: 'url_citation', url: 'https://x.com/example/status/1', title: 'X' },
            ],
          }],
        }],
        usage: { input_tokens: 21, output_tokens: 13, num_sources_used: 2 },
      }), { status: 200, headers: { 'content-type': 'application/json' } }) as never;
    },
  );

  assert.equal(requestUrl, 'https://api.x.ai/v1/responses');
  assert.deepEqual(requestBody.tools, [{ type: 'web_search' }, { type: 'x_search' }]);
  assert.equal('search_parameters' in requestBody, false);
  assert.equal(result.bundle.provider, 'grok_live');
  assert.equal(result.bundle.includedXSearch, true);
  assert.equal(result.bundle.sources.length, 2);
  assert.deepEqual(result.bundle.sources.map((source) => source.source), ['web', 'x']);
  assert.equal(result.inputTokens, 21);
  assert.equal(result.outputTokens, 13);
});

test('Grok live research refuses to treat uncited text as evidence', async () => {
  const result = await grokLiveSearch(
    'unsupported current claim',
    'protected-test-key',
    { includeX: false, forceX: false },
    async () => new Response(JSON.stringify({
      output: [{ content: [{ type: 'output_text', text: 'Uncited model text.' }] }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }) as never,
  );

  assert.equal(result.bundle.provider, 'none');
  assert.equal(result.bundle.summary, '');
  assert.deepEqual(result.bundle.sources, []);
});
