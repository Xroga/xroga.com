import { describe, expect, it } from 'vitest';
import { calculate, runCalculate } from '../calculate';

describe('calculate', () => {
  it('does arithmetic with precedence, parentheses, powers and functions', () => {
    expect(calculate('4200 / 7')).toBe(600);
    expect(calculate('2 + 3 * 4')).toBe(14);
    expect(calculate('(2 + 3) * 4')).toBe(20);
    expect(calculate('2 ^ 3 ^ 2')).toBe(512);
    expect(calculate('round(10 / 3, 2)')).toBe(3.33);
    expect(calculate('sum(1, 2, 3) + avg(2, 4)')).toBe(9);
    expect(calculate('-5 + 2')).toBe(-3);
  });

  it('reads numbers as pages show them: thousands separators, currency, percent', () => {
    expect(calculate('Rs 4,200.00 / 7')).toBe(600);
    expect(calculate('$1,050 * 4')).toBe(4200);
    expect(calculate('600 * 20%')).toBe(120);
    expect(calculate('10 % 3')).toBe(1);
  });

  it('refuses code and malformed input instead of guessing', () => {
    expect(() => calculate('alert(1)')).toThrow(/unknown function/);
    expect(() => calculate('2 +')).toThrow(/number was expected/);
    expect(() => calculate('1 / 0')).toThrow(/not a finite number/);
    expect(runCalculate({ expressions: [{ name: 'daily', expr: '4200 / 7' }, { expr: 'oops(' }] }).text).toMatch(/daily = 600\n#2: error/);
  });
});
