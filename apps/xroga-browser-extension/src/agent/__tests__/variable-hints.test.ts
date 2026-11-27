import { describe, expect, it } from 'vitest';
import { describeVariables, findVariables, withPlaceholders } from '../variable-hints';
import { renderDemo } from '../demo-tool';

const steps = [
  { step: 'click', role: 'button', name: 'New contact' },
  { step: 'set', role: 'textbox', name: 'Email address', value: 'ann@acme.com' },
  { step: 'set', role: 'textbox', name: 'Phone', value: '+44 20 7946 0958' },
  { step: 'set', role: 'textbox', name: 'Company', value: 'Acme Ltd' },
  { step: 'set', role: 'textbox', name: 'Expected value', value: '£12,500' },
  { step: 'set', role: 'combobox', name: 'Stage', value: 'yes' },
  { step: 'set', role: 'textbox', name: 'Note', value: 'x' },
  { step: 'set', role: 'textbox', name: 'Card', value: '4242 4242 4242 4242' },
  { step: 'set', role: 'textbox', name: 'Email address', value: 'bob@acme.com' },
  { step: 'press', role: 'textbox', name: 'Email address', value: 'Enter' },
];

describe('values that are inputs', () => {
  const v = findVariables(steps);
  it('recognises an email, a phone, a name by its label, an amount, and numbers a repeated field', () => {
    expect(v.map(x => [x.step, x.kind, x.name])).toEqual([[1, 'email', 'email_address'], [2, 'phone', 'phone'], [3, 'name', 'company'], [4, 'number', 'expected_value'], [8, 'email', 'email_address_2']]);
    expect(v[0]!.confidence).toBeGreaterThan(0.95);
    expect(v[3]!.confidence).toBeGreaterThanOrEqual(0.9);
  });
  it('leaves fixed words, one-letter values, card numbers and clicks alone', () => {
    const steps2 = steps.map(s => s.step).join();
    expect(steps2).toContain('click');
    expect(v.some(x => x.value === 'yes' || x.value === 'x' || x.value.startsWith('4242'))).toBe(false);
    expect(v.some(x => x.step === 0 || x.step === 9)).toBe(false);
  });
  it('puts the placeholders in and says it in words', () => {
    const out = withPlaceholders(steps, v);
    expect(out[1]!.value).toBe('${email_address}');
    expect(out[5]!.value).toBe('yes');
    expect(describeVariables(v)).toContain('step 2');
    expect(describeVariables(v)).toContain('an email');
    expect(describeVariables([])).toBe('');
  });
  it('is part of what a demonstration returns', () => {
    const text = renderDemo('add contact', steps as never);
    expect(text).toContain('Likely inputs of this task');
    expect(text).toContain('${email_address}');
  });
});
