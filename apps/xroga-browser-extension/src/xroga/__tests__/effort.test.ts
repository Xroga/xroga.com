import { describe, expect, it } from 'vitest';
import { EffortControl, outputRoom } from '../effort';

describe('EffortControl', () => {
  it('starts at high', () => {
    expect(new EffortControl().level).toBe('high');
  });
  it('goes to max when the run stalls and back to high after four turns of progress', () => {
    const e = new EffortControl();
    e.noteTurn(false);
    e.noteTurn(true);
    expect(e.level).toBe('max');
    for (let i = 0; i < 3; i++) e.noteTurn(false);
    expect(e.level).toBe('max');
    e.noteTurn(false);
    expect(e.level).toBe('high');
    expect(e.changes.map(c => c.level)).toEqual(['max', 'high']);
  });
  it('a stall in the middle of recovery restarts the count', () => {
    const e = new EffortControl();
    e.noteTurn(true);
    e.noteTurn(false);
    e.noteTurn(false);
    e.noteTurn(true);
    for (let i = 0; i < 3; i++) e.noteTurn(false);
    expect(e.level).toBe('max');
  });
  it('a run asked to start at none stays there until it stalls', () => {
    const e = new EffortControl('none');
    e.noteTurn(false);
    expect(e.level).toBe('none');
    e.noteTurn(true);
    expect(e.level).toBe('max');
  });
});

describe('outputRoom', () => {
  it('gives thinking turns more room than non-thinking ones', () => {
    expect(outputRoom('none')).toBe(2_048);
    expect(outputRoom('high')).toBeGreaterThan(outputRoom('none'));
    expect(outputRoom('max')).toBeGreaterThan(outputRoom('high'));
  });
});
