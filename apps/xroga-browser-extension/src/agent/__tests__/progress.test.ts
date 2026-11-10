import { describe, expect, it } from 'vitest';
import type { Entry } from '@src/store/types';
import { progressLedger } from '../progress';

let n = 0;
const message = (role: 'assistant' | 'tool', parts: unknown[]): Entry =>
  ({ id: `e${n++}`, type: 'message', parentId: null, appOwned: false, message: { role, parts } }) as unknown as Entry;
const call = (id: string, toolName: string, input: Record<string, unknown>) =>
  message('assistant', [{ type: 'tool-call', toolCallId: id, toolName, input }]);
const result = (id: string, toolName: string, text: string, isError = false) =>
  message('tool', [{ type: 'tool-result', toolCallId: id, toolName, text, isError }]);

describe('progressLedger', () => {
  it('lists page-changing steps with their purpose and outcome, oldest first', () => {
    const branch = [
      call('1', 'navigate', { url: 'https://example.com', intent: 'Open example.com' }),
      result('1', 'navigate', 'navigate · tab 3 · url · load'),
      call('2', 'snapshot', {}),
      result('2', 'snapshot', 'outline …'),
      call('3', 'fill_form', { intent: 'Fill the contact form' }),
      result('3', 'fill_form', 'fill_form · 4 fields', false),
      call('4', 'click', { intent: 'Submit' }),
      result('4', 'click', 'error OBSCURED', true),
    ];
    const ledger = progressLedger(branch);
    expect(ledger).toContain('1. done · navigate: Open example.com');
    expect(ledger).toContain('2. done · fill_form: Fill the contact form');
    expect(ledger).toContain('3. failed · click: Submit');
    expect(ledger).not.toContain('snapshot');
    expect(ledger).toContain('do not repeat the ones marked done');
  });

  it('falls back to the first line of the result when no purpose was given', () => {
    const ledger = progressLedger([call('1', 'click', {}), result('1', 'click', 'click · button "Next" · effect changed\nmore')]);
    expect(ledger).toContain('click · button "Next" · effect changed');
    expect(ledger).not.toContain('more');
  });

  it('keeps the newest steps when there are many and says how many there were', () => {
    const branch: Entry[] = [];
    for (let i = 1; i <= 30; i++) branch.push(call(`c${i}`, 'click', { intent: `step ${i}` }), result(`c${i}`, 'click', 'ok'));
    const ledger = progressLedger(branch, 5);
    expect(ledger).toContain('(30, the newest 5 listed)');
    expect(ledger).toContain('26. done · click: step 26');
    expect(ledger).toContain('30. done · click: step 30');
    expect(ledger).not.toContain('step 25');
  });

  it('is empty when nothing changed a page', () => {
    expect(progressLedger([call('1', 'read', {}), result('1', 'read', 'text')])).toBe('');
    expect(progressLedger([])).toBe('');
  });
});
