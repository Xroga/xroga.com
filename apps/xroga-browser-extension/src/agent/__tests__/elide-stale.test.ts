import { describe, expect, it } from 'vitest';
import type { ModelMessage } from '@src/llm';
import { elideStaleObservations } from '../context';

const result = (id: string, toolName: string, text: string, type = 'text'): ModelMessage =>
  ({ role: 'tool', content: [{ type: 'tool-result', toolCallId: id, toolName, output: { type, value: text } }] }) as ModelMessage;
const call = (id: string, toolName: string): ModelMessage =>
  ({ role: 'assistant', content: [{ type: 'tool-call', toolCallId: id, toolName, input: {} }] }) as ModelMessage;
const big = (label: string) => `${label} head line\n` + 'x'.repeat(5_000);
const text = (m: ModelMessage) => String((m.content as Array<{ output: { value: string } }>)[0].output.value);

describe('elideStaleObservations', () => {
  const conversation = [
    { role: 'user', content: [{ type: 'text', text: 'goal' }] } as ModelMessage,
    call('1', 'snapshot'), result('1', 'snapshot', big('snap1')),
    call('2', 'click'), result('2', 'click', big('click2')),
    call('3', 'read'), result('3', 'read', big('read3')),
    call('4', 'click'), result('4', 'click', big('click4')),
    call('5', 'fill_form'), result('5', 'fill_form', big('form5')),
  ];

  it('cuts the page view of steps older than the newest two, keeping their first lines', () => {
    const out = elideStaleObservations(conversation);
    expect(text(out[2])).toContain('snap1 head line');
    expect(text(out[2])).toContain('left out');
    expect(text(out[2]).length).toBeLessThan(1_000);
    expect(text(out[4])).toContain('left out');
  });

  it('keeps the newest two in full and never cuts a read', () => {
    const out = elideStaleObservations(conversation);
    expect(text(out[8]).length).toBeGreaterThan(5_000);
    expect(text(out[10]).length).toBeGreaterThan(5_000);
    expect(text(out[6]).length).toBeGreaterThan(5_000);
  });

  it('leaves short results, errors and a short history alone', () => {
    const short = [
      call('1', 'click'), result('1', 'click', 'ok'),
      call('2', 'click'), result('2', 'click', big('a'), 'error-text'),
      call('3', 'click'), result('3', 'click', 'ok'),
      call('4', 'click'), result('4', 'click', 'ok'),
    ];
    expect(elideStaleObservations(short)).toEqual(short);
    expect(elideStaleObservations(conversation.slice(0, 5))).toEqual(conversation.slice(0, 5));
  });

  it('does not change a result once it has been cut, so the earlier request stays the same', () => {
    const once = elideStaleObservations(conversation);
    const later = elideStaleObservations([...conversation, call('6', 'click'), result('6', 'click', big('click6'))]);
    expect(text(later[2])).toBe(text(once[2]));
    expect(text(later[4])).toBe(text(once[4]));
  });
});
