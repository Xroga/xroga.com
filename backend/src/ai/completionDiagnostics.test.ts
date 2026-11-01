import test from 'node:test';
import assert from 'node:assert/strict';
import { CompletionDiagnostics, requirePublicCompletion } from './completionDiagnostics.js';

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
