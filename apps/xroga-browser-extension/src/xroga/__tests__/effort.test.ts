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
    expect(outputRoom('none')).toBe(4_096);
    // Thinking counts against the output room: a long reasoning turn must still have room left to write its answer.
    expect(outputRoom('high')).toBeGreaterThanOrEqual(64_000);
    expect(outputRoom('high')).toBeGreaterThan(outputRoom('none'));
    expect(outputRoom('max')).toBeGreaterThan(outputRoom('high'));
  });
});

describe('EffortControl, adaptive', () => {
  it('starts thinking, drops to none after two routine turns, thinks after an error, a result in doubt or a read-back, and relaxes after two routine turns', () => {
    const e = new EffortControl('high', { adaptive: true });
    expect(e.level).toBe('high');
    e.noteTurn(false);
    e.noteTurn(false);
    expect(e.level).toBe('none');
    e.noteTurn(false, { uncertain: true });
    expect(e.level).toBe('high');
    e.noteTurn(false);
    expect(e.level).toBe('high');
    e.noteTurn(false);
    expect(e.level).toBe('none');
    e.noteTurn(false, { verify: true });
    expect(e.level).toBe('high');
    e.noteTurn(false, { error: true });
    expect(e.level).toBe('high');
    e.noteTurn(true);
    expect(e.level).toBe('max');
  });

  it('a run that is not adaptive behaves as before', () => {
    const e = new EffortControl();
    expect(e.level).toBe('high');
    e.noteTurn(false, { error: true });
    expect(e.level).toBe('high');
  });
});

describe('EffortControl, fixed', () => {
  it('stays at high whatever happens: stalls, errors, doubt and calm turns', () => {
    const e = new EffortControl('high', { fixed: true });
    for (const s of [{}, { error: true }, { uncertain: true }, { verify: true }]) { e.noteTurn(false, s); expect(e.level).toBe('high'); }
    e.noteTurn(true);
    expect(e.level).toBe('high');
    for (let i = 0; i < 10; i++) e.noteTurn(false);
    expect(e.level).toBe('high');
    expect(e.changes).toHaveLength(0);
  });
});

describe('EffortControl, adaptive without max', () => {
  it('asks for high, never max, on a stall', () => {
    const e = new EffortControl('high', { adaptive: true, noMax: true });
    e.noteTurn(false); e.noteTurn(false);
    expect(e.level).toBe('none');
    e.noteTurn(true);
    expect(e.level).toBe('high');
    for (let i = 0; i < 10; i++) e.noteTurn(true);
    expect(e.level).toBe('high');
    expect(e.changes.every(c => c.level !== 'max')).toBe(true);
  });
});

