import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { estimateProviderReservationMicroUsd } from '../ai/providerBudget.js';
import { parseBrowserJob } from './browserJob.js';
import { BrowserModelError, createBrowserModelGateway } from './browserModelGateway.js';

const job = (attempt = 1) => parseBrowserJob({
  version: 1, tenantId: 't1', userId: 'u1', projectId: 'p1', runId: 'r1', taskId: 'k1', attempt,
  allowedOrigins: ['https://example.com'], startUrl: 'https://example.com/',
  limits: { maxDurationMs: 60_000, maxNavigations: 5, maxRedirects: 1, maxPages: 1, maxResponseBytes: 1_000_000, maxArtifactBytes: 1_000_000, maxModelCostMicros: 2_000_000 },
});

function harness(reply: (body: any) => any) {
  const ledger = { reserved: [] as any[], settled: [] as any[], released: [] as any[] };
  const bodies: any[] = [];
  const gw = createBrowserModelGateway({
    modelId: 'deepseek_v4_flash',
    reserve: async (i) => { ledger.reserved.push(i); return { id: `res-${ledger.reserved.length}`, reservedMicroUsd: estimateProviderReservationMicroUsd(i), priceVersion: 'test' }; },
    settle: async (i) => { ledger.settled.push(i); },
    release: async (i) => { ledger.released.push(i); },
    client: () => ({ model: 'provider/model', create: async (body) => { bodies.push(body); return reply(body); } }),
  });
  return { gw, ledger, bodies };
}
const ok = (content: string, extra: any = {}) => ({ id: 'cmpl-1', choices: [{ message: { content, ...extra }, finish_reason: 'stop' }], usage: { prompt_tokens: 1_000, completion_tokens: 200 } });
const signal = new AbortController().signal;

describe('browser model gateway (Stagehand ClientLLM through the canonical ledger and route)', () => {
  it('reserves, calls the canonical route, settles the measured usage, and returns Stagehand structured output', async () => {
    const { gw, ledger, bodies } = harness(() => ok('{"elements":[{"selector":"a.next"}]}'));
    const r = await gw.generate({ systemPrompt: 'sys', messages: [{ role: 'user', content: [{ type: 'text', text: 'find next' }] }], responseFormat: { type: 'json_schema', name: 'Observe result', schema: { type: 'object' } } }, { job: job(), remainingMicros: 2_000_000, signal });
    assert.equal(ledger.reserved.length, 1); assert.equal(ledger.settled.length, 1); assert.equal(ledger.released.length, 0);
    assert.equal(ledger.settled[0].result.inputTokens, 1_000); assert.equal(ledger.settled[0].result.outputTokens, 200);
    assert.equal(bodies[0].response_format.type, 'json_schema'); assert.equal(bodies[0].response_format.json_schema.name, 'Observe_result');
    assert.equal(bodies[0].messages[0].role, 'system');
    assert.deepEqual((r.result as any).structuredContent, { elements: [{ selector: 'a.next' }] });
    assert.ok(r.costMicros > 0); assert.equal(r.inputTokens, 1_000);
  });

  it('uses a deterministic idempotency key per job attempt and call number; a new attempt is a new spend', async () => {
    const a = harness(() => ok('x')); const b = harness(() => ok('x'));
    const params = { messages: [{ role: 'user', content: { type: 'text', text: 'hi' } }] };
    await a.gw.generate(params, { job: job(1), remainingMicros: 2_000_000, signal });
    await a.gw.generate(params, { job: job(1), remainingMicros: 2_000_000, signal });
    await b.gw.generate(params, { job: job(1), remainingMicros: 2_000_000, signal });
    await b.gw.generate(params, { job: job(2), remainingMicros: 2_000_000, signal });
    assert.notEqual(a.ledger.reserved[0].idempotencyKey, a.ledger.reserved[1].idempotencyKey);
    assert.equal(a.ledger.reserved[0].idempotencyKey, b.ledger.reserved[0].idempotencyKey, 'a replay after a restart reuses the same reservation');
    assert.notEqual(b.ledger.reserved[0].idempotencyKey, b.ledger.reserved[1].idempotencyKey);
    assert.match(a.ledger.reserved[0].idempotencyKey, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('caps the answer to what the remaining allowance covers, and refuses before reserving when nothing fits', async () => {
    const { gw, ledger, bodies } = harness(() => ok('x'));
    const text = 'x'.repeat(600_000); // a large accessibility snapshot, as Stagehand sends
    const input = Math.ceil(JSON.stringify([{ role: 'user', content: [{ type: 'text', text }] }]).length / 3);
    const small = estimateProviderReservationMicroUsd({ modelId: 'deepseek_v4_flash', estimatedInputTokens: input, maximumOutputTokens: 256 });
    const full = estimateProviderReservationMicroUsd({ modelId: 'deepseek_v4_flash', estimatedInputTokens: input, maximumOutputTokens: 4_096 });
    assert.ok(full > small, 'the fixture must make output size matter');
    await gw.generate({ messages: [{ role: 'user', content: { type: 'text', text } }] }, { job: job(), remainingMicros: small, signal });
    assert.ok(bodies[0].max_tokens <= 256 && bodies[0].max_tokens >= 64, String(bodies[0].max_tokens));
    assert.equal(ledger.reserved[0].maximumOutputTokens, bodies[0].max_tokens);
    await assert.rejects(gw.generate({ messages: [{ role: 'user', content: { type: 'text', text } }] }, { job: job(), remainingMicros: Math.floor(small / 4), signal }), (e) => e instanceof BrowserModelError && e.code === 'MODEL_BUDGET_EXHAUSTED');
    assert.equal(ledger.reserved.length, 1, 'refused before reserving');
  });

  it('releases the reservation when the provider fails or does not report usage, and never answers unmeasured', async () => {
    const failing = harness(() => { throw new Error('503'); });
    await assert.rejects(failing.gw.generate({ messages: [{ role: 'user', content: { type: 'text', text: 'x' } }] }, { job: job(), remainingMicros: 2_000_000, signal }), (e) => e instanceof BrowserModelError && e.code === 'MODEL_FAILED');
    assert.equal(failing.ledger.released.length, 1); assert.equal(failing.ledger.settled.length, 0);
    const unmeasured = harness(() => ({ choices: [{ message: { content: 'x' } }] }));
    await assert.rejects(unmeasured.gw.generate({ messages: [{ role: 'user', content: { type: 'text', text: 'x' } }] }, { job: job(), remainingMicros: 2_000_000, signal }), (e) => e instanceof BrowserModelError && e.code === 'MODEL_USAGE_UNMEASURED');
    assert.equal(unmeasured.ledger.released.length, 1); assert.equal(unmeasured.ledger.settled.length, 0);
  });

  it('uses JSON mode plus the schema in the prompt for providers without strict json_schema (GLM, Kimi)', async () => {
    const bodies: any[] = [];
    const gw = createBrowserModelGateway({ modelId: 'glm_5_3_flash', reserve: async (i) => ({ id: 'r', reservedMicroUsd: estimateProviderReservationMicroUsd(i), priceVersion: 't' }), settle: async () => {}, release: async () => {},
      client: () => ({ model: 'glm', create: async (b) => { bodies.push(b); return ok('```json\n{"elements":[]}\n```'); } }) });
    const r = await gw.generate({ messages: [{ role: 'user', content: { type: 'text', text: 'observe' } }], responseFormat: { type: 'json_schema', name: 'Observe', schema: { type: 'object', required: ['elements'] } } }, { job: job(), remainingMicros: 2_000_000, signal });
    assert.deepEqual(bodies[0].response_format, { type: 'json_object' });
    assert.match(bodies[0].messages[0].content, /JSON Schema/);
    assert.deepEqual((r.result as any).structuredContent, { elements: [] });
  });

  it('maps tools, tool calls and tool results both ways (Stagehand act)', async () => {
    const { gw, bodies } = harness(() => ok('', { tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'click', arguments: '{"selector":"#go"}' } }] }));
    const r = await gw.generate({
      messages: [
        { role: 'user', content: { type: 'text', text: 'click go' } },
        { role: 'assistant', content: [{ type: 'tool_use', id: 'call_0', name: 'look', input: {} }] },
        { role: 'user', content: [{ type: 'tool_result', toolUseId: 'call_0', content: [{ type: 'text', text: 'tree' }] }] },
      ],
      tools: [{ name: 'click', description: 'click', inputSchema: { type: 'object', properties: { selector: { type: 'string' } } } }], toolChoice: { mode: 'required' },
    }, { job: job(), remainingMicros: 2_000_000, signal });
    assert.equal(bodies[0].tools[0].function.name, 'click'); assert.equal(bodies[0].tool_choice, 'required');
    assert.equal(bodies[0].messages[1].tool_calls[0].id, 'call_0'); assert.equal(bodies[0].messages[2].role, 'tool');
    assert.deepEqual((r.result as any).content, [{ type: 'tool_use', id: 'call_1', name: 'click', input: { selector: '#go' } }]);
  });
});
