import { describe, expect, it } from 'vitest';
import { MAX_AUTO, clearCutOff, markCutOff, takeToResume } from '../auto-resume';

const memory = () => {
  const data: Record<string, unknown> = {};
  return { get: async (k: string) => ({ [k]: data[k] }), set: async (i: Record<string, unknown>) => void Object.assign(data, i) };
};

describe('auto resume', () => {
  it('resumes a run that was cut off, once per cut-off', async () => {
    const s = memory();
    await markCutOff('c1', s);
    expect(await takeToResume(s)).toEqual(['c1']);
    expect(await takeToResume(s)).toEqual([]);
  });
  it('never resumes a run the person paused or stopped', async () => {
    const s = memory();
    await markCutOff('c1', s);
    await clearCutOff('c1', s);
    expect(await takeToResume(s)).toEqual([]);
  });
  it('gives up after a few resumes so a dropping connection cannot loop', async () => {
    const s = memory();
    for (let i = 0; i < MAX_AUTO; i++) {
      await markCutOff('c1', s);
      expect(await takeToResume(s)).toEqual(['c1']);
    }
    await markCutOff('c1', s);
    expect(await takeToResume(s)).toEqual([]);
  });
});
