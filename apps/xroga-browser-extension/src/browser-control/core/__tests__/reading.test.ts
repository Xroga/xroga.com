import { describe, expect, it } from 'vitest';
import { parseNumber, unmetReading } from '../reading';

describe('parseNumber', () => {
  it.each([
    ['1,234.50', 1234.5],
    ['3,5 %', 3.5],
    ['$ 12', 12],
    ['(7)', 7],
    ['1.234,56 €', 1234.56],
    ['1,234,567', 1234567],
    ['-4.2', -4.2],
    ["1'234", 1234],
  ])('%s', (text, n) => expect(parseNumber(text)).toBe(n));
  it('is null with no digits', () => expect(parseNumber('done')).toBeNull());
});

describe('unmetReading', () => {
  it('meets each kind of condition', () => {
    expect(unmetReading({ equals: 'DONE' }, ' done ', '')).toEqual([]);
    expect(unmetReading({ contains: 'ready' }, 'Build is READY now', '')).toEqual([]);
    expect(unmetReading({ matches: '^\\d+ of 10$' }, '7 of 10', '')).toEqual([]);
    expect(unmetReading({ above: 99 }, '100 %', '')).toEqual([]);
    expect(unmetReading({ below: 50 }, '$ 49.99', '')).toEqual([]);
    expect(unmetReading({ changed: true }, '8', '7')).toEqual([]);
  });
  it('says what was read when a condition is unmet', () => {
    expect(unmetReading({ above: 99 }, '42 %', '')[0]).toContain('reads 42, not above 99');
    expect(unmetReading({ changed: true }, '7', '7')[0]).toContain('still reads "7"');
    expect(unmetReading({ equals: 'ok' }, 'wait', '')[0]).toContain('not "ok"');
    expect(unmetReading({ below: 1 }, 'n/a', '')[0]).toContain('no number');
    expect(unmetReading({ matches: '(' }, 'x', '')[0]).toContain('not a valid pattern');
  });
});
