import assert from 'node:assert/strict';
import test from 'node:test';

import { runWebIntelligence } from './webIntelligence.js';

test('production web intelligence uses Parallel for public URLs and x_search-only Grok for X', async () => {
  const priorFetch = globalThis.fetch;
  const priorParallel = process.env.PARALLEL_API_KEY;
  const priorXai = process.env.XAI_API_KEY;
  const urls: string[] = [];
  const bodies: Array<Record<string, unknown>> = [];

  process.env.PARALLEL_API_KEY = 'parallel-test-key';
  process.env.XAI_API_KEY = 'xai-test-key';

  globalThis.fetch = (async (url, init) => {
    const requestUrl = String(url);
    urls.push(requestUrl);
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);

    if (requestUrl === 'https://api.parallel.ai/v1/extract') {
      return new Response(JSON.stringify({
        extract_id: 'parallel-request',
        results: [{
          url: 'https://docs.example.com/current',
          title: 'Current docs',
          excerpts: ['Current public documentation.'],
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    if (requestUrl === 'https://api.x.ai/v1/responses') {
      return new Response(JSON.stringify({
        id: 'x-request',
        output: [{
          content: [{
            type: 'output_text',
            text: 'Cited X evidence.',
            annotations: [{ url: 'https://x.com/example/status/1', title: 'X post' }],
          }],
        }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    throw new Error(`unexpected provider URL: ${requestUrl}`);
  }) as typeof fetch;

  try {
    const web = await runWebIntelligence({
      userId: 'test-user',
      prompt: 'Read https://docs.example.com/current',
    });
    const x = await runWebIntelligence({
      userId: 'test-user',
      prompt: 'Read https://x.com/example/status/1',
    });

    assert.equal(web.bundle?.provider, 'parallel');
    assert.equal(x.bundle?.provider, 'grok_x');
    assert.deepEqual(bodies[1]?.tools, [{ type: 'x_search' }]);
    assert.equal(bodies[1]?.max_output_tokens, 500);
    assert.equal(urls.some((url) => /tavily|searx/i.test(url)), false);
  } finally {
    globalThis.fetch = priorFetch;
    if (priorParallel === undefined) delete process.env.PARALLEL_API_KEY;
    else process.env.PARALLEL_API_KEY = priorParallel;
    if (priorXai === undefined) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = priorXai;
  }
});
