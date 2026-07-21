import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mergeBuildTodos, normalizeActiveTodo } from './mergeBuildTodos';
import type { SwarmTodoItem } from './swarm';

const seeded: SwarmTodoItem[] = [
  { id: 'github', label: 'Using your selected GitHub repo', status: 'done' },
  { id: 'analyze', label: 'Analyze Bean — sections, theme, pricing', status: 'active' },
  { id: 'plan', label: 'Plan Bean pages', status: 'pending' },
  { id: 'code-gen', label: 'Generate Bean HTML/CSS/JS', status: 'pending' },
  { id: 'ui-trends', label: 'Polish layout', status: 'pending' },
  { id: 'verify', label: 'Verify', status: 'pending' },
  { id: 'github-push', label: 'Push site files to GitHub', status: 'pending' },
  { id: 'live-deploy', label: 'Open preview', status: 'pending' },
];

describe('mergeBuildTodos pipeline bridge', () => {
  it('advances Analyze → Plan when backend is on architect', () => {
    const incoming: SwarmTodoItem[] = [
      { id: 'route', label: 'Route', status: 'done' },
      { id: 'convert', label: 'Convert', status: 'done' },
      { id: 'architect', label: 'Architect', status: 'active' },
      { id: 'build', label: 'Build', status: 'pending' },
      { id: 'qa', label: 'QA', status: 'pending' },
      { id: 'compile', label: 'Compile', status: 'pending' },
      { id: 'push', label: 'Push', status: 'pending' },
    ];
    const merged = normalizeActiveTodo(mergeBuildTodos(seeded, incoming));
    const byId = Object.fromEntries(merged.map((t) => [t.id, t.status]));
    assert.equal(byId.github, 'done');
    assert.equal(byId.analyze, 'done');
    assert.equal(byId.plan, 'active');
    assert.equal(byId['code-gen'], 'pending');
  });

  it('marks code-gen active when backend is building', () => {
    const incoming: SwarmTodoItem[] = [
      { id: 'route', label: 'Route', status: 'done' },
      { id: 'convert', label: 'Convert', status: 'done' },
      { id: 'architect', label: 'Architect', status: 'done' },
      { id: 'build', label: 'Build', status: 'active' },
      { id: 'qa', label: 'QA', status: 'pending' },
      { id: 'compile', label: 'Compile', status: 'pending' },
      { id: 'push', label: 'Push', status: 'pending' },
    ];
    const merged = normalizeActiveTodo(mergeBuildTodos(seeded, incoming));
    const byId = Object.fromEntries(merged.map((t) => [t.id, t.status]));
    assert.equal(byId.analyze, 'done');
    assert.equal(byId.plan, 'done');
    assert.equal(byId['code-gen'], 'active');
  });
});
