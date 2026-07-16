/** User-facing build todos — mirrors frontend buildDefaultTodos.ts */

export interface BuildTodoDef {
  id: string;
  label: string;
}

export type UserTodoStatus = 'done' | 'active' | 'pending';

export interface UserTodoItem {
  id: string;
  label: string;
  status: UserTodoStatus;
}

function isHackathonPrompt(prompt: string): boolean {
  return /\b(hackathon|hack\s*athon|okx\.?ai|okx\s*ai|#okxai|asp\b|agent\s*service\s*provider|build\s*x\s*series|devpost|ethglobal|buidl)\b/i.test(
    prompt
  );
}

function isBlogPrompt(prompt: string): boolean {
  return (
    /\b(blog|miniblog|mini\s*blog|blog\s*site|blog\s*post|personal\s*blog)\b/i.test(prompt) &&
    !/\b(crypto|dashboard|chatbot|landing)\b/i.test(prompt)
  );
}

function isGamePrompt(prompt: string): boolean {
  return /\b(game|playable|phaser|unity|godot)\b/i.test(prompt);
}

function isUpdatePrompt(prompt: string): boolean {
  return /\b(update|change|fix|modify|edit|adjust|tweak|add\s+a|remove|replace)\b/i.test(prompt);
}

function isChatbotPrompt(prompt: string): boolean {
  return /\b(chatbot|chat\s*bot|support bot|ai assistant|helpbee|conversation ui)\b/i.test(prompt);
}

function isCryptoPrompt(prompt: string): boolean {
  return /\b(crypto|blockchain|web3|defi|nft|token|wallet|dao|dapp|exchange|staking|coingecko|nebuladex)\b/i.test(
    prompt
  );
}

function isLandingPrompt(prompt: string): boolean {
  return /\b(landing|homepage|marketing site|pricing|night.?day|toggle)\b/i.test(prompt);
}

export function buildTodosForPrompt(
  userPrompt: string,
  opts?: { hasSelectedRepo?: boolean; githubConnected?: boolean }
): BuildTodoDef[] {
  const prompt = userPrompt.trim();
  const ready = Boolean(opts?.hasSelectedRepo || opts?.githubConnected);
  const gh = ready ? 'Using your selected GitHub repo' : 'Prepare sandbox (GitHub optional)';
  const hackathon = isHackathonPrompt(prompt);
  const blog = isBlogPrompt(prompt);
  const game = isGamePrompt(prompt);
  const update = isUpdatePrompt(prompt);
  const chatbot = isChatbotPrompt(prompt);
  const crypto = isCryptoPrompt(prompt);
  const landing = isLandingPrompt(prompt);

  if (update && !hackathon) {
    return [
      { id: 'github', label: ready ? 'Load files from selected repo' : 'Load project files' },
      { id: 'analyze', label: 'Find files mentioned in your update' },
      { id: 'plan', label: 'Plan minimal code changes' },
      { id: 'code-gen', label: 'Apply patch to only the files you asked for' },
      { id: 'verify', label: 'Verify build still works' },
      { id: 'github-push', label: 'Push updated files to GitHub' },
      { id: 'live-deploy', label: 'Refresh live preview' },
    ];
  }

  if (hackathon) {
    return [
      { id: 'github', label: gh },
      { id: 'research', label: 'Research hackathon rules & prize tracks' },
      { id: 'ideas', label: 'Generate novel concept aligned to requirements' },
      { id: 'analyze', label: 'Analyze scope' },
      { id: 'plan', label: 'Plan architecture, APIs & database' },
      { id: 'code-gen', label: 'Generate code step by step' },
      { id: 'verify', label: 'Verify quality & integrations' },
      { id: 'github-push', label: 'Push files to GitHub' },
      { id: 'live-deploy', label: 'Deploy live preview' },
    ];
  }

  if (chatbot) {
    return [
      { id: 'github', label: gh },
      { id: 'analyze', label: 'Analyze chatbot UX — bubbles, input, sidebar' },
      { id: 'plan', label: 'Plan chat layout, history & free AI wiring' },
      { id: 'code-gen', label: 'Build chat UI + send handlers' },
      { id: 'ui-trends', label: 'Polish typing indicator & mobile chat' },
      { id: 'verify', label: 'Verify messages send & AI replies work' },
      { id: 'github-push', label: 'Push chatbot files to GitHub' },
      { id: 'live-deploy', label: 'Open sandbox / live preview' },
    ];
  }

  if (crypto) {
    return [
      { id: 'github', label: gh },
      { id: 'analyze', label: 'Analyze crypto dashboard — prices, charts, wallet' },
      { id: 'plan', label: 'Plan metrics, CoinGecko feed & swap UI' },
      { id: 'code-gen', label: 'Build dark dashboard with live prices' },
      { id: 'ui-trends', label: 'Polish charts, wallet stub & mobile layout' },
      { id: 'verify', label: 'Verify price fetch & interactive controls' },
      { id: 'github-push', label: 'Push dashboard files to GitHub' },
      { id: 'live-deploy', label: 'Open sandbox / live preview' },
    ];
  }

  if (landing || blog) {
    const name =
      /\b(?:called|named)\s+([A-Za-z0-9][\w-]{1,32})\b/i.exec(prompt)?.[1] ||
      (blog ? 'blog' : 'landing page');
    return [
      { id: 'github', label: gh },
      { id: 'analyze', label: `Analyze ${name} — sections, theme, pricing` },
      { id: 'plan', label: `Plan ${name} pages & theme toggles` },
      { id: 'code-gen', label: `Generate ${name} HTML/CSS/JS` },
      { id: 'ui-trends', label: 'Polish responsive layout & interactions' },
      { id: 'verify', label: 'Verify buttons, toggle & pricing section' },
      { id: 'github-push', label: 'Push site files to GitHub' },
      { id: 'live-deploy', label: 'Open sandbox / live preview' },
    ];
  }

  if (game) {
    return [
      { id: 'github', label: gh },
      { id: 'analyze', label: 'Analyze game concept & mechanics' },
      { id: 'plan', label: 'Plan game loop, controls & assets' },
      { id: 'code-gen', label: 'Generate playable game code' },
      { id: 'verify', label: 'Verify gameplay & controls' },
      { id: 'github-push', label: 'Push game files to GitHub' },
      { id: 'live-deploy', label: 'Deploy playable preview' },
    ];
  }

  return [
    { id: 'github', label: gh },
    { id: 'analyze', label: 'Analyze your requirements & scope' },
    { id: 'plan', label: 'Plan pages, features & layout' },
    { id: 'code-gen', label: 'Generate project files' },
    { id: 'ui-trends', label: 'Apply UI polish' },
    { id: 'verify', label: 'Verify quality & responsiveness' },
    { id: 'github-push', label: 'Push project files to GitHub' },
    { id: 'live-deploy', label: 'Open sandbox / live preview' },
  ];
}

export function seedUserTodos(
  userPrompt: string,
  opts?: { hasSelectedRepo?: boolean; githubConnected?: boolean }
): UserTodoItem[] {
  const ready = Boolean(opts?.hasSelectedRepo || opts?.githubConnected);
  const defs = buildTodosForPrompt(userPrompt, opts);
  return defs.map((d) => {
    if (d.id === 'github' && ready) {
      return { id: d.id, label: d.label, status: 'done' as const };
    }
    const firstActiveId = ready ? defs.find((x) => x.id !== 'github')?.id : defs[0]?.id;
    return {
      id: d.id,
      label: d.label,
      status: d.id === firstActiveId ? ('active' as const) : ('pending' as const),
    };
  });
}
