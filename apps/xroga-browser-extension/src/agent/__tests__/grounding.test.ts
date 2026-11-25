import { describe, expect, it } from 'vitest';
import { ungroundedValues } from '../grounding';

const entry = (role: string, parts: Array<{ type: string; text?: string; toolName?: string; input?: unknown }>) => ({ message: { role, parts } });
const run = [
  entry('user', [{ type: 'text', text: 'Find the contact of the Acme shop' }]),
  entry('tool', [{ type: 'tool-result', toolName: 'read', text: 'Contact: sales@acme.test · +971 4 555 1234 · https://acme.test/contact' }]),
];

describe('ungroundedValues', () => {
  it('accepts values that the run read', () => {
    expect(ungroundedValues('Write to sales@acme.test or call +971 4 555 1234, page https://acme.test/contact.', run)).toEqual([]);
    expect(ungroundedValues('Call +971-4-555-1234', run)).toEqual([]);
  });
  it('names an email, a web address and a phone number nothing showed', () => {
    const miss = ungroundedValues('Mail info@other.test, see https://other.test/team, call +44 20 7946 0958', run);
    expect(miss).toEqual(['info@other.test', 'https://other.test/team', '+44 20 7946 0958']);
  });
  it('does not treat a date or a price as a phone number', () => {
    expect(ungroundedValues('Updated 2026-11-25, price 1234567.89', run)).toEqual([]);
  });
  it('has nothing to check when the run read nothing', () => {
    expect(ungroundedValues('Mail x@y.test', [entry('user', [{ type: 'text', text: 'hi' }])])).toEqual([]);
  });
});

import { claimContradicted } from '../grounding';

describe('claimContradicted', () => {
  const after = (text: string) => [entry('tool', [{ type: 'tool-result', toolName: 'click', text }])];
  it('names the page wording that refuses what the answer claims', () => {
    expect(claimContradicted('I submitted the form.', after('Email is required. Submit'))).toMatch(/required/i);
    expect(claimContradicted('Order placed and saved.', after('Something went wrong, please retry'))).toMatch(/went wrong/i);
  });
  it('lets a clean page and an answer with no such claim through', () => {
    expect(claimContradicted('I submitted the form.', after('Thank you! Your request was received.'))).toBeUndefined();
    expect(claimContradicted('The price is 49.', after('Email is required.'))).toBeUndefined();
  });
});
