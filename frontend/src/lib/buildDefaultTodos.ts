import type { SwarmTodoItem } from './swarm';

/** Shown immediately when code/build processing starts — before backend SSE arrives */
export const BUILD_DEFAULT_TODO_DEFS = [
  { id: 'github', label: 'Connect GitHub repository' },
  { id: 'analyze', label: 'Analyze requirements & project scope' },
  { id: 'plan', label: 'Plan architecture, APIs & database schema' },
  { id: 'structure', label: 'Review and approve build plan' },
  { id: 'code-gen', label: 'Generate code files step by step' },
  { id: 'verify', label: 'Verify quality, security & integrations' },
  { id: 'github-push', label: 'Push code to your GitHub repo' },
  { id: 'live-deploy', label: 'Deploy live preview' },
] as const;

export function seedBuildTodos(): SwarmTodoItem[] {
  return BUILD_DEFAULT_TODO_DEFS.map((d, i) => ({
    id: d.id,
    label: d.label,
    status: i === 0 ? 'active' : 'pending',
  }));
}
