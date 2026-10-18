import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { executePreparedBusinessAction, verifyPlanDigest, type BusinessActionPlan } from './businessAction.js';
import { createBusinessActionConfirmation } from './businessActionConfirmations.js';

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)]));
  return value;
}
function fixture(): BusinessActionPlan {
  const unsigned = { version: '1.0' as const, sessionId: 'trs_fixture', useCase: 'Delete selected message', toolkit: 'slack', toolSlug: 'SLACK_DELETE_MESSAGE',
    arguments: { target: { channel: 'fixture-channel', message: 'fixture-message' } }, summary: 'Delete selected fixture message',
    risk: 'destructive' as const, requiresConfirmation: true, requiredScopes: ['fixture.delete'], scopeRequirements: null };
  return { ...unsigned, planDigest: createHash('sha256').update(JSON.stringify(canonical(unsigned))).digest('hex') };
}

test('existing action digest binds exact display, target, arguments, session and authority metadata', async t => {
  let externalCalls = 0;
  t.mock.method(globalThis, 'fetch', async () => { externalCalls++; throw new Error('No external request allowed'); });
  const plan = fixture();
  assert.equal(verifyPlanDigest(plan), true);
  assert.equal(verifyPlanDigest({ ...plan, arguments: { target: { message: 'fixture-message', channel: 'fixture-channel' } } }), true);
  for (const mutation of [
    { summary: 'Read a harmless document' }, { arguments: { target: { message: 'other-message', channel: 'fixture-channel' } } },
    { sessionId: 'trs_other' }, { toolSlug: 'SLACK_SEND_MESSAGE' }, { toolkit: 'other' },
    { requiredScopes: ['fixture.admin'] }, { requiresConfirmation: false }, { useCase: 'Other request' },
  ]) {
    const changed = { ...plan, ...mutation };
    assert.equal(verifyPlanDigest(changed), false);
    await assert.rejects(executePreparedBusinessAction({ userId: 'fixture-owner', plan: changed, authorization: { explicitUserAuthorization: true, confirmedHighRisk: true } }), { code: 'BUSINESS_ACTION_PLAN_CHANGED' });
    await assert.rejects(createBusinessActionConfirmation('fixture-owner', changed), { code: 'BUSINESS_ACTION_PLAN_CHANGED' });
  }
  assert.equal(externalCalls, 0);
});

test('old summary-unbound digests and unsafe cyclic or prototype arguments fail closed', () => {
  const plan = fixture();
  const { summary: _summary, planDigest: _digest, ...oldUnsigned } = plan;
  const oldDigest = createHash('sha256').update(JSON.stringify(canonical(oldUnsigned))).digest('hex');
  assert.equal(verifyPlanDigest({ ...plan, planDigest: oldDigest }), false);
  const cycle: Record<string, unknown> = {}; cycle.self = cycle;
  assert.equal(verifyPlanDigest({ ...plan, arguments: cycle }), false);
  assert.equal(verifyPlanDigest({ ...plan, arguments: JSON.parse('{"__proto__":{"admin":true}}') }), false);
});

test('metadata waits cannot change the admitted actor plan or confirmation authority',async t=>{
  const previous=new Map(['COMPOSIO_API_KEY','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'].map(key=>[key,process.env[key]]));
  process.env.COMPOSIO_API_KEY='SYNTHETIC_NO_PROVIDER_CALL';process.env.SUPABASE_URL='http://127.0.0.1:1';process.env.SUPABASE_SERVICE_ROLE_KEY='SYNTHETIC_NO_DATABASE_CALL';
  t.after(()=>{for(const [key,value]of previous)value===undefined?delete process.env[key]:process.env[key]=value;});
  const owner='11111111-1111-4111-8111-111111111111';
  let enter!:()=>void,release!:()=>void,metadata=0,policies=0;
  const entered=new Promise<void>(resolve=>{enter=resolve;});const gate=new Promise<void>(resolve=>{release=resolve;});
  t.mock.method(globalThis,'fetch',async(input:string|URL|Request)=>{
    const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
    const respond=(body:unknown)=>new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});
    if(url.origin==='https://backend.composio.dev'&&url.pathname.includes('/tools/')){
      metadata++;assert.match(url.pathname,/SLACK_DELETE_MESSAGE/);enter();await gate;
      return respond({slug:'SLACK_DELETE_MESSAGE',toolkit:{slug:'slack'},tags:['destructive'],scopes:['fixture.delete']});
    }
    assert.equal(url.origin,'http://127.0.0.1:1','no provider execution endpoint is allowed');
    assert.equal(url.pathname,'/rest/v1/user_integrations');assert.equal(url.searchParams.get('user_id'),`eq.${owner}`);policies++;
    return respond({access_token:'always_ask',metadata:{mode:'always_ask'}});
  });
  const input:Parameters<typeof executePreparedBusinessAction>[0]={userId:owner,plan:fixture(),authorization:{explicitUserAuthorization:true}};
  const admitted=structuredClone(input.plan);const pending=executePreparedBusinessAction(input);await entered;
  input.userId='foreign';input.authorization.confirmedHighRisk=true;
  input.plan.sessionId='trs_other';input.plan.toolSlug='SLACK_SEND_MESSAGE';input.plan.requiresConfirmation=false;
  input.plan.summary='Read a harmless document';(input.plan.arguments.target as Record<string,unknown>).message='other-message';
  release();const result=await pending;assert.equal(result.status,'confirmation_required');
  if(result.status!=='confirmation_required')throw new Error('Expected original confirmation requirement');
  assert.deepEqual(result.plan,admitted);assert.equal(verifyPlanDigest(result.plan),true);assert.equal(metadata,1);assert.equal(policies,1);
});

test('metadata for a different same-toolkit action is rejected before policy or execution',async t=>{
  const previous=process.env.COMPOSIO_API_KEY;process.env.COMPOSIO_API_KEY='SYNTHETIC_NO_PROVIDER_CALL';
  t.after(()=>{previous===undefined?delete process.env.COMPOSIO_API_KEY:process.env.COMPOSIO_API_KEY=previous;});
  let requests=0;
  t.mock.method(globalThis,'fetch',async(input:string|URL|Request)=>{
    const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);requests++;
    assert.equal(url.origin,'https://backend.composio.dev');assert.match(url.pathname,/SLACK_DELETE_MESSAGE/);
    return new Response(JSON.stringify({slug:'SLACK_SEND_MESSAGE',toolkit:{slug:'slack'},tags:[]}),{status:200,headers:{'Content-Type':'application/json'}});
  });
  await assert.rejects(executePreparedBusinessAction({userId:'fixture-owner',plan:fixture(),authorization:{explicitUserAuthorization:true,confirmedHighRisk:true}}),
    {code:'COMPOSIO_TOOL_METADATA_MISMATCH',status:502});
  assert.equal(requests,1);
});

test('current plugin policy promotes routine writes to digest-bound pending confirmations without executing', async t => {
  const previous = new Map(['COMPOSIO_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].map(key => [key, process.env[key]]));
  process.env.COMPOSIO_API_KEY = 'SYNTHETIC_NO_PROVIDER_CALL';
  process.env.SUPABASE_URL = 'http://127.0.0.1:1';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'SYNTHETIC_NO_DATABASE_CALL';
  t.after(() => { for (const [key, value] of previous) value === undefined ? delete process.env[key] : process.env[key] = value; });
  const owner = '11111111-1111-4111-8111-111111111111';
  let mode = 'always_ask';
  let inserted = 0;
  let metadataCalls = 0;
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const respond = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
    if (url.origin === 'https://backend.composio.dev' && url.pathname.includes('/tools/')) {
      metadataCalls++;
      return respond({ slug: 'SLACK_SEND_MESSAGE', toolkit: { slug: 'slack' }, tags: [], scopes: ['fixture.write'] });
    }
    assert.equal(url.origin, 'http://127.0.0.1:1', 'No execution endpoint or unexpected network request allowed');
    if (url.pathname === '/rest/v1/user_integrations') {
      assert.equal(url.searchParams.get('user_id'), `eq.${owner}`);
      return mode === 'outage' ? respond({ message: 'Synthetic policy outage' }, 503) : respond({ access_token: mode, metadata: { mode } });
    }
    assert.equal(url.pathname, '/rest/v1/business_action_confirmations');
    assert.equal(init?.method, 'POST');
    const body = JSON.parse(String(init?.body));
    inserted++;
    assert.equal(body.user_id, owner);
    assert.equal(body.status, 'pending');
    assert.equal(body.plan.requiresConfirmation, true);
    assert.equal(verifyPlanDigest(body.plan), true);
    return respond({ ...body, id: '22222222-2222-4222-8222-222222222222', created_at: new Date().toISOString() });
  });
  const { planDigest: _digest, ...base } = fixture();
  const unsigned = { ...base, toolSlug: 'SLACK_SEND_MESSAGE', useCase: 'Send selected fixture message', summary: 'Send fixture message', risk: 'write' as const, requiresConfirmation: false, requiredScopes: ['fixture.write'] };
  const plan = { ...unsigned, planDigest: createHash('sha256').update(JSON.stringify(canonical(unsigned))).digest('hex') };
  for (mode of ['always_ask', 'read_only', 'outage']) {
    const result = await executePreparedBusinessAction({ userId: owner, plan, authorization: { explicitUserAuthorization: true } });
    assert.equal(result.status, 'confirmation_required');
    if (result.status !== 'confirmation_required') throw new Error('Expected pending confirmation');
    assert.equal(result.plan.requiresConfirmation, true);
    assert.equal(plan.requiresConfirmation, false, 'Original prepared plan must remain unchanged');
    assert.notEqual(result.plan.planDigest, plan.planDigest);
    assert.equal(verifyPlanDigest(result.plan), true);
    assert.equal((await createBusinessActionConfirmation(owner, result.plan)).status, 'pending');
    // Reusing the promoted plan without an affirmative confirmation still prompts.
    const replay = await executePreparedBusinessAction({ userId: owner, plan: result.plan, authorization: { explicitUserAuthorization: true } });
    assert.equal(replay.status, 'confirmation_required');
    await assert.rejects(executePreparedBusinessAction({ userId: owner, plan: { ...result.plan, requiresConfirmation: false }, authorization: { explicitUserAuthorization: true } }), { code: 'BUSINESS_ACTION_PLAN_CHANGED' });
  }
  assert.equal(inserted, 3);
  assert.equal(metadataCalls, 6);
});
