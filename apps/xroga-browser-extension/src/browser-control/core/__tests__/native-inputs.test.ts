import { describe, expect, it } from 'vitest';
import { isNativeCompositeInput } from '../perception/outline';

describe('isNativeCompositeInput', () => {
  it('recognises the native date and time controls by their accessibility role, however Chrome spells it', () => {
    for (const role of ['Date', 'date', 'Time', 'InputTime', 'DateTime', 'datetime-local', 'InputDateTimeLocal', 'Month', 'Week']) expect(isNativeCompositeInput(role)).toBe(true);
  });
  it('leaves everything else alone, including the spinbutton a page draws itself', () => {
    for (const role of ['textbox', 'spinbutton', 'combobox', 'button', 'slider', 'DateGrid']) expect(isNativeCompositeInput(role)).toBe(false);
  });
});
