import type { SwarmTodoItem } from './swarm';

/** Shown immediately when code/build processing starts */
export const BUILD_DEFAULT_TODO_DEFS = [
  { id: 'github', label: 'Connect GitHub repository' },
  { id: 'research', label: 'Research requirements, trends & hackathon rules' },
  { id: 'analyze', label: 'Analyze scope & read repo (cached — once per branch)' },
  { id: 'plan', label: 'Plan architecture, APIs & database (Grok + DeepSeek)' },
  { id: 'structure', label: 'Review and approve build plan' },
  { id: 'ui-trends', label: 'Apply 2026 UI/UX trends & animations' },
  { id: 'code-gen', label: 'Generate code step by step' },
  { id: 'verify', label: 'Verify quality, security & integrations' },
  { id: 'github-push', label: 'Push only relevant files to GitHub' },
  { id: 'live-deploy', label: 'Deploy live preview to your Vercel account' },
] as const;

export function seedBuildTodos(): SwarmTodoItem[] {
  return BUILD_DEFAULT_TODO_DEFS.map((d, i) => ({
    id: d.id,
    label: d.label,
    status: i === 0 ? 'active' : 'pending',
  }));
}
