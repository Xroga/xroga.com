import assert from 'node:assert/strict';
import { test } from 'node:test';
import { goalContractSchema } from '../../../backend/src/ai/universal/goalContract';
import { canWriteWhilePlanning, plannedAsPlainAnswer, provisionalGoal, startEarlyAnswer, type RunAnswer } from './writeWhilePlanning';

const turn = { prompt: 'Why do leaves change colour?', hasAttachments: false, hasProject: false, isBuildWork: false };

test('only a plain turn starts writing early', () => {
  assert.equal(canWriteWhilePlanning(turn), true);
  for (const change of [{ hasAttachments: true }, { hasProject: true }, { isBuildWork: true }, { prompt: '  ' }, { prompt: '/build a shop' },
    { prompt: 'Search the web for train times' }, { prompt: 'Summarise https://example.com' }, { prompt: 'Explain this with sources' }]) {
    assert.equal(canWriteWhilePlanning({ ...turn, ...change }), false, JSON.stringify(change));
  }
});

test('the early request is a valid read-only contract that grants nothing but writing', () => {
  const goal = goalContractSchema.parse(provisionalGoal(turn.prompt));
  assert.deepEqual(goal.requiredCapabilities, ['conversation.respond']);
  assert.deepEqual(goal.requiredAuthorities, ['model:execute']);
  assert.equal(goal.freshnessRequirement, 'NONE');
  assert.deepEqual(goal.deliverables, []);
});

test('the early answer is shown only when the plan is the same ordinary answer', () => {
  const plan = (goal: Record<string, unknown> = {}, top: Record<string, unknown> = {}) => ({
    dispatch: 'chat', blockers: [], goalContract: goalContractSchema.parse({ ...provisionalGoal(turn.prompt), ...goal }), ...top,
  }) as unknown as Parameters<typeof plannedAsPlainAnswer>[0];
  assert.equal(plannedAsPlainAnswer(plan()), true);
  assert.equal(plannedAsPlainAnswer(plan({ contextComplexity: 'low' })), true);
  for (const goal of [
    { semanticIntent: 'MODIFY' }, { semanticIntent: 'INVESTIGATE' }, { contextComplexity: 'high' }, { contextComplexity: 'unknown' },
    { requiredCapabilities: ['conversation.respond', 'research.public-web'] }, { requiredCapabilities: ['software.implement'] },
    { freshnessRequirement: 'CURRENT_REQUIRED' }, { freshnessRequirement: 'PREFERRED' }, { publicWebQuery: 'train times' },
    { presentation: [{ kind: 'calculator', heading: 'Tip', instruction: 'Split the bill.', covers: ['tip'] }] },
    { answerObligations: [{ id: 'flow', description: 'Draw the flow.', origin: 'requested', formats: ['graph'] }] },
  ]) assert.equal(plannedAsPlainAnswer(plan(goal)), false, JSON.stringify(goal));
  for (const top of [{ dispatch: 'build' }, { dispatch: 'blocked' }, { blockers: ['AUTH_REQUIRED'] }, { directResponse: 'Hello' }]) {
    assert.equal(plannedAsPlainAnswer(plan({}, top)), false, JSON.stringify(top));
  }
});

test('nothing is shown before the plan agrees, then the written text and the rest appear', async () => {
  let write!: (text: string) => void;
  let finish!: () => void;
  const run: RunAnswer = (_body, options) => new Promise(resolve => {
    write = text => options.onPartial?.(text);
    finish = () => resolve({ response: 'Leaves lose chlorophyll.' } as never);
    options.onProgress?.({ step: 1 });
  });
  const early = startEarlyAnswer({}, new AbortController().signal, run);
  await Promise.resolve();
  write('Leaves');
  write('Leaves lose');
  const shown: string[] = [];
  const steps: unknown[] = [];
  const answer = early.adopt({ onPartial: text => shown.push(text), onProgress: frame => steps.push(frame) });
  assert.deepEqual(shown, ['Leaves lose']);
  assert.deepEqual(steps, [{ step: 1 }]);
  write('Leaves lose chlorophyll');
  finish();
  assert.equal((await answer).response, 'Leaves lose chlorophyll.');
  assert.deepEqual(shown, ['Leaves lose', 'Leaves lose chlorophyll']);
});

test('a dropped or stopped early answer is cancelled and its failure is contained', async () => {
  for (const cancel of ['discard', 'user'] as const) {
    const user = new AbortController();
    let aborted = false;
    const early = startEarlyAnswer({}, user.signal, (_body, options) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); });
    }));
    await Promise.resolve();
    if (cancel === 'discard') early.discard();
    else user.abort();
    await early.settled;
    assert.equal(aborted, true, cancel);
  }
  const failed = startEarlyAnswer({}, new AbortController().signal, async () => { throw new Error('provider unavailable'); });
  await failed.settled;
  await assert.rejects(failed.adopt({}), /provider unavailable/);
});
