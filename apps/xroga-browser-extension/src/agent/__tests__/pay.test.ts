import { describe, expect, it } from 'vitest';
import { describePay, parsePay } from '../pay';
import { runDataOps } from '../data-ops';

describe('reading pay', () => {
  it('reads a range with a period and a currency', () => {
    expect(parsePay('$117,000.00/yr - $234,000.00/yr')).toMatchObject({ min: 117000, max: 234000, interval: 'yearly', currency: 'USD', guessed: false, yearlyMin: 117000 });
    expect(parsePay('£45k to £55k a year')).toMatchObject({ min: 45000, max: 55000, interval: 'yearly', currency: 'GBP' });
    expect(parsePay('$25 - $30 an hour')).toMatchObject({ min: 25, max: 30, interval: 'hourly', yearlyMin: 52000, yearlyMax: 62400 });
    expect(parsePay('AED 15,000 per month')).toMatchObject({ min: 15000, max: null, interval: 'monthly', currency: 'AED', yearlyMin: 180000 });
    expect(parsePay('€300 per day')).toMatchObject({ interval: 'daily', yearlyMin: 78000 });
    expect(parsePay('50-60k')).toMatchObject({ min: 50000, max: 60000 });
    expect(parsePay('₹ 8,00,000 - 12,00,000 p.a.')).toMatchObject({ interval: 'yearly', currency: 'INR' });
  });
  it('says "up to" is a maximum, and guesses the period from the size when it is not written', () => {
    expect(parsePay('up to $80k')).toMatchObject({ min: null, max: 80000 });
    expect(parsePay('$95,000')).toMatchObject({ interval: 'yearly', guessed: true });
    expect(parsePay('$45')).toMatchObject({ interval: 'hourly', guessed: true });
    expect(parsePay('$4,500')).toMatchObject({ interval: 'monthly', guessed: true });
  });
  it('gives nothing for text with no amount', () => {
    expect(parsePay('Competitive salary')).toBeNull();
    expect(parsePay('')).toBeNull();
    expect(parsePay(null)).toBeNull();
  });
  it('describes it, and the data_ops step fills the columns for a list', () => {
    expect(describePay(parsePay('$25 - $30 an hour')!)).toContain('about 62,400 a year');
    const out = runDataOps([{ job: 'a', salary: '$25-$30 an hour' }, { job: 'b', salary: '£50k a year' }, { job: 'c', salary: 'negotiable' }], [{ op: 'pay', field: 'salary' }, { op: 'sort', by: 'pay_year_max', order: 'desc' }]);
    expect(runDataOps(out.rows, [{ op: 'sort', by: 'pay_year', order: 'desc' }]).rows.map(r => [r.job, r.pay_year])).toEqual([['a', 57200], ['b', 50000], ['c', null]]);
    expect(out.rows.map(r => r.job)).toEqual(['a', 'b', 'c']);
    expect(out.rows[0]).toMatchObject({ pay_year_max: 62400, pay_currency: 'USD' });
    expect(out.rows.find(r => r.job === 'b')).toMatchObject({ pay_min: 50000, pay_interval: 'yearly', pay_currency: 'GBP' });
    expect(out.notes.join('\n')).toContain('1 had no amount');
    expect(() => runDataOps([{ a: '1' }], [{ op: 'pay' }])).toThrow();
  });
});
