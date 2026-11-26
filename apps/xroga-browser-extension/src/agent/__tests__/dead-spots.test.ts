import { describe, expect, it } from 'vitest';
import { DeadSpots } from '../dead-spots';

describe('DeadSpots', () => {
  it('lets two misses through and refuses the third at the same point', () => {
    const d = new DeadSpots();
    expect(d.refusal(0.3, 0.05)).toBeUndefined();
    d.missed(0.3, 0.05);
    expect(d.refusal(0.3, 0.05)).toBeUndefined();
    d.missed(0.305, 0.052);
    expect(d.refusal(0.302, 0.049)).toMatch(/Refused, nothing was sent/);
  });
  it('a point further away is not refused', () => {
    const d = new DeadSpots();
    d.missed(0.3, 0.05); d.missed(0.3, 0.05);
    expect(d.refusal(0.34, 0.05)).toBeUndefined();
  });
  it('any change of the page clears the record', () => {
    const d = new DeadSpots();
    d.missed(0.3, 0.05); d.missed(0.3, 0.05);
    d.changed();
    expect(d.refusal(0.3, 0.05)).toBeUndefined();
  });
  it('six identical clicks never get a seventh', () => {
    const d = new DeadSpots();
    let sent = 0;
    for (let i = 0; i < 7; i++) { if (!d.refusal(0.5, 0.5)) { sent++; d.missed(0.5, 0.5); } }
    expect(sent).toBe(2);
  });
});
