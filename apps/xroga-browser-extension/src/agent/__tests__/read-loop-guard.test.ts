import { describe, expect, it } from 'vitest';
import { Guards, READ_STREAK_NUDGE } from '../guards';

const look = (g: Guards, tool: string, n: number) => g.record(tool, { n }, undefined, false);

describe('the re-reading guard', () => {
  it('stays quiet while the agent looks a few times', () => {
    const g = new Guards();
    for (let i = 0; i < READ_STREAK_NUDGE - 1; i++) expect(look(g, i % 2 ? 'read' : 'snapshot', i).nudge).toBeUndefined();
  });

  it('tells the agent to act or finish after a run of looks with no action', () => {
    const g = new Guards();
    let verdict = {} as ReturnType<Guards['record']>;
    for (let i = 0; i < READ_STREAK_NUDGE; i++) verdict = look(g, ['snapshot', 'read', 'find', 'read', 'snapshot'][i], i);
    expect(verdict.nudge).toContain('only looked at pages');
    expect(verdict.nudge).toContain('finish with done');
  });

  it('starts counting again after an action', () => {
    const g = new Guards();
    for (let i = 0; i < READ_STREAK_NUDGE - 1; i++) look(g, 'read', i);
    g.record('click', { target: { ref: 'a1' } }, undefined, false);
    expect(look(g, 'read', 99).nudge).toBeUndefined();
  });
});
