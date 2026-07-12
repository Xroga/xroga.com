import type { SwarmTodoItem } from './swarm';

export interface BuildTodoDef {
  id: string;
  label: string;
}

function isHackathonPrompt(prompt: string): boolean {
  return /\b(hackathon|hack\s*athon|okx\.?ai|okx\s*ai|#okxai|asp\b|agent\s*service\s*provider|build\s*x\s*series|devpost|ethglobal|buidl)\b/i.test(
    prompt
  );
}

function isBlogPrompt(prompt: string): boolean {
  return /\b(blog|miniblog|mini\s*blog|blog\s*site|blog\s*post|personal\s*blog)\b/i.test(prompt);
}

function isGamePrompt(prompt: string): boolean {
  return /\b(game|playable|phaser|unity|godot)\b/i.test(prompt);
}

function isUpdatePrompt(prompt: string): boolean {
  return /\b(update|change|fix|modify|edit|adjust|tweak|add\s+a|remove|replace)\b/i.test(prompt);
}

/** Context-aware todos shown when a code build starts — matches the user's actual request. */
export function buildTodosForPrompt(userPrompt: string): BuildTodoDef[] {
  const prompt = userPrompt.trim();
  const hackathon = isHackathonPrompt(prompt);
  const blog = isBlogPrompt(prompt);
  const game = isGamePrompt(prompt);
  const update = isUpdatePrompt(prompt);

  if (update && !hackathon) {
    return [
      { id: 'github', label: 'Load your GitHub project' },
      { id: 'analyze', label: 'Find files mentioned in your update' },
      { id: 'plan', label: 'Plan minimal code changes (token-efficient)' },
      { id: 'code-gen', label: 'Apply patch to only the files you asked for' },
      { id: 'verify', label: 'Verify build still works' },
      { id: 'github-push', label: 'Push updated files to GitHub' },
      { id: 'live-deploy', label: 'Refresh live preview on your Vercel account' },
    ];
  }

  if (hackathon) {
    return [
      { id: 'github', label: 'Connect GitHub repository' },
      { id: 'research', label: 'Research hackathon rules, sponsor gaps & prize tracks' },
      { id: 'ideas', label: 'Generate novel ASP concept aligned to requirements' },
      { id: 'analyze', label: 'Analyze scope & read repo (cached — once per branch)' },
      { id: 'plan', label: 'Plan architecture, APIs & database' },
      { id: 'structure', label: 'Review and approve build plan' },
      { id: 'ui-trends', label: 'Apply 2026 UI/UX trends & animations' },
      { id: 'code-gen', label: 'Generate code step by step' },
      { id: 'verify', label: 'Verify quality, security & integrations' },
      { id: 'submission', label: 'Prepare demo script, listing copy & #OKXAI post draft' },
      { id: 'github-push', label: 'Push only relevant files to GitHub' },
      { id: 'live-deploy', label: 'Deploy live preview to your Vercel account' },
    ];
  }

  if (blog) {
    return [
      { id: 'github', label: 'Connect GitHub repository' },
      { id: 'analyze', label: 'Analyze blog requirements (posts, layout, storage)' },
      { id: 'plan', label: 'Plan blog structure, pages & features' },
      { id: 'ui-trends', label: 'Apply clean, modern blog UI/UX' },
      { id: 'code-gen', label: 'Generate blog code step by step' },
      { id: 'verify', label: 'Verify responsive design & localStorage/posts' },
      { id: 'github-push', label: 'Push blog files to GitHub' },
      { id: 'live-deploy', label: 'Deploy live preview to your Vercel account' },
    ];
  }

  if (game) {
    return [
      { id: 'github', label: 'Connect GitHub repository' },
      { id: 'analyze', label: 'Analyze game concept & mechanics' },
      { id: 'plan', label: 'Plan game loop, controls & assets' },
      { id: 'ui-trends', label: 'Apply polished game UI & animations' },
      { id: 'code-gen', label: 'Generate playable game code' },
      { id: 'verify', label: 'Verify gameplay, controls & performance' },
      { id: 'github-push', label: 'Push game files to GitHub' },
      { id: 'live-deploy', label: 'Deploy playable preview to your Vercel account' },
    ];
  }

  return [
    { id: 'github', label: 'Connect GitHub repository' },
    { id: 'analyze', label: 'Analyze your requirements & scope' },
    { id: 'plan', label: 'Plan architecture, pages & features' },
    { id: 'structure', label: 'Review and approve build plan' },
    { id: 'ui-trends', label: 'Apply modern UI/UX design patterns' },
    { id: 'code-gen', label: 'Generate code step by step' },
    { id: 'verify', label: 'Verify quality, security & responsiveness' },
    { id: 'github-push', label: 'Push project files to GitHub' },
    { id: 'live-deploy', label: 'Deploy live preview to your Vercel account' },
  ];
}

export function seedBuildTodos(userPrompt = ''): SwarmTodoItem[] {
  const defs = buildTodosForPrompt(userPrompt);
  return defs.map((d, i) => ({
    id: d.id,
    label: d.label,
    status: i === 0 ? 'active' : 'pending',
  }));
}

/** @deprecated Use buildTodosForPrompt — kept for tests referencing old export shape */
export const BUILD_DEFAULT_TODO_DEFS = buildTodosForPrompt('');
