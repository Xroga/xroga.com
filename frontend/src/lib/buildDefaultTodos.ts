import type { SwarmTodoItem } from '@/lib/swarm';
import { getSelectedRepoContext } from '@/lib/repoContext';

export interface BuildTodoDef {
  id: string;
  label: string;
}

function isUpdatePrompt(prompt: string): boolean {
  return /\b(update|change|fix|modify|edit|adjust|tweak|add\s+a|remove|replace)\b/i.test(prompt);
}

/**
 * Compact real job statuses — no theater labels (Convert request / File plan / etc.).
 * Ids stay aligned to backend pipeline mapping in mergeBuildTodos.
 */
export function buildTodosForPrompt(userPrompt: string, opts?: { hasSelectedRepo?: boolean }): BuildTodoDef[] {
  const hasSelectedRepo =
    opts?.hasSelectedRepo ?? Boolean(getSelectedRepoContext()?.repo?.includes('/'));
  const update = isUpdatePrompt(userPrompt.trim());

  if (update) {
    return [
      { id: 'github', label: hasSelectedRepo ? 'Inspecting project' : 'Reading files' },
      { id: 'analyze', label: 'Request accepted' },
      { id: 'plan', label: 'Reading files' },
      { id: 'code-gen', label: 'Editing files' },
      { id: 'verify', label: 'Validating' },
      { id: 'github-push', label: 'Pushing' },
      { id: 'live-deploy', label: 'Deploying' },
    ];
  }

  return [
    { id: 'github', label: hasSelectedRepo ? 'Inspecting project' : 'Request accepted' },
    { id: 'analyze', label: 'Request accepted' },
    { id: 'plan', label: 'Reading files' },
    { id: 'code-gen', label: 'Editing files' },
    { id: 'verify', label: 'Validating' },
    { id: 'github-push', label: 'Pushing' },
    { id: 'live-deploy', label: 'Deploying' },
  ];
}

export function seedBuildTodos(userPrompt = ''): SwarmTodoItem[] {
  const hasSelectedRepo = Boolean(getSelectedRepoContext()?.repo?.includes('/'));
  const defs = buildTodosForPrompt(userPrompt, { hasSelectedRepo });
  const firstActiveId = hasSelectedRepo
    ? defs.find((x) => x.id !== 'github')?.id
    : defs[0]?.id;
  return defs.map((d) => {
    if (d.id === 'github' && hasSelectedRepo) {
      return { id: d.id, label: d.label, status: 'done' as const };
    }
    return {
      id: d.id,
      label: d.label,
      status: d.id === firstActiveId ? ('active' as const) : ('pending' as const),
    };
  });
}

/** @deprecated Use buildTodosForPrompt */
export const BUILD_DEFAULT_TODO_DEFS = buildTodosForPrompt('');
