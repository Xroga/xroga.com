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
 * Honest build checklist aligned to backend pipeline ids
 * (route/convert/architect/build/qa/compile/push) — not marketing theater.
 */
export function buildTodosForPrompt(userPrompt: string, opts?: { hasSelectedRepo?: boolean }): BuildTodoDef[] {
  const hasSelectedRepo =
    opts?.hasSelectedRepo ?? Boolean(getSelectedRepoContext()?.repo?.includes('/'));
  const update = isUpdatePrompt(userPrompt.trim());

  if (update) {
    return [
      { id: 'github', label: hasSelectedRepo ? 'Load selected repo' : 'Load project files' },
      { id: 'analyze', label: 'Convert update brief' },
      { id: 'plan', label: 'Plan file changes' },
      { id: 'code-gen', label: 'Apply code patches' },
      { id: 'verify', label: 'QA / validate' },
      { id: 'github-push', label: 'Push to GitHub' },
      { id: 'live-deploy', label: 'Refresh preview' },
    ];
  }

  return [
    { id: 'github', label: hasSelectedRepo ? 'Using selected GitHub repo' : 'Prepare project' },
    { id: 'analyze', label: 'Convert request' },
    { id: 'plan', label: 'File plan' },
    { id: 'code-gen', label: 'Generate code' },
    { id: 'verify', label: 'QA / validate' },
    { id: 'github-push', label: 'Push to GitHub' },
    { id: 'live-deploy', label: 'Open preview' },
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
