/** Prompt-matched planning copy — avoid the same generic “database & API” lines for every build. */

export function planningStepsForPrompt(prompt: string): string[] {
  const t = prompt.toLowerCase();
  if (/\b(chatbot|chat\s*bot|helpbee|support bot|ai assistant)\b/.test(t)) {
    return [
      'Plan chat shell — bubbles, input bar, sidebar history',
      'Wire send handlers + typing indicator',
      'Connect free AI chat runtime',
      'Polish mobile chat layout',
      'Verify messages send and replies appear',
      'Push to selected GitHub repo (optional)',
      'Open sandbox preview',
    ];
  }
  if (/\b(crypto|web3|defi|nebuladex|coingecko|wallet|token)\b/.test(t)) {
    return [
      'Plan dark dashboard — price cards & charts',
      'Wire CoinGecko live prices',
      'Add wallet stub + swap/stake UI',
      'Polish responsive DeFi layout',
      'Verify interactive controls',
      'Push to selected GitHub repo (optional)',
      'Open sandbox preview',
    ];
  }
  if (/\b(landing|homepage|hibee|pricing|night.?day)\b/.test(t)) {
    const name = /\b(?:called|named)\s+([A-Za-z0-9][\w-]{1,32})\b/i.exec(prompt)?.[1] || 'your landing page';
    return [
      `Plan ${name} — hero, pricing, theme toggle`,
      'Generate HTML/CSS/JS sections',
      'Wire night/day toggle & CTAs',
      'Polish responsive layout',
      'Verify pricing & interactions',
      'Push to selected GitHub repo (optional)',
      'Open sandbox preview',
    ];
  }
  return [
    'Plan pages, features & layout for your request',
    'Generate project HTML/CSS/JS',
    'Polish UI and interactions',
    'Verify quality & responsiveness',
    'Push to selected GitHub repo (optional)',
    'Open sandbox preview',
  ];
}

/** @deprecated Prefer planningStepsForPrompt(prompt) */
export const BUILD_PLANNING_STEPS = planningStepsForPrompt('website landing page') as readonly string[];

/** How XROGA builds projects — shown in behind-the-scenes panel */
export const XROGA_BUILD_PROCESS = [
  'Planning — map what you asked for (not a generic SaaS checklist)',
  'Building — generate real HTML/CSS/JS for your product',
  'Review — verify buttons and interactions work',
  'Preview — sandbox ready; GitHub push when repo is selected',
] as const;

export function startPipelineMessageForPrompt(prompt: string): string {
  const t = prompt.toLowerCase();
  if (/\b(chatbot|chat\s*bot|helpbee|support bot)\b/.test(t)) {
    return 'XROGA Architect — planning your chatbot UI & free AI chat…';
  }
  if (/\b(crypto|web3|defi|nebuladex|coingecko)\b/.test(t)) {
    return 'XROGA Architect — planning your crypto dashboard & live prices…';
  }
  if (/\b(landing|homepage|hibee|pricing)\b/.test(t)) {
    const name = /\b(?:called|named)\s+([A-Za-z0-9][\w-]{1,32})\b/i.exec(prompt)?.[1] || 'landing page';
    return `XROGA Architect — planning ${name} sections & theme…`;
  }
  return 'XROGA Architect — planning your project from your prompt…';
}
