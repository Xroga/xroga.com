import { afterEach, describe, expect, it, vi } from 'vitest';
import { BEAT_MS, startHeartbeat } from '../heartbeat';

afterEach(() => vi.useRealTimers());

describe('heartbeat', () => {
  it('pokes every 20 seconds while a run is in progress and not otherwise', () => {
    vi.useFakeTimers();
    let busy = false;
    const poke = vi.fn();
    const stop = startHeartbeat(() => busy, poke);
    vi.advanceTimersByTime(BEAT_MS * 3);
    expect(poke).not.toHaveBeenCalled();
    busy = true;
    vi.advanceTimersByTime(BEAT_MS * 3);
    expect(poke).toHaveBeenCalledTimes(3);
    stop();
    vi.advanceTimersByTime(BEAT_MS * 3);
    expect(poke).toHaveBeenCalledTimes(3);
  });
  it('survives a poke that throws', () => {
    vi.useFakeTimers();
    const poke = vi.fn(() => {
      throw new Error('no api');
    });
    startHeartbeat(() => true, poke);
    expect(() => vi.advanceTimersByTime(BEAT_MS * 2)).not.toThrow();
    expect(poke).toHaveBeenCalledTimes(2);
  });
});
