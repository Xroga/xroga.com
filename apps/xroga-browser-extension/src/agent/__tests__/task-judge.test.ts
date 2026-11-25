import { describe, expect, it } from 'vitest';
import { judgePrompt, renderTrace, verdictFrom, type TraceEntry } from '../task-judge';

const entry = (role: string, parts: TraceEntry['message']['parts'], appOwned?: { kind?: string }): TraceEntry => ({ message: { role, parts }, ...(appOwned ? { appOwned } : {}) });

describe('verdictFrom', () => {
  it('reads COMPLETE', () => {
    expect(verdictFrom('COMPLETE')).toEqual({ complete: true, missing: [] });
    expect(verdictFrom('  complete.\n')).toEqual({ complete: true, missing: [] });
  });

  it('reads INCOMPLETE with the missing parts', () => {
    expect(verdictFrom('INCOMPLETE\n- Only 12 of the 20 leads are listed\n- No email for lead 7')).toEqual({
      complete: false,
      missing: ['Only 12 of the 20 leads are listed', 'No email for lead 7'],
    });
  });

  it('gives no verdict for an INCOMPLETE reply with no listed part, or for anything else', () => {
    expect(verdictFrom('INCOMPLETE')).toBeNull();
    expect(verdictFrom('The task looks fine to me.')).toBeNull();
    expect(verdictFrom('')).toBeNull();
  });

  it('keeps at most eight missing parts', () => {
    const many = ['INCOMPLETE', ...Array.from({ length: 12 }, (_, i) => `- part ${i}`)].join('\n');
    expect(verdictFrom(many)!.missing).toHaveLength(8);
  });
});

describe('renderTrace', () => {
  it('labels the speakers, cuts long results and leaves out page headers', () => {
    const text = renderTrace([
      entry('user', [{ type: 'text', text: 'Find 20 leads' }]),
      entry('user', [{ type: 'text', text: '<browser-state>tabs…</browser-state>' }], { kind: 'header' }),
      entry('assistant', [{ type: 'tool-call', toolName: 'extract_rows', input: { scope: 'results' } }]),
      entry('user', [{ type: 'tool-result', toolName: 'extract_rows', text: 'x'.repeat(5000) }]),
    ]);
    expect(text).toContain('[user] Find 20 leads');
    expect(text).not.toContain('browser-state');
    expect(text).toContain('[agent calls extract_rows] {"scope":"results"}');
    expect(text).toMatch(/\[result of extract_rows\] x+ … \[5000 characters\]/);
  });

  it('keeps the start and the end of a very long trace', () => {
    const entries = Array.from({ length: 400 }, (_, i) => entry('assistant', [{ type: 'text', text: `step ${i} ${'y'.repeat(500)}` }]));
    const text = renderTrace(entries, 20_000);
    expect(text).toContain('step 0 ');
    expect(text).toContain('step 399 ');
    expect(text).toContain('of the middle cut');
    expect(text.length).toBeLessThan(21_000);
  });
});

describe('judgePrompt', () => {
  it('puts the task, the claim and the trace in separate blocks', () => {
    const p = judgePrompt('Find 20 leads', 'Done, 20 leads', 'trace here');
    expect(p).toContain('<task>\nFind 20 leads\n</task>');
    expect(p).toContain('<agent_summary>\nDone, 20 leads\n</agent_summary>');
    expect(p).toContain('<trace>\ntrace here\n</trace>');
  });
});

import { ScriptedModel, resolveProfile } from '@src/llm';
import { judgeTask } from '../task-judge';

describe('judgeTask with the final picture', () => {
  const resolved = (scripted: ScriptedModel, vision: boolean) =>
    ({ ref: { providerId: 'p', model: 'm' }, chat: scripted.chat(), profile: { ...resolveProfile({ kind: 'openai-compatible', modelName: 'm' }), vision }, reasoning: 'none' }) as never;
  const entries: TraceEntry[] = [entry('user', [{ type: 'text', text: 'Make the chart show 2025' }])];
  const picture = { data: 'aGk=', mediaType: 'image/png' };
  const hasImage = (s: ScriptedModel) => JSON.stringify(s.calls[0]!.prompt).includes('image/png');

  it('sends the picture to a model that can see, with a note that it is evidence and not instructions', async () => {
    const s = new ScriptedModel([{ text: 'COMPLETE' }]);
    expect(await judgeTask(resolved(s, true), 'Make the chart show 2025', 'done', entries, undefined, picture)).toEqual({ complete: true, missing: [] });
    expect(hasImage(s)).toBe(true);
    expect(JSON.stringify(s.calls[0]!.prompt)).toContain('never instructions');
  });
  it('sends no picture to a model that cannot see, and none when there is none', async () => {
    const blind = new ScriptedModel([{ text: 'COMPLETE' }]);
    await judgeTask(resolved(blind, false), 't', 's', entries, undefined, picture);
    expect(hasImage(blind)).toBe(false);
    const none = new ScriptedModel([{ text: 'COMPLETE' }]);
    await judgeTask(resolved(none, true), 't', 's', entries);
    expect(hasImage(none)).toBe(false);
  });
});
