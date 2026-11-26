import { describe, expect, it } from 'vitest';
import { fieldLine } from '../form-model';

describe('fieldLine', () => {
  it('shows role, name, required, value and choices in one line', () => {
    expect(fieldLine({ role: 'textbox', name: 'Email', required: true, value: '' }, 1)).toBe('1. textbox "Email" *required empty');
    expect(fieldLine({ role: 'combobox', name: 'Country', value: 'UK', options: ['UK', 'US'] }, 2)).toBe('2. combobox "Country" = "UK" options [UK | US]');
    expect(fieldLine({ role: 'checkbox', name: 'Agree', checked: false, group: 'Terms' }, 3)).toBe('[Terms] 3. checkbox "Agree" unchecked');
    expect(fieldLine({ role: 'textbox', name: 'Phone', value: 'x', error: 'Enter a number' }, 4)).toContain('ERROR "Enter a number"');
  });
});
