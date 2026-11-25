import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { NATIVE_UI_MARKER, splitNativeOpenUiAnswer } from './nativeOpenUi.js';
import { completeNativeWorkspaceAnswer } from './nativeOpenUiWorkspace.js';
import type { ChatMessage, ChatResult } from './openaiCompat.js';
import { continueWorkspaceAnswer } from './workspaceAnswerContinuation.js';

function completion(text: string, finishReason: string, outputTokens = 60): ChatResult {
  return { text, finishReason, outputTokens, inputTokens: 20, totalTokens: 20 + outputTokens,
    modelId: 'deepseek_v4_1_flash_1017', apiModel: 'deepseek-v4.1-flash-1017', provider: 'zurelay' };
}

const messages: ChatMessage[] = [
  { role: 'system', content: 'Verified sources: source-1.' },
  { role: 'user', content: 'Prepare the complete analysis, citing the source.' },
];

test('continues only a settled output boundary, preserving inputs and completed paragraphs', async () => {
  const draft = 'First section.\n\nTraceable source-backed finding [1].';
  let calls = 0;
  const result = await continueWorkspaceAnswer({
    initial: completion(draft, 'length'), messages, maximumOutputTokens: 500, preferredChunkTokens: 100,
    signal: new AbortController().signal,
    dispatch: async (input, limit) => {
      calls++;
      assert.deepEqual(input.slice(0, 2), messages);
      assert.equal(input[2].content, draft);
      assert.equal(limit, 100);
      return completion('Traceable source-backed finding [1].\n\nFinal section.', 'stop');
    },
    onFailure: error => { throw error; },
  });
  assert.equal(calls, 1);
  assert.equal(result.finishReason, 'stop');
  assert.equal(result.text, draft + '\n\nFinal section.');
});

test('extends a table without duplicating its repeated header or overlapping rows', async () => {
  const head = '| ID | Count |\n|---|---|';
  const draft = 'Inventory\n\n' + head + '\n| 001 | 2 |\n| 002 | 4 |';
  const result = await continueWorkspaceAnswer({
    initial: completion(draft, 'length'), messages, maximumOutputTokens: 500, preferredChunkTokens: 100,
    signal: new AbortController().signal,
    dispatch: async () => completion(head + '\n| 002 | 4 |\n| 003 | 6 |', 'stop'),
    onFailure: error => { throw error; },
  });
  assert.equal(result.text, draft + '\n| 003 | 6 |');
});

test('replaces an incomplete line and carries forward a previously valid visual', async () => {
  const firstProgram = 'root = Col([Text("Preserved")])';
  const result = await continueWorkspaceAnswer({
    initial: completion('This line was still being' + NATIVE_UI_MARKER + firstProgram, 'length'),
    messages, maximumOutputTokens: 500, preferredChunkTokens: 100, signal: new AbortController().signal,
    dispatch: async () => completion('This line was still being written.' + NATIVE_UI_MARKER + 'root = Unknown()', 'stop'),
    onFailure: error => { throw error; },
  });
  assert.deepEqual(splitNativeOpenUiAnswer(result.text), { text: 'This line was still being written.', program: firstProgram });
});

test('keeps an accepted table when a valid continuation omits its rows', async () => {
  const firstProgram = 'root = Col([Table(["ID", "Count"], [["001", "12"]])])';
  const result = await continueWorkspaceAnswer({
    initial: completion('Completed inventory.' + NATIVE_UI_MARKER + firstProgram, 'length'),
    messages, maximumOutputTokens: 500, preferredChunkTokens: 100, signal: new AbortController().signal,
    dispatch: async () => completion('Two locations were reviewed.' + NATIVE_UI_MARKER + 'root = Col([Text("Review complete")])', 'stop'),
    onFailure: error => { throw error; },
  });
  const answer = completeNativeWorkspaceAnswer(result.text, result.finishReason, undefined, 'Show the inventory table.', undefined, ['table']);
  assert.equal(answer.completion.status, 'complete');
  assert.match(answer.response, /Two locations were reviewed\./u);
  assert.match(answer.response, /\| 001 \| 12 \|/u);
  assert.equal(answer.responseSource.text, firstProgram);
  assert.equal(splitNativeOpenUiAnswer(result.text).program, firstProgram);
});

test('replaces an incomplete table with the validated program the continuation supplies', async () => {
  const malformed = 'root = Col([Table(["ID", "Count"], [["001"]])])';
  const repaired = 'root = Col([Table(["ID", "Count"], [["001", "12"]])])';
  const result = await continueWorkspaceAnswer({
    initial: completion('Inventory.' + NATIVE_UI_MARKER + malformed, 'length'),
    messages, maximumOutputTokens: 500, preferredChunkTokens: 100, signal: new AbortController().signal,
    dispatch: async () => completion(NATIVE_UI_MARKER + repaired, 'stop'),
    onFailure: error => { throw error; },
  });
  assert.deepEqual(splitNativeOpenUiAnswer(result.text), { text: 'Inventory.', program: repaired });
  assert.equal(result.finishReason, 'stop');
});

test('resumes a fenced code block verbatim and can parse the visual after its closing fence', async () => {
  const codeStart = 'A Python example.\n\n```python\ndef example():\n    first = 1';
  const codeEnd = '    second = 2\n    print(first + second)\n```';
  const program = 'root = Col([Text("The example prints 3.")])';
  const result = await continueWorkspaceAnswer({
    initial: completion(codeStart, 'length'), messages, maximumOutputTokens: 500, preferredChunkTokens: 100,
    signal: new AbortController().signal,
    dispatch: async () => completion(codeEnd + NATIVE_UI_MARKER + program, 'stop'),
    onFailure: error => { throw error; },
  });
  assert.deepEqual(splitNativeOpenUiAnswer(result.text), { text: codeStart + '\n' + codeEnd, program });
  assert.equal(result.finishReason, 'stop');
});

test('preserves the first answer if follow-up is interrupted, refuses, or repeats the draft', async () => {
  const initial = completion('Existing readable prose.', 'length');
  for (const finishReason of ['content_filter', 'tool_calls', 'length']) {
    let calls = 0;
    const result = await continueWorkspaceAnswer({
      initial, messages, maximumOutputTokens: 500, preferredChunkTokens: 100, signal: new AbortController().signal,
      dispatch: async () => { calls++; return completion(initial.text, finishReason); },
      onFailure: error => { throw error; },
    });
    assert.equal(result, initial);
    assert.equal(calls, 1);
  }
  const failure = Error('provider unavailable');
  let observed: unknown;
  const result = await continueWorkspaceAnswer({
    initial, messages, maximumOutputTokens: 500, preferredChunkTokens: 100, signal: new AbortController().signal,
    dispatch: async () => { throw failure; },
    onFailure: error => { observed = error; },
  });
  assert.equal(observed, failure);
  assert.equal(result, initial);
});

test('bounds productive continuation by the remaining total provider allowance', async () => {
  const limits: number[] = [];
  const result = await continueWorkspaceAnswer({
    initial: completion('Paragraph zero.', 'length', 10),
    messages, maximumOutputTokens: 40, preferredChunkTokens: 8, signal: new AbortController().signal,
    dispatch: async (_, tokens) => {
      limits.push(tokens);
      return completion('Paragraph ' + limits.length + '.', 'length', tokens);
    },
    onFailure: error => { throw error; },
  });
  assert.deepEqual(limits, [8, 8, 8, 6]);
  assert.match(result.text, /Paragraph zero\.[\s\S]*Paragraph 4\./u);
  assert.equal(result.finishReason, 'length');
});

test('cancellation and successful, unknown or filtered termination cannot start a follow-up', async () => {
  const abort = new AbortController();
  abort.abort();
  for (const [reason, signal] of [['length', abort.signal], ['stop', new AbortController().signal],
    ['unknown', new AbortController().signal], ['content_filter', new AbortController().signal]] as const) {
    const initial = completion('Existing readable prose.', reason);
    const result = await continueWorkspaceAnswer({
      initial, messages, maximumOutputTokens: 500, preferredChunkTokens: 100, signal,
      dispatch: async () => { assert.fail('Unexpected dispatch'); },
      onFailure: error => { throw error; },
    });
    assert.equal(result, initial);
  }
});
