import assert from 'node:assert/strict';
import test from 'node:test';

import { applyRequestedSourcePolicy, runWebIntelligence, webDecisionFromGoalContract } from './webIntelligence.js';
import { normalizeResearch } from './researchRouter.js';
import { goalContractSchema } from '../universal/goalContract.js';

test('a validated freshness contract deterministically selects evidence without a second model decision', () => {
  const goal = goalContractSchema.parse({
    version: '1.0',
    goal: 'Compare newly published protocol guidance from primary materials.',
    desiredOutcome: 'An evidence-backed comparison.',
    semanticIntent: 'INVESTIGATE',
    requiredCapabilities: ['research.public-web', 'conversation.respond'],
    freshnessRequirement: 'CURRENT_REQUIRED',
    sourcePolicy: { mode: 'official_only', scope: 'public_web', officialDomains: ['standards.example'] },
    confidence: 0.9,
    contextComplexity: 'high',
  });
  const decision = webDecisionFromGoalContract(goal);
  assert.equal(decision?.action, 'research');
  assert.equal(decision?.sourcePolicy, 'official_only');
  assert.deepEqual(decision?.officialDomains, ['standards.example']);
});

test('the canonical X capability can only produce an x_search decision', () => {
  const goal = goalContractSchema.parse({
    version: '1.0',
    goal: 'Summarize public discussion from X.',
    desiredOutcome: 'A sourced summary of X posts.',
    semanticIntent: 'INVESTIGATE',
    requiredCapabilities: ['research.x', 'conversation.respond'],
    sourcePolicy: { mode: 'any', scope: 'public_web', officialDomains: [] },
    confidence: 0.9,
  });
  assert.equal(webDecisionFromGoalContract(goal)?.action, 'x_research');
});

test('official-only evidence excludes secondary sources before synthesis and UI', () => {
  const normalized = normalizeResearch([
    { title: 'Official docs', url: 'https://docs.vendor.example/releases', snippet: 'Version 4 is stable.' },
    { title: 'Community tracker', url: 'https://tracker.example/releases', snippet: 'Version 4 is stable.' },
  ], { query: 'current release', officialDomains: ['vendor.example'] });
  const filtered = applyRequestedSourcePolicy(normalized, 'official_only');
  assert.deepEqual(filtered.sources.map((source) => source.url), ['https://docs.vendor.example/releases']);
  assert.equal(filtered.unavailable, false);

  const unavailable = applyRequestedSourcePolicy(
    normalizeResearch([
      { title: 'Community tracker', url: 'https://tracker.example/releases', snippet: 'Version 4 is stable.' },
    ], { query: 'current release', officialDomains: ['vendor.example'] }),
    'official_only',
  );
  assert.equal(unavailable.sources.length, 0);
  assert.equal(unavailable.unavailable, true);
});

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
