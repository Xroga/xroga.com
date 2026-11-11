import { describe, expect, it } from 'vitest';
import { Guards, READ_STREAK_NUDGE } from '../guards';

const look = (g: Guards, tool: string, args: Record<string, unknown>) => g.record(tool, args, undefined, false);

describe('the re-reading guard', () => {
  it('stays quiet while the agent looks a few times', () => {
    const g = new Guards();
    for (let i = 0; i < READ_STREAK_NUDGE - 1; i++) expect(look(g, i % 2 ? 'read' : 'snapshot', { n: i }).nudge).toBeUndefined();
  });

  it('tells the agent to act or finish after repeated looks at the same page with no action', () => {
    const g = new Guards();
    let verdict = {} as ReturnType<Guards['record']>;
    for (let i = 0; i < READ_STREAK_NUDGE; i++) verdict = look(g, ['snapshot', 'read', 'find', 'read', 'snapshot'][i], { n: i });
    expect(verdict.nudge).toContain('only looked at the same page');
    expect(verdict.nudge).toContain('finish with done');
  });

  it('does not call reading many different pages a loop', () => {
    const g = new Guards();
    let verdict = {} as ReturnType<Guards['record']>;
    for (let tab = 1; tab <= READ_STREAK_NUDGE + 3; tab++) verdict = look(g, 'read', { tabId: tab });
    expect(verdict.nudge).toBeUndefined();
  });

  it('starts counting again after an action', () => {
    const g = new Guards();
    for (let i = 0; i < READ_STREAK_NUDGE - 1; i++) look(g, 'read', { n: i });
    g.record('click', { target: { ref: 'a1' } }, undefined, false);
    expect(look(g, 'read', { n: 99 }).nudge).toBeUndefined();
  });
});
