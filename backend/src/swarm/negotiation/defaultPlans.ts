/** Fallback step-by-step plans when LLM plan parsing yields no steps */

export const DEFAULT_WEBSITE_PLAN = [
  'Step 1: Setup project structure — index.html, style.css, app.js',
  'Step 2: Create HTML layout — header, nav, hero section',
  'Step 3: Add menu section with items and pricing',
  'Step 4: Add gallery and ordering UI sections',
  'Step 5: Write CSS — warm theme, typography, layout',
  'Step 6: Write CSS — responsive menu, gallery, mobile-first',
  'Step 7: Add JavaScript — cart and ordering interactivity',
  'Step 8: Add JavaScript — gallery, forms, and polish',
] as const;

export function defaultPlanForPrompt(prompt: string): string[] {
  const t = prompt.toLowerCase();
  if (/\bcoffee|caf[eé]|espresso|latte\b/.test(t)) {
    return [
      'Step 1: index.html — scaffold, meta, link style.css & app.js',
      'Step 2: index.html — header, hero, warm brown & gold branding',
      'Step 3: index.html — menu section with drinks & pastries',
      'Step 4: index.html — gallery grid and order/cart UI',
      'Step 5: style.css — global styles, colors, typography',
      'Step 6: style.css — responsive layout for menu & gallery',
      'Step 7: app.js — cart add/remove and order summary',
      'Step 8: app.js — gallery interactions and form validation',
    ];
  }
  return [...DEFAULT_WEBSITE_PLAN];
}
