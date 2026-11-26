import { describe, expect, it } from 'vitest';
import { PaintedInputDeliveryGuard } from '../painted-input-delivery';

const SCRIPT = 'var layer = ActiveLayer;\n' + 'layer.CreateRectangle(10, 10, 20, 20, 0);\n'.repeat(8);
const DISPATCHED = { ok: true, receipt: { dispatched: true } };

describe('painted-editor input delivery', () => {
  it('does not treat documentation-gate refusal as a typed script', () => {
    const guard = new PaintedInputDeliveryGuard();
    expect(guard.wasDelivered(7, SCRIPT)).toBe(false);
    expect(guard.record(7, SCRIPT, undefined)).toBe(false);
    expect(guard.wasDelivered(7, SCRIPT)).toBe(false);
    expect(guard.record(7, SCRIPT, { ok: false, receipt: { dispatched: false } })).toBe(false);
    expect(guard.wasDelivered(7, SCRIPT)).toBe(false);
  });

  it('does not poison retries after focus/tool refusal', () => {
    const guard = new PaintedInputDeliveryGuard();
    expect(guard.record(7, SCRIPT, { ok: false, receipt: { dispatched: true } })).toBe(false);
    expect(guard.record(7, SCRIPT, { ok: true, receipt: { dispatched: false } })).toBe(false);
    expect(guard.wasDelivered(7, SCRIPT)).toBe(false);
  });

  it('fences the same script after real successful dispatch', () => {
    const guard = new PaintedInputDeliveryGuard();
    expect(guard.record(7, SCRIPT, DISPATCHED)).toBe(true);
    expect(guard.wasDelivered(7, SCRIPT)).toBe(true);
  });

  it('compares full scripts and does not confuse shared 200-character prefixes', () => {
    const guard = new PaintedInputDeliveryGuard();
    const a = 'x'.repeat(240) + 'drawBlue()';
    const b = 'x'.repeat(240) + 'drawRed()';
    guard.record(7, a, DISPATCHED);
    expect(guard.wasDelivered(7, a)).toBe(true);
    expect(guard.wasDelivered(7, b)).toBe(false);
  });

  it('keeps scripts separate across Chrome tabs', () => {
    const guard = new PaintedInputDeliveryGuard();
    guard.record(7, SCRIPT, DISPATCHED);
    expect(guard.wasDelivered(8, SCRIPT)).toBe(false);
    expect(guard.wasDelivered(7, SCRIPT)).toBe(true);
  });
});
