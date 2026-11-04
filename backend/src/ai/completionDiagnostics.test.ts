import test from 'node:test';
import assert from 'node:assert/strict';
import { CompletionDiagnostics, requirePublicCompletion, publicCompletionState, providerCostMicroUsd, requiresAuthorizationReview } from './completionDiagnostics.js';

test('the observed RLS contradiction cannot claim verified completion or trigger a second request', () => {
  const received = "RLS policies are the single enforcement point - they cannot be bypassed by the application layer. Privileged service-role queries bypass RLS.";
  assert.deepEqual(publicCompletionState('stop', received), {status:'partial',reason:'authorization_review'});
  assert.equal(requiresAuthorizationReview('JWT claims provide immediate revocation.'), true);
  for (const safe of [
    'RLS constrains roles subject to its policies. A service-role credential may bypass RLS.',
    'Do not claim RLS cannot be bypassed.',
    '> RLS cannot be bypassed.\nThat assertion is incorrect.',
    '```text\nRLS cannot be bypassed.\n```\nThe example above is unsafe.',
    'JWT claims can be stale. Check current membership for revocation.',
    'JWT claims do not provide immediate revocation.',
  ]) assert.equal(requiresAuthorizationReview(safe), false, safe);
  assert.equal(received.includes('cannot be bypassed'), true, 'The review does not rewrite or discard original content');
});

test('observed token-derived tenant authority without current membership remains visibly unaccepted', () => {
  const received = "Application code never trusts a `tenant_id` from the client; it reads the tenant from the authenticated session's JWT claim. The service_role bypasses RLS entirely.";
  assert.deepEqual(publicCompletionState('stop', received), { status:'partial', reason:'authorization_review' });
  assert.equal(publicCompletionState('stop', received + ' Check current server-owned membership and role for this user and tenant.').status,'complete');
  assert.equal(requiresAuthorizationReview('```text\n' + received + '\n```\nThis unsafe example omits revocation.'),false);
  assert.equal(requiresAuthorizationReview('The application reads tenant labels from the database. A JWT identifies the user.'),false);
  assert.ok(received.includes('JWT claim'), 'The original generated claim is preserved for review, not silently rewritten');
});

test('the new production credential/session contradiction stays unaccepted despite a later disclaimer', () => {
  const received = "The Supabase client is configured with the user's service role session. RLS policies enforce tenant isolation. The server's service-role key bypasses RLS and must be kept server-side.";
  assert.deepEqual(publicCompletionState('stop', received), {status:'partial',reason:'authorization_review'});
  assert.equal(requiresAuthorizationReview('The service_role respects RLS.'), true);
  for (const safe of [
    "Use the authenticated user's access token for user-scoped queries. A service-role credential bypasses RLS.",
    "Never configure the client with a user's service role session.",
    'The phrase service-role session is invalid.',
    '> The user has a service role session.\nThat quoted claim is incorrect.',
    '```text\nThe user has a service role session.\n```\nThis is an unsafe example.',
  ]) assert.equal(requiresAuthorizationReview(safe),false,safe);
  assert.ok(received.includes("user's service role session"), 'Review preserves the received answer and does not retry inference');
});

test('empty reasoning, tools, filters and missing choices remain failures with content-free receipts', t => {
  t.mock.method(console, 'warn', () => {});
  for (const message of [{reasoning_content:'PRIVATE reasoning'}, {reasoning:'PRIVATE reasoning'}, {tool_calls:[{arguments:'PRIVATE tool'}]}, {refusal:'PRIVATE refusal'}, {}]) {
    const diagnostic = new CompletionDiagnostics();
    diagnostic.observe({id:'gen-synthetic', choices:[{delta:message,finish_reason:'length'}],usage:{prompt_tokens:10,completion_tokens:30}}, true);
    assert.throws(() => requirePublicCompletion('', 'synthetic', diagnostic), error => {
      const value = error as Error & {code:string;retryable:boolean;completionDiagnostics:unknown};
      assert.equal(value.code,'EMPTY_PROVIDER_RESPONSE');
      assert.equal(value.retryable,false);
      const receipt = JSON.stringify(value.completionDiagnostics);
      assert.ok(!receipt.includes('PRIVATE'));
      assert.ok(receipt.includes('gen-synthetic'));
      return true;
    });
  }
});

test('token exhaustion and unconfirmed stops cannot claim a complete public answer', () => {
  assert.deepEqual(publicCompletionState('stop'), {status:'complete'});
  assert.deepEqual(publicCompletionState('length'), {status:'partial',reason:'output_limit'});
  for (const reason of [null,undefined,'content_filter','tool_calls','unexpected']) {
    assert.deepEqual(publicCompletionState(reason), {status:'partial',reason:'unconfirmed_stop'});
  }
});

test('provider charges retain sub-cent accuracy at integer ledger precision and malformed costs stop retries', () => {
  assert.equal(providerCostMicroUsd({cost:0.00198405}),1985);
  assert.equal(providerCostMicroUsd({cost:0}),0);
  assert.equal(providerCostMicroUsd({completion_tokens:4096}),undefined);
  for (const cost of [-1,NaN,Infinity,'0.001',{},Number.MAX_SAFE_INTEGER]) {
    assert.throws(()=>providerCostMicroUsd({cost}),{code:'POST_COMPLETION_ACCOUNTING_UNCERTAIN',retryable:false,providerCompleted:true});
  }
});

test('stream usage-only terminal chunk and nonstream answer are preserved without publishing reasoning', () => {
  const stream = new CompletionDiagnostics();
  stream.observe({id:'gen-synthetic',choices:[{delta:{reasoning_content:'private'},finish_reason:null}]}, true);
  stream.observe({choices:[{delta:{content:'answer'},finish_reason:'stop'}]}, true);
  stream.observe({choices:[],usage:{prompt_tokens:10,completion_tokens:20}}, true);
  assert.equal(requirePublicCompletion(' answer ', 'synthetic', stream),'answer');
  assert.deepEqual(stream.usage,{inputTokens:10,outputTokens:20});
  assert.equal(stream.finishReason,'stop');
  assert.equal(stream.reasoningCharacters,7);
  const nonstream = new CompletionDiagnostics();
  nonstream.observe({id:'bad / URL secret',choices:[{message:{content:'answer'}}],usage:{prompt_tokens:-1,completion_tokens:NaN}},false);
  assert.equal(nonstream.providerRequestId,null);
  assert.deepEqual(nonstream.usage,{inputTokens:null,outputTokens:null});
});

test('billing and tenant authority from client-supplied facts is flagged, while correct server-verified guidance is accepted', () => {
  const unsafe = [
    'After checkout, the success page unlocks the premium plan for the customer.',
    'The browser confirms the payment and activates the subscription in the database.',
    'The tenant_id from the request body is used directly to scope every query.',
    'The organization id in the query string is trusted as authority for reads and writes.',
  ];
  for (const sentence of unsafe) assert.equal(requiresAuthorizationReview(sentence), true, sentence);
  const safe = [
    'Never let the success page unlock a plan; Stripe sends a signed webhook, and the server verifies its signature before it updates the subscription.',
    'Do not trust a tenant_id from the request body; look up the current membership for the authenticated user instead.',
    'Instead of the browser confirming payment, a verified webhook marks the subscription active, idempotently.',
    'The server checks the current membership of the signed-in user before it scopes the query to the tenant.',
  ];
  for (const sentence of safe) assert.equal(requiresAuthorizationReview(sentence), false, sentence);
});
