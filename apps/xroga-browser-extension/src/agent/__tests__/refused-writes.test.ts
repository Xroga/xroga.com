import { describe, expect, it } from 'vitest';
import { Guards, refusedWrites } from '../guards';

const receipt = (text: string) => ({ ok: true, text, receipt: { effect: { verdict: 'changed', signals: [] } } }) as never;
const click500 = receipt('click · [a7] button «Mark fulfilled» · pointer · dispatched effect: changed · target removed · request: POST «/api/orders/fulfill» → 500 (the server refused or failed it)');

describe('refusedWrites', () => {
  it('finds refused writes and ignores reads and successes', () => {
    expect(refusedWrites('request: POST «/a» → 500 (x)')).toEqual([{ write: 'POST /a', why: 'HTTP 500' }]);
    expect(refusedWrites('request: PUT «/b/1» → 422')).toEqual([{ write: 'PUT /b/1', why: 'HTTP 422' }]);
    expect(refusedWrites('request: DELETE «/c» FAILED ERR_CONNECTION_RESET')).toEqual([{ write: 'DELETE /c', why: 'network failure ERR_CONNECTION_RESET' }]);
    expect(refusedWrites('request: GET «/d» → 404')).toEqual([]);
    expect(refusedWrites('request: POST «/e» → 200')).toEqual([]);
    expect(refusedWrites(undefined)).toEqual([]);
  });
});

describe('a write the server refused', () => {
  it('nudges the first time and stops the second time for the same write', () => {
    const g = new Guards();
    const first = g.record('click', { target: { ref: 'a7' } }, click500, false);
    expect(first.nudge).toMatch(/did NOT happen/);
    expect(first.stop).toBeUndefined();
    const second = g.record('click', { target: { ref: 'a14' } }, click500, false);
    expect(second.stop).toMatch(/refused the same write twice/);
  });
  it('different writes are counted separately, and a succeeding write is not counted', () => {
    const g = new Guards();
    g.record('click', {}, receipt('request: POST «/api/a» → 500'), false);
    const other = g.record('click', {}, receipt('request: POST «/api/b» → 500'), false);
    expect(other.stop).toBeUndefined();
    const ok = g.record('click', {}, receipt('request: POST «/api/c» → 200'), false);
    expect(ok.stop).toBeUndefined();
  });
  it('survives a restart through the guard state', () => {
    const a = new Guards();
    a.record('click', {}, click500, false);
    const b = new Guards(a.state);
    expect(b.record('click', {}, click500, false).stop).toMatch(/twice/);
  });
});
