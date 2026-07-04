/** Beginner-friendly 6-step website plans */

export const BEGINNER_WEBSITE_PLAN = [
  'Step 1: Homepage — hero, header, navigation',
  'Step 2: Menu — drinks, food items, pricing',
  'Step 3: Ordering — cart and checkout UI',
  'Step 4: Gallery — photo grid',
  'Step 5: Contact — form and footer',
  'Step 6: Responsive Design — mobile-first polish',
] as const;

export const BEGINNER_WEBSITE_PLAN_NO_ORDER = [
  'Step 1: Homepage — hero, header, navigation',
  'Step 2: Menu — items and pricing',
  'Step 3: Gallery — photo grid',
  'Step 4: Contact — form and footer',
  'Step 5: Styling — colors, typography, theme',
  'Step 6: Responsive Design — mobile-first polish',
] as const;

export function defaultPlanForPrompt(prompt: string): string[] {
  const t = prompt.toLowerCase();
  const noOrder = /\b(no payment|without ordering|no ordering)\b/.test(t) || /\b,\s*no\b/.test(t);

  if (/\bcoffee|caf[eé]|espresso|latte\b/.test(t)) {
    return noOrder
      ? [
          'Step 1: Homepage — cozy hero, warm brown & gold branding',
          'Step 2: Menu — drinks & pastries with prices',
          'Step 3: Gallery — coffee shop photos',
          'Step 4: Contact — location, hours, form',
          'Step 5: Styling — warm brown & gold theme',
          'Step 6: Responsive Design — mobile-first',
        ]
      : [
          'Step 1: Homepage — cozy hero, warm brown & gold branding',
          'Step 2: Menu — drinks & pastries with prices',
          'Step 3: Ordering — cart and order summary',
          'Step 4: Gallery — coffee shop photos',
          'Step 5: Contact — location, hours, form',
          'Step 6: Responsive Design — mobile-first',
        ];
  }

  return [...(noOrder ? BEGINNER_WEBSITE_PLAN_NO_ORDER : BEGINNER_WEBSITE_PLAN)];
}

export const WEBSITE_UPDATE_PLAN = [
  'Step 1: Homepage — apply new name, colors, and branding',
  'Step 2: Menu & sections — update per user request',
  'Step 3: Styling — new color theme across CSS',
  'Step 4: Ordering & gallery — keep working, polish if needed',
  'Step 5: Contact & footer — sync with new branding',
  'Step 6: Responsive Design — final mobile polish',
] as const;

export function defaultUpdatePlanForPrompt(_prompt: string): string[] {
  return [...WEBSITE_UPDATE_PLAN];
}
