import type { SwarmTodoItem } from './swarm';

/**
 * Backend pipeline step ids (route/convert/architect/build/…) → frontend seed ids
 * (analyze/plan/code-gen/…). Without this map, UI todos freeze on "Analyze…" forever
 * while OpenRouter is still working.
 */
const BACKEND_TO_SEED: Record<string, string[]> = {
  route: ['github'],
  research: ['research', 'ideas'],
  convert: ['analyze'],
  architect: ['plan', 'structure'],
  build: ['code-gen', 'ui-trends'],
  qa: ['verify'],
  compile: ['verify'],
  push: ['github-push'],
  deploy: ['live-deploy'],
};

function backendStepIndex(incoming: SwarmTodoItem[]): { active?: string; done: Set<string> } {
  const done = new Set<string>();
  let active: string | undefined;
  for (const t of incoming) {
    if (t.status === 'done') done.add(t.id);
    if (t.status === 'active') active = t.id;
  }
  return { active, done };
}

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
  if (hasUserFacing) {
    // Keep seeded "Using selected GitHub repo" done — never re-activate Connect GitHub
    return incoming.map((t) => {
      if (t.id !== 'github') return t;
      const seed = seeded.find((s) => s.id === 'github');
      if (seed?.status === 'done' || t.status === 'done') {
        return {
          ...t,
          status: 'done' as const,
          label: seed?.label?.includes('selected')
            ? seed.label
            : t.label.replace(/^Connect GitHub.*/i, 'Using your selected GitHub repo'),
        };
      }
      return t;
    });
  }

  const { active: backendActiveId, done: backendDoneIds } = backendStepIndex(incoming);
  const pipelineOrder = ['route', 'research', 'convert', 'architect', 'build', 'qa', 'compile', 'push', 'deploy'] as const;
  const activePipelineIdx = backendActiveId
    ? pipelineOrder.indexOf(backendActiveId as (typeof pipelineOrder)[number])
    : -1;

  /** Seed ids that should already be done because backend passed that pipeline step. */
  const seedDoneFromBackend = new Set<string>();
  for (const step of pipelineOrder) {
    const stepIdx = pipelineOrder.indexOf(step);
    const past =
      backendDoneIds.has(step) || (activePipelineIdx >= 0 && stepIdx < activePipelineIdx);
    if (!past) continue;
    for (const seedId of BACKEND_TO_SEED[step] ?? []) {
      seedDoneFromBackend.add(seedId);
    }
  }

  /** Seed ids that should be active for the current backend step. */
  const seedActiveFromBackend = new Set<string>(
    backendActiveId ? BACKEND_TO_SEED[backendActiveId] ?? [] : []
  );

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

    // Pipeline-id bridge (fixes frozen "Analyze Bean" while architect/builder runs)
    if (seedDoneFromBackend.has(todo.id)) {
      status = 'done';
    } else if (seedActiveFromBackend.has(todo.id)) {
      // Prefer first mapped seed id as the single active row
      const mapped = backendActiveId ? BACKEND_TO_SEED[backendActiveId] ?? [] : [];
      status = mapped[0] === todo.id ? 'active' : mapped.includes(todo.id) ? 'pending' : status;
      if (todo.id === 'ui-trends' && mapped.includes('ui-trends') && mapped[0] === 'code-gen') {
        status = 'pending';
      }
      if (todo.id === 'live-deploy' && mapped[0] === 'github-push') {
        status = 'pending';
      }
    }

    switch (todo.id) {
      case 'github':
        if (backendDone('github') || backendDone('route') || seedDoneFromBackend.has('github')) {
          status = 'done';
        } else if (backendActive('github') || backendActive('route')) status = 'active';
        // Keep selected-repo seed as done
        if (todo.status === 'done') status = 'done';
        break;
      case 'research':
        if (incomingById.get('research')?.status === 'skipped') {
          return {
            ...todo,
            status: 'skipped' as const,
            label: incomingById.get('research')?.label || 'Research skipped — no live sources',
          };
        }
        if (backendDone('research')) status = 'done';
        else if (backendActive('research')) status = 'active';
        break;
      case 'ideas':
        if (backendDone('ideas') || backendDone('research')) status = 'done';
        else if (backendActive('ideas')) status = 'active';
        break;
      case 'analyze':
        if (backendDone('analyze') || backendDone('convert') || seedDoneFromBackend.has('analyze')) {
          status = 'done';
        } else if (backendActive('analyze') || backendActive('convert')) status = 'active';
        break;
      case 'plan':
      case 'structure':
        if (
          backendDone('plan') ||
          backendDone('structure') ||
          backendDone('steps') ||
          backendDone('verify-plan') ||
          backendDone('architect') ||
          seedDoneFromBackend.has('plan')
        ) {
          status = 'done';
        } else if (
          backendActive('plan') ||
          backendActive('structure') ||
          backendActive('steps') ||
          backendActive('architect')
        ) {
          status = 'active';
        }
        break;
      case 'ui-trends':
        if (
          backendDone('ui-trends') ||
          buildDoneCount > 0 ||
          backendDone('build') ||
          backendDone('qa') ||
          seedDoneFromBackend.has('ui-trends')
        ) {
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
        if (buildActive || backendActive('code-gen') || backendActive('build')) status = 'active';
        else if (buildSteps.length && buildDoneCount >= buildSteps.length) status = 'done';
        else if (backendDone('code-gen') || backendDone('build') || seedDoneFromBackend.has('code-gen')) {
          status = 'done';
        }
        break;
      case 'verify':
        if (
          backendDone('verify') ||
          backendDone('final-check') ||
          backendDone('emit') ||
          backendDone('qa') ||
          backendDone('compile') ||
          seedDoneFromBackend.has('verify')
        ) {
          status = 'done';
        } else if (
          backendActive('verify') ||
          backendActive('final-check') ||
          backendActive('emit') ||
          backendActive('qa') ||
          backendActive('compile')
        ) {
          status = 'active';
        }
        break;
      case 'submission':
        if (backendDone('submission')) status = 'done';
        else if (backendActive('submission')) status = 'active';
        break;
      case 'github-push':
        if (backendDone('github-push') || backendDone('push') || seedDoneFromBackend.has('github-push')) {
          status = 'done';
        } else if (backendActive('github-push') || backendActive('push')) status = 'active';
        break;
      case 'live-deploy':
        if (
          backendDone('live-deploy') ||
          backendDone('deploy') ||
          (backendDone('push') && !backendActive('push') && !backendActive('deploy') && seedDoneFromBackend.has('live-deploy'))
        ) {
          status = 'done';
        } else if (backendActive('live-deploy') || backendActive('deploy')) {
          status = 'active';
        } else if (backendActive('push') && status !== 'done') {
          status = 'pending';
        } else if (backendDone('push') && !backendActive('push') && status !== 'done') {
          status = 'active';
        }
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
    t.status === 'active' && t.id !== keep ? { ...t, status: 'pending' as const } : t
  );
}
