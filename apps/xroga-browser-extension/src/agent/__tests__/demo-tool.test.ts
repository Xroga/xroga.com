import { describe, expect, it } from 'vitest';
import { demoLine } from '@src/browser-control/core/tools/demo';
import { renderDemo } from '../demo-tool';

describe('record_demo text', () => {
  it('renders steps the model can repeat with role and name targets, and keeps secrets hidden', () => {
    expect(demoLine({ step: 'set', role: 'textbox', name: 'Email', value: 'ana@x.test' })).toBe('set textbox "Email" = "ana@x.test"');
    expect(demoLine({ step: 'click', role: 'button', name: 'Delete', row: 'ana@x.test Delivery' })).toBe('click button "Delete" (in "ana@x.test Delivery")');
    expect(demoLine({ step: 'press', role: 'textbox', name: 'Search', value: 'Enter' })).toBe('press Enter in textbox "Search"');
    const text = renderDemo('create a contact', [
      { step: 'set', role: 'textbox', name: 'Password', value: '(hidden)' },
      { step: 'click', role: 'button', name: 'Save' },
    ]);
    expect(text).toContain('Demonstration "create a contact" (2 steps)');
    expect(text).toContain('= "(hidden)"');
    expect(text).toMatch(/use the values of the current request/);
    expect(renderDemo('x', [])).toMatch(/No steps were recorded/);
  });
});
