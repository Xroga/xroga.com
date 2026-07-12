import type { SwarmTodoItem } from './swarm';

/**
 * Merge backend swarm todo progress into seeded user-facing todos.
 * Preserves context-aware labels (blog, hackathon, update) while syncing status.
 */
export function mergeBuildTodos(seeded: SwarmTodoItem[], incoming: SwarmTodoItem[]): SwarmTodoItem[] {
  if (!seeded.length) return incoming;
  if (!incoming.length) return seeded;

  const incomingById = new Map(incoming.map((t) => [t.id, t]));
  const hasUserFacing = incoming.some((t) =>
    ['ui-trends', 'code-gen', 'research', 'ideas', 'submission'].includes(t.id)
  );
  if (hasUserFacing) return incoming;

  const backendDone = (id: string) => incomingById.get(id)?.status === 'done';
  const backendActive = (id: string) => incomingById.get(id)?.status === 'active';
  const buildSteps = incoming.filter((t) => t.id.startsWith('build-'));
  const buildActive = buildSteps.find((t) => t.status === 'active');
  const buildDoneCount = buildSteps.filter((t) => t.status === 'done').length;
  const codeGenIncoming = incomingById.get('code-gen');

  return seeded.map((todo) => {
    const direct = incomingById.get(todo.id);
    if (direct) {
      return {
        ...todo,
        status: direct.status,
        label: direct.label.includes('(') && todo.id === 'code-gen' ? direct.label : todo.label,
      };
    }

    let status = todo.status;

    switch (todo.id) {
      case 'github':
        if (backendDone('github')) status = 'done';
        else if (backendActive('github')) status = 'active';
        break;
      case 'research':
        if (backendDone('research')) status = 'done';
        else if (backendActive('research')) status = 'active';
        break;
      case 'ideas':
        if (backendDone('ideas')) status = 'done';
        else if (backendActive('ideas')) status = 'active';
        break;
      case 'analyze':
        if (backendDone('analyze')) status = 'done';
        else if (backendActive('analyze')) status = 'active';
        break;
      case 'plan':
      case 'structure':
        if (backendDone('plan') || backendDone('structure') || backendDone('steps') || backendDone('verify-plan')) {
          status = 'done';
        } else if (backendActive('plan') || backendActive('structure') || backendActive('steps')) {
          status = 'active';
        }
        break;
      case 'ui-trends':
        if (backendDone('ui-trends') || buildDoneCount > 0 || buildActive || codeGenIncoming?.status === 'active') {
          status = 'done';
        } else if (backendActive('ui-trends')) {
          status = 'active';
        }
        break;
      case 'code-gen':
        if (codeGenIncoming) {
          status = codeGenIncoming.status;
          return {
            ...todo,
            status,
            label: codeGenIncoming.label.includes('(') ? codeGenIncoming.label : todo.label,
          };
        }
        if (buildActive || backendActive('code-gen')) status = 'active';
        else if (buildSteps.length && buildDoneCount >= buildSteps.length) status = 'done';
        else if (backendDone('code-gen')) status = 'done';
        break;
      case 'verify':
        if (backendDone('verify') || backendDone('final-check') || backendDone('emit')) status = 'done';
        else if (backendActive('verify') || backendActive('final-check') || backendActive('emit')) status = 'active';
        break;
      case 'submission':
        if (backendDone('submission')) status = 'done';
        else if (backendActive('submission')) status = 'active';
        break;
      case 'github-push':
        if (backendDone('github-push')) status = 'done';
        else if (backendActive('github-push')) status = 'active';
        break;
      case 'live-deploy':
        if (backendDone('live-deploy')) status = 'done';
        else if (backendActive('live-deploy')) status = 'active';
        break;
    }

    return { ...todo, status };
  });
}

/** Ensure exactly one todo is active when backend sends ambiguous state. */
export function normalizeActiveTodo(todos: SwarmTodoItem[]): SwarmTodoItem[] {
  const active = todos.filter((t) => t.status === 'active');
  if (active.length <= 1) return todos;

  const keep = active[0]!.id;
  return todos.map((t) =>
    t.status === 'active' && t.id !== keep ? { ...t, status: 'done' as const } : t
  );
}
