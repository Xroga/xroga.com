import { describe, expect, it } from 'vitest';
import { expandVars, placeholdersOf, refusalFor } from '../macro-tool';

const steps = [
  { tool: 'fill_form', args: { fields: [{ target: { role: 'textbox', name: 'Email' }, value: '${email}' }, { target: { role: 'textbox', name: 'Subject' }, value: 'Re: ${subject}' }] } },
  { foreach: ['a', 'b'], tool: 'click', args: { target: { role: 'button', name: '${item}' } } },
];

describe('macro routines', () => {
  it('lists the values a routine needs, leaving the batch loop\'s own item and index alone', () => {
    expect(placeholdersOf(steps)).toEqual(['email', 'subject']);
  });

  it('fills the values safely and keeps foreach placeholders', () => {
    const out = expandVars(steps, { email: 'ana@x.test', subject: 'He said "hi"\nbye' });
    expect(out.ok).toBe(true);
    const text = JSON.stringify(out.ok ? out.steps : []);
    expect(text).toContain('ana@x.test');
    expect(text).toContain('Re: He said \\"hi\\"\\nbye');
    expect(text).toContain('${item}');
  });

  it('refuses to run half-filled', () => {
    expect(expandVars(steps, { email: 'a@x.test' })).toEqual({ ok: false, missing: ['subject'] });
  });

  it('never keeps a step that enters a password, card or code', () => {
    expect(refusalFor([{ tool: 'set', args: { target: { role: 'textbox', name: 'Password' }, value: 'x' } }])).toMatch(/never kept in a routine/);
    expect(refusalFor([{ tool: 'set', args: { target: { role: 'textbox', name: 'One-time code' }, value: '${code}' } }])).toMatch(/never kept/);
    expect(refusalFor(steps)).toBeNull();
    expect(refusalFor([])).toMatch(/non-empty/);
  });
});
