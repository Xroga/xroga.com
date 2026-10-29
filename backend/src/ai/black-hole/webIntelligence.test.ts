import assert from 'node:assert/strict';
import test from 'node:test';

import { applyRequestedSourcePolicy, runWebIntelligence, webDecisionFromGoalContract } from './webIntelligence.js';
import { normalizeResearch } from './researchRouter.js';
import { goalContractSchema } from '../universal/goalContract.js';
import {createTenantContext} from '../../security/tenantContext.js';
import {nativeReleaseFixture} from '../../services/publish/__tests__/nativeReleaseFixture.js';
import {resetCredentialVaultRuntimeForTests} from '../../services/integrations/credentialVaultRuntime.js';
import {randomUUID} from 'node:crypto';

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

test('production web intelligence preserves pending research approval and explicitly denies unaccounted X research', async () => {
  const vaultEnv={NODE_ENV:process.env.NODE_ENV,XROGA_TEST_CREDENTIAL_KEK:process.env.XROGA_TEST_CREDENTIAL_KEK};process.env.NODE_ENV='test';process.env.XROGA_TEST_CREDENTIAL_KEK=Buffer.alloc(32,27).toString('base64url');resetCredentialVaultRuntimeForTests();
  const priorFetch = globalThis.fetch;
  const priorParallel = process.env.PARALLEL_API_KEY;
  const priorXai = process.env.XAI_API_KEY;
  const priorUrl=process.env.SUPABASE_URL,priorService=process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL='http://127.0.0.1:55439';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-only';
  const owner='11111111-1111-4111-8111-111111111111';
  const dispatchScope={userId:owner,context:createTenantContext({userId:owner,via:'remote_getuser'})};
  const confirmations=nativeReleaseFixture(owner);
  let reservation:Record<string,unknown>|undefined;
  const urls: string[] = [];
  const bodies: Array<Record<string, unknown>> = [];

  process.env.PARALLEL_API_KEY = 'parallel-test-key';
  process.env.XAI_API_KEY = 'xai-test-key';

  globalThis.fetch = (async (url, init) => {
    const requestUrl = String(url);
    const local=new URL(requestUrl),row=init?.body?JSON.parse(String(init.body)):{};
    if(local.origin===process.env.SUPABASE_URL){
      if(local.pathname.endsWith('/business_action_confirmations'))return(await confirmations.database(local,init))!;
      if(local.pathname==='/rest/v1/production_audit_log')return Response.json(row);
      if(local.pathname==='/rest/v1/rpc/reserve_xroga_provider_budget'){
        reservation={id:randomUUID(),user_id:owner,idempotency_key:row.p_idempotency_key,internal_route:row.p_internal_route,price_version:row.p_price_version,purpose:row.p_purpose,status:'reserved',estimated_input_tokens:0,maximum_output_tokens:0,reserved_micro_usd:row.p_reservation_micro_usd};
        return Response.json(reservation);
      }
      if(local.pathname==='/rest/v1/rpc/settle_xroga_provider_budget')return Response.json({...reservation,status:'settled',settled_micro_usd:row.p_actual_micro_usd,provider_request_id:row.p_provider_request_id,actual_input_tokens:0,cached_input_tokens:0,output_tokens:0,reasoning_tokens:0,tool_calls:0,search_calls:row.p_search_calls});
      if(local.pathname==='/rest/v1/xroga_billing_cycles')return Response.json({id:randomUUID()});
      if(local.pathname==='/rest/v1/xroga_web_usage')return new Response(null,{status:201});
      throw Error('Unexpected isolated accounting request '+local.pathname);
    }
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
      userId: owner,dispatchScope,
      prompt: 'Read https://docs.example.com/current',
    });
    await assert.rejects(runWebIntelligence({
      userId:owner,dispatchScope,prompt:'Read https://x.com/example/status/1',
    }),{code:'PROVIDER_RESERVATION_DENIED',reason:'X_SEARCH_ACCOUNTING_UNAVAILABLE'});
    assert.equal(web.bundle,null);assert.equal(web.needsConfirmation,true);assert.equal(web.sourceCount,0);assert.match(web.reviewUrl!,/^\/dashboard\/actions\/confirm\/[a-f0-9-]{36}$/);
    assert.equal(urls.length,0);assert.equal(reservation,undefined);assert.match(web.evidence,/pending exact external-data approval/);
    assert.equal(urls.some((url) => /tavily|searx/i.test(url)), false);
  } finally {
    resetCredentialVaultRuntimeForTests();for(const[k,v]of Object.entries(vaultEnv))if(v===undefined)delete process.env[k];else process.env[k]=v;
    globalThis.fetch = priorFetch;
    if(priorUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=priorUrl;
    if(priorService===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=priorService;
    if (priorParallel === undefined) delete process.env.PARALLEL_API_KEY;
    else process.env.PARALLEL_API_KEY = priorParallel;
    if (priorXai === undefined) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = priorXai;
  }
});
