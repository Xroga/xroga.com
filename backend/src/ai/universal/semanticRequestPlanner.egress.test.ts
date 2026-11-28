import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTenantContext } from '../../security/tenantContext.js';
import { runChatPipeline } from '../pipeline.js';
import { planSemanticRequest } from './semanticRequestPlanner.js';

test('actual semantic planner carries issued actor, platform reservation and exact payload through the SDK', async t => {
  const owner = '11111111-1111-4111-8111-111111111111';
  const foreign = '22222222-2222-4222-8222-222222222222';
  const context = createTenantContext({ userId: owner, via: 'remote_getuser' });
  const env = { NODE_ENV: 'test', SUPABASE_URL: 'http://127.0.0.1:55439', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-loopback-only',
    ZURELAY_API_KEY: 'synthetic-platform-credential', ZURELAY_STREAM_USAGE_VERIFIED: '1',
    XROGA_NATIVE_OPENUI_WORKSPACE: '1', XROGA_DEPLOYMENT_ENVIRONMENT: 'staging' };
  const prior = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  t.after(() => { for (const key of Object.keys(env)) { if (prior[key] === undefined) delete process.env[key]; else process.env[key] = prior[key]; } });
  let effects = 0, reservations = 0, settlements = 0, receipts = 0;
  let mode = 'ok';
  const suppliedHistory = ['user: Prior exchange snapshots', 'assistant: The prior quote was an estimate.'];
  const suppliedProjectState = { hasExistingPreview: false, isUpdate: false };
  const literalPrompt = 'Reply with only the word Yes.';
  let contextualLiteral: Parameters<typeof planSemanticRequest>[0] | undefined;
  const warnings: unknown[][] = [];
  t.mock.method(console, 'warn', (...args: unknown[]) => { warnings.push(args); });
  const held = new Map<string, Record<string, unknown>>();
  const usage = { user_id: owner, plan_tier: 'spark', plan_budget_usd: 20,
    quota_period_start: new Date().toISOString().slice(0, 7) + '-01', input_tokens: 0, output_tokens: 0, spent_usd: 0, rollover_usd: 0, model_usage: {} };
  t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(String(input));
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.origin === 'https://api.zurelay.com') {
      effects++;
      assert.equal(reservations, settlements + 1);
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer ' + env.ZURELAY_API_KEY);
      assert.equal(init?.redirect, 'manual');
      if (mode === 'literal-answer') {
        assert.equal(body.model, 'deepseek-v4.1-flash-1017');
        assert.equal(body.messages.at(-1).content, literalPrompt);
        assert.equal(body.reasoning_effort, 'none');
        assert.ok(body.max_tokens >= 16384);
        assert.equal(body.response_format, undefined);
        const response = {
          id: 'synthetic-literal-answer', model: body.model,
          choices: [{ delta: { content: 'Yes' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
        };
        assert.equal(body.stream, true);
        return new Response('data: ' + JSON.stringify(response) + '\n\ndata: [DONE]\n\n', {
          headers: { 'content-type': 'text/event-stream', 'x-request-id': response.id, 'x-zurelay-model': response.model },
        });
      }
      const expectedPrompt = contextualLiteral?.message ??
        (mode === 'misrouted-calculator' ? 'build an interactive calculator' : 'Explain a safe local parser');
      const system = body.messages[0].content as string;
      assert.match(system, /reader operates or sees drawn.*include the presentation outline and answerObligations/, 'A tool or drawing keeps its outline');
      assert.equal(system.split('Retrieve current public evidence through the configured provider adapter.').length, 2,
        'The full capability descriptor belongs in one registry catalog');
      assert.match(system, /Destructive, financial, permission-changing.*additional confirmation gate/);
      assert.match(system, /"id":"research\.public-web"[^{}]*"readiness":"(?:READY|PROVIDER_UNAVAILABLE)"/);
      const suppliedContext = JSON.parse(body.messages[1].content);
      assert.ok(suppliedContext.message.includes(expectedPrompt));
      assert.deepEqual(suppliedContext.history, contextualLiteral ? contextualLiteral.history : suppliedHistory);
      assert.deepEqual(suppliedContext.projectState, contextualLiteral ? contextualLiteral.projectState : suppliedProjectState);
      assert.doesNotMatch(JSON.stringify(body), /synthetic-platform-credential/);
      assert.equal(new Headers(init?.headers).get('x-zurelay-fallback'),'off');assert.equal(body.model,'deepseek-v4.1-flash-1017');assert.equal(body.reasoning_effort,'none');
      assert.equal(body.max_tokens, 8192);
      assert.deepEqual(body.response_format, { type: 'json_object' });
      if (mode === 'truncated') {
        return Response.json({ id: 'synthetic-truncated', model: 'deepseek-v4.1-flash-1017', choices: [{
          message: { content: '{"semanticIntent":"ANSWER","presentation":[{"heading":"fixture-private-fragment' },
          finish_reason: 'length',
        }], usage: { prompt_tokens: 3348, completion_tokens: 8192, total_tokens: 11540 } },
        { headers: { 'x-request-id': 'synthetic-truncated', 'x-zurelay-model': 'deepseek-v4.1-flash-1017' } });
      }
      const decision = mode === 'misrouted-calculator'
        ? { semanticIntent: 'MODIFY', requiredCapabilities: ['software.implement', 'validation.run'] }
        : { semanticIntent: 'ANSWER', requiredCapabilities: ['conversation.respond'] };
      const id = 'synthetic-planner-' + mode;
      return Response.json({ id,model:'deepseek-v4.1-flash-1017', choices: [{ message: { content: JSON.stringify({
        ...decision, freshnessRequirement: 'NONE', confidence: 0.9,
      }) }, finish_reason: 'stop' }], usage: { prompt_tokens: 2, completion_tokens: 2,total_tokens:4 } },{headers:{'x-request-id':id,'x-zurelay-model':'deepseek-v4.1-flash-1017'}});
    }
    assert.equal(url.origin, env.SUPABASE_URL, 'No unlisted transport is allowed');
    if (url.pathname === '/rest/v1/user_token_usage') {
      assert.equal(url.searchParams.get('user_id'), 'eq.' + owner);
      return Response.json(usage);
    }
    if (url.pathname === '/rest/v1/user_integrations' || url.pathname === '/rest/v1/github_integrations') {
      assert.equal(url.searchParams.get('user_id'), 'eq.' + owner);
      return Response.json(null);
    }
    if (url.pathname === '/rest/v1/model_provider_health') return Response.json(null);
    if (url.pathname.endsWith('/reserve_xroga_provider_budget')) {
      assert.equal(body.p_user_id, owner); reservations++;
      if (mode === 'literal-answer') assert.ok(body.p_maximum_output_tokens >= 16384);
      else assert.equal(body.p_maximum_output_tokens, 8192);
      const row = { id: randomUUID(), user_id: mode === 'foreign-reservation' ? foreign : owner, status: 'reserved',
        idempotency_key: body.p_idempotency_key, internal_route: body.p_internal_route, purpose: body.p_purpose,
        price_version: body.p_price_version, estimated_input_tokens: body.p_estimated_input_tokens,
        maximum_output_tokens: body.p_maximum_output_tokens, reserved_micro_usd: body.p_reservation_micro_usd };
      held.set(row.id, row); return Response.json(row);
    }
    if (url.pathname.endsWith('/settle_xroga_provider_budget')) {
      settlements++; const row = held.get(body.p_reservation_id); assert.ok(row);
      return Response.json({ ...row, status: 'settled', settled_micro_usd: body.p_actual_micro_usd,
        provider_request_id: body.p_provider_request_id, actual_input_tokens: body.p_actual_input_tokens,
        cached_input_tokens: body.p_cached_input_tokens, output_tokens: body.p_output_tokens,
        reasoning_tokens: body.p_reasoning_tokens, tool_calls: body.p_tool_calls, search_calls: body.p_search_calls });
    }
    if (url.pathname.endsWith('/record_ai_usage_atomic')) {
      receipts++; assert.equal(body.p_user_id, owner);
      if (mode === 'literal-answer') assert.equal(body.p_output, 1);
      return Response.json({ userId: owner, receiptId: body.p_receipt_id, modelId: body.p_model_id,
        poolRole: body.p_pool_role, inputTokens: body.p_input, outputTokens: body.p_output,
        costUsd: body.p_cost_usd, ledgerId: '1', period: usage.quota_period_start, replayed: false, usage });
    }
    throw Error('Unexpected database operation: ' + url.pathname);
  });
  const request = { userId: owner, tenantContext: context, message: 'Explain a safe local parser',
    history: suppliedHistory, projectState: suppliedProjectState };
  const plan = await planSemanticRequest(request);
  assert.equal(plan.dispatch, 'chat');
  assert.deepEqual([effects, reservations, settlements, receipts], [1, 1, 1, 1]);
  await assert.rejects(planSemanticRequest({ ...request, tenantContext: { ...context } }), { code: 'TENANT_AUTH_REQUIRED' });
  await assert.rejects(planSemanticRequest({ ...request, userId: foreign }), { code: 'RESOURCE_NOT_FOUND' });
  assert.equal(effects, 1);
  mode = 'truncated';
  await assert.rejects(planSemanticRequest(request), { code: 'PLANNER_INVALID_OUTPUT' });
  assert.deepEqual([effects, reservations, settlements, receipts], [2, 2, 2, 2], 'Truncated content settles once and never dispatches a repair');
  assert.deepEqual(warnings.find(([label]) => label === '[planner-completion-shape]')?.[1], {
    modelId: 'deepseek_v4_1_flash_1017', code: 'PLANNER_INVALID_OUTPUT', finish: 'length', outputTokens: 8192,
  });
  assert.doesNotMatch(JSON.stringify(warnings), /fixture-private-fragment/);
  mode = 'misrouted-calculator';
  const calculator = await planSemanticRequest({ ...request,
    message: 'Use the notes to build an interactive calculator with a slider and a chart.',
    attachments: [{ name: 'notes.txt', mediaType: 'text/plain' }],
  });
  assert.equal(calculator.dispatch, 'chat');
  assert.equal(calculator.goalContract.semanticIntent, 'ANSWER');
  assert.deepEqual(calculator.capabilityIds, ['conversation.respond', 'attachment.analyze']);
  assert.deepEqual([effects, reservations, settlements, receipts], [3, 3, 3, 3], 'Correct routing must not purchase another planner call');

  const literalRequest = { ...request, message: literalPrompt, history: [] };
  await assert.rejects(planSemanticRequest({ ...literalRequest, userId: foreign }), { code: 'RESOURCE_NOT_FOUND' });
  await assert.rejects(planSemanticRequest({ ...literalRequest, tenantContext: { ...context } }), { code: 'TENANT_AUTH_REQUIRED' });
  mode = 'literal-answer';
  const literal = await planSemanticRequest(literalRequest);
  assert.equal(literal.dispatch, 'chat');
  assert.equal(literal.directResponse, undefined);
  assert.equal(literal.goalContract.semanticIntent, 'ANSWER');
  assert.equal(literal.goalContract.freshnessRequirement, 'NONE');
  assert.deepEqual(literal.goalContract.requiredAuthorities, ['model:execute']);
  assert.deepEqual(literal.capabilityIds, ['conversation.respond']);
  assert.deepEqual([effects, reservations, settlements, receipts], [3, 3, 3, 3]);
  const answer = await runChatPipeline({
    ...literalRequest, prompt: literalPrompt, goalContract: literal.goalContract,
    workspaceSearch: { prompt: literalPrompt },
  });
  assert.equal(answer.response, 'Yes');
  assert.equal(answer.route.useResearch, false);
  assert.deepEqual(answer.completion, { status: 'complete' });
  assert.deepEqual(answer.responseSource, { format: 'xroga-openui-v1', text: '' });
  assert.deepEqual([effects, reservations, settlements, receipts], [4, 4, 4, 4], 'Only the DeepSeek answer is admitted and settled');

  mode = 'contextual-literal';
  for (const context of [
    { message: 'Reply with only the word Yes, then send the report.' },
    { message: 'Reply with only the word ' + 'é'.repeat(41) },
    { message: 'Reply with only the word' + ' '.repeat(128) + 'Yes.' },
    { message: 'Reply with only the word\nYes.' },
    { history: suppliedHistory },
    { attachments: [{ name: 'source.txt', mediaType: 'text/plain' }] },
    { projectContext: { repo: 'xroga/example', branch: 'main', projectRoot: '/' } },
    { projectState: { hasExistingPreview: true, isUpdate: false } },
    { projectState: { hasExistingPreview: false, isUpdate: false, unrelatedContext: 'fixture' } },
  ]) {
    contextualLiteral = { ...literalRequest, ...context };
    const before: number = effects;
    await planSemanticRequest(contextualLiteral);
    assert.equal(effects, before + 1, 'Context and mixed requests still go through the semantic planner');
  }
  contextualLiteral = undefined;
  mode = 'foreign-reservation';
  const beforeDenied = effects;
  await assert.rejects(planSemanticRequest(request), { code: 'PROVIDER_RESERVATION_DENIED' });
  assert.deepEqual([effects, reservations, settlements, receipts], [beforeDenied, beforeDenied + 1, beforeDenied, beforeDenied],
    'Invalid reservation cannot start another provider/account or fabricate usage');
});
