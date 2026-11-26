import { describe, expect, it } from 'vitest';
import { RepeatDetector, signatureOf } from '../repeat-detector';

const click = (d: RepeatDetector, name: string, ref = 'a1') => d.record('click', {}, `click · [${ref}] button «${name}» · pointer · dispatched`, false);
const fill = (d: RepeatDetector, n = 3) => d.record('fill_form', { fields: Array.from({ length: n }, () => ({})) }, 'fill_form · 3 fields', false);

describe('signatureOf', () => {
  it('reads the control and blurs addresses and numbers', () => {
    expect(signatureOf('click', {}, 'click · [a9] listitem «ana@mail1.example.test Delivery slot» · pointer')).toBe('click listitem «<email> Delive»');
    expect(signatureOf('click', {}, 'click · [a9] listitem «bilal@x.test Delivery slot» · pointer')).toBe('click listitem «<email> Delive»');
    expect(signatureOf('fill_form', { fields: [1, 2] }, 'x')).toBe('fill_form(2 fields)');
    expect(signatureOf('press', {}, 'press · Enter on the focused element')).toBe('press');
  });
});

describe('RepeatDetector', () => {
  it('advises batch the first time a three-step sequence has been done three times, and only once', () => {
    const d = new RepeatDetector();
    const notes: Array<string | undefined> = [];
    for (let i = 0; i < 5; i++) {
      notes.push(click(d, 'New message', `a${i}`), fill(d), click(d, 'Close', `b${i}`));
    }
    const given = notes.filter(Boolean);
    expect(given).toHaveLength(1);
    expect(given[0]).toContain('click button «New message» → fill_form(3 fields) → click button «Close»');
    expect(given[0]).toContain('ONE batch call');
    expect(given[0]).toContain('foreach');
    // It arrives on the third repetition, not before.
    expect(notes.findIndex(Boolean)).toBe(8);
  });

  it('does not fire for two repetitions, one repeated call, or a changing sequence', () => {
    const d = new RepeatDetector();
    for (let i = 0; i < 2; i++) { click(d, 'New message'); fill(d); click(d, 'Close'); }
    expect([click(d, 'Next'), click(d, 'Next'), click(d, 'Next'), click(d, 'Next')].filter(Boolean)).toHaveLength(0);
    const e = new RepeatDetector();
    const mixed = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'].map(n => click(e, n));
    expect(mixed.filter(Boolean)).toHaveLength(0);
  });

  it('looking tools are not part of the sequence, and a failure starts the count again', () => {
    const d = new RepeatDetector();
    const out: Array<string | undefined> = [];
    for (let i = 0; i < 3; i++) {
      out.push(click(d, 'New message'));
      d.record('snapshot', {}, 'snapshot · tab 1', false);
      out.push(fill(d));
    }
    expect(out.filter(Boolean)).toHaveLength(1);
    const f = new RepeatDetector();
    for (let i = 0; i < 2; i++) { click(f, 'New message'); fill(f); }
    f.record('click', {}, 'error NO_MATCH', true);
    expect([click(f, 'New message'), fill(f)].filter(Boolean)).toHaveLength(0);
  });
});

describe('RepeatDetector: the same form saved again with the same values', () => {
  const set = (d: RepeatDetector, name: string, value: unknown) => d.record('set', { value }, `set · [a2] checkbox «${name}» · pointer`, false);
  const save = (d: RepeatDetector) => d.record('click', {}, 'click · [a4] button «Save» · pointer · submit: allowed by Auto mode · dispatched', false);

  it('tells once, on the third identical re-fill and save', () => {
    const d = new RepeatDetector();
    const notes: Array<string | undefined> = [];
    for (let i = 0; i < 5; i++) notes.push(set(d, 'Weekly digest', true), save(d));
    const given = notes.filter(Boolean);
    expect(given).toHaveLength(1);
    expect(given[0]).toMatch(/saved this same form with the same values 3 times/);
  });

  it('does not tell for different values each time, or for a plain Save with nothing typed', () => {
    const d = new RepeatDetector();
    const notes: Array<string | undefined> = [];
    for (let i = 0; i < 6; i++) notes.push(set(d, 'Weekly digest', i), save(d));
    for (let i = 0; i < 6; i++) notes.push(save(d));
    expect(notes.filter(n => n && /saved this same form/.test(n))).toHaveLength(0);
  });
});

