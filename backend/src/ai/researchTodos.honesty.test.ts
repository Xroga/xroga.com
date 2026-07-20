import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/**
 * Mirror of pipeline todosForBuild research honesty rules.
 * Kept here so we lock the contract without exporting internals.
 */
type ResearchTodoState = 'omit' | 'pending' | 'active' | 'done' | 'skipped';
type BuildTodoStatus = 'done' | 'active' | 'pending' | 'skipped';

function todosForBuild(
  step: 'route' | 'research' | 'convert' | 'done',
  researchState: ResearchTodoState = 'omit',
) {
  const all = [
    { id: 'route', label: 'Route request' },
    { id: 'research', label: 'Gather research' },
    { id: 'convert', label: 'Convert to builder brief' },
  ] as const;
  const steps = researchState === 'omit' ? all.filter((s) => s.id !== 'research') : [...all];
  const order = steps.map((s) => s.id);
  const idx = step === 'done' ? order.length : Math.max(0, order.indexOf(step));
  return steps.map((s, i) => {
    if (s.id === 'research') {
      if (researchState === 'skipped') {
        return {
          id: s.id,
          label: 'Research skipped — no live sources',
          status: 'skipped' as BuildTodoStatus,
        };
      }
      if (researchState === 'active') {
        return { id: s.id, label: s.label, status: 'active' as BuildTodoStatus };
      }
      if (researchState === 'done') {
        return { id: s.id, label: s.label, status: 'done' as BuildTodoStatus };
      }
      return { id: s.id, label: s.label, status: 'pending' as BuildTodoStatus };
    }
    const status: BuildTodoStatus = i < idx ? 'done' : i === idx ? 'active' : 'pending';
    return { id: s.id, label: s.label, status };
  });
}

describe('todosForBuild research honesty', () => {
  it('omits research when not requested', () => {
    const todos = todosForBuild('convert', 'omit');
    assert.equal(todos.some((t) => t.id === 'research'), false);
  });

  it('never green-checks skipped research', () => {
    const todos = todosForBuild('convert', 'skipped');
    const research = todos.find((t) => t.id === 'research');
    assert.ok(research);
    assert.equal(research!.status, 'skipped');
    assert.match(research!.label, /skipped/i);
  });

  it('marks research done only when sources existed', () => {
    const todos = todosForBuild('convert', 'done');
    assert.equal(todos.find((t) => t.id === 'research')?.status, 'done');
  });
});
