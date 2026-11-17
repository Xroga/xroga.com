import { describe, expect, it } from 'vitest';
import { createsDebt, deliveryUnknown } from '../completion';

describe('a page that would not open', () => {
  const failed = { ok: false, error: { code: 'PAGE_ERROR', delivered: 'unknown' } } as never;

  it('owes nothing: a failed navigation is a failed read, so it cannot end the task or block a success', () => {
    expect(deliveryUnknown(failed)).toBe(true);
    expect(createsDebt('navigate', failed)).toBe(false);
    expect(createsDebt('tabs', failed)).toBe(false);
  });

  it('a write whose delivery is unknown is still owed and verified', () => {
    expect(createsDebt('click', failed)).toBe(true);
  });
});
