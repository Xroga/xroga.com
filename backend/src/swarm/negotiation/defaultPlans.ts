/** Beginner-friendly 6-step website plans — any niche, not coffee-only */

import { planIncrementalUpdate } from '../../lib/incrementalUpdate.js';

export const BEGINNER_WEBSITE_PLAN = [
  'Step 1: Homepage — hero, header, navigation',
  'Step 2: Services / Menu / Products — items and pricing',
  'Step 3: Booking or Ordering — cart, form, or CTA',
  'Step 4: Gallery — photo grid or portfolio',
  'Step 5: Contact — form, map, footer',
  'Step 6: Responsive Design — mobile-first polish',
] as const;

/** Fast path for simple blogs — 1 shot complete blog */
export const SIMPLE_BLOG_PLAN = [
  'Step 1: Complete simple blog — single index.html + CSS+JS: header, nav, hero, post list with localStorage add/edit/delete, about blurb, footer, responsive modern UI',
] as const;

/** Fast path for simple landings/portfolios — 1 shot, NOT a blog */
export const SIMPLE_LANDING_PLAN = [
  'Step 1: Complete site matching the user brief — index.html + CSS+JS: header, hero, services/features, CTA, contact, footer. Do NOT build a blog unless the user asked for a blog.',
] as const;

/** @deprecated use SIMPLE_BLOG_PLAN / SIMPLE_LANDING_PLAN — kept for imports */
export const SIMPLE_STATIC_PLAN = SIMPLE_BLOG_PLAN;

export const BEGINNER_WEBSITE_PLAN_NO_ORDER = [
  'Step 1: Homepage — hero, header, navigation',
  'Step 2: Services / Products — items and pricing',
  'Step 3: Gallery — photo grid or portfolio',
  'Step 4: About — story and team',
  'Step 5: Contact — form and footer',
  'Step 6: Responsive Design — mobile-first polish',
] as const;

function nicheFromPrompt(prompt: string): { name: string; theme: string; steps: string[] } | null {
  const t = prompt.toLowerCase();
  // Product niches FIRST. Every alternation must use \b on EACH term —
  // otherwise /\bsalon|spa|beauty\b/ matches "spa" inside "sparkline" and steals crypto builds.
  const plans: Array<{ match: RegExp; name: string; theme: string; steps: string[] }> = [
    // Keep niche step lists short (≤2). Engine also caps maxBuildSteps — long plans
    // caused 25–30min DeepSeek Pro correction loops with no shipped product.
    { match: /\b(crypto|blockchain|web3|defi|nft|token|wallet|dao|dapp|exchange|staking)\b/, name: 'Web3 Dashboard — wallet connect hero, dark theme', theme: 'crypto dark gradient', steps: [
      'Complete dashboard — live token metrics, charts, wallet stub, swap/stake UI, tx table, responsive dark theme',
      'Polish interactions — working buttons, CoinGecko price fetch, mobile layout',
    ] },
    { match: /\b(chatbot|chat bot|ai assistant|ai agent|support bot|customer support)\b/, name: 'Chatbot App — conversation UI shell', theme: 'modern AI assistant', steps: [
      'Complete chat app — message bubbles, input bar, sidebar history, settings, responsive layout',
      'Polish — typing indicator, send handlers, mobile chat shell',
    ] },
    { match: /\b(crm|contacts list|deals pipeline|sales pipeline|sales dashboard)\b/, name: 'CRM Dashboard — corporate header, sidebar navigation', theme: 'corporate clean blue/slate', steps: [
      'Complete CRM — contacts table, deals kanban, tasks, KPI charts, responsive layout',
      'Polish — search/filter, click handlers, mobile sidebar',
    ] },
    { match: /\b(startup|saas|software company)\b/, name: 'Homepage — product hero', theme: 'tech', steps: ['Features', 'Pricing', 'Testimonials', 'Contact / demo', 'Responsive'] },
    { match: /\b(coffee|caf[eé]|espresso)\b/, name: 'Homepage — cozy hero, warm branding', theme: 'warm', steps: ['Menu — drinks & pastries', 'Ordering — cart UI', 'Gallery', 'Contact', 'Responsive'] },
    { match: /\b(restaurant|bistro|dining|pizza)\b/, name: 'Homepage — hero, reservations CTA', theme: 'elegant', steps: ['Menu — dishes & prices', 'Reservations / ordering', 'Gallery', 'Contact & hours', 'Responsive'] },
    { match: /\b(bakery|pastry|bread)\b/, name: 'Homepage — fresh baked hero', theme: 'pastel', steps: ['Product menu', 'Order online', 'Gallery', 'Contact', 'Responsive'] },
    { match: /\b(salon|spa|beauty|barber)\b/, name: 'Homepage — services hero', theme: 'luxury', steps: ['Services & pricing', 'Book appointment', 'Gallery', 'Contact', 'Responsive'] },
    { match: /\b(gym|fitness|yoga|crossfit)\b/, name: 'Homepage — transform hero', theme: 'bold', steps: ['Classes & membership', 'Schedule / join', 'Trainers gallery', 'Contact', 'Responsive'] },
    { match: /\b(dental|clinic|medical|doctor)\b/, name: 'Homepage — trust hero', theme: 'clean', steps: ['Services', 'Book appointment', 'Team', 'Contact', 'Responsive'] },
    { match: /\b(lawyer|legal|attorney)\b/, name: 'Homepage — professional hero', theme: 'corporate', steps: ['Practice areas', 'Consultation CTA', 'About', 'Contact', 'Responsive'] },
    { match: /\b(real estate|realtor|property)\b/, name: 'Homepage — listings hero', theme: 'modern', steps: ['Featured listings', 'Search / filters', 'About agent', 'Contact', 'Responsive'] },
    { match: /\b(hotel|resort|hospitality)\b/, name: 'Homepage — stay hero', theme: 'luxury', steps: ['Rooms & rates', 'Book now', 'Gallery', 'Contact', 'Responsive'] },
    { match: /\b(portfolio|photographer|freelance)\b/, name: 'Homepage — showcase hero', theme: 'minimal', steps: ['Portfolio grid', 'About', 'Services', 'Contact', 'Responsive'] },
    { match: /\b(ecommerce|online store|retail|boutique)\b/, name: 'Homepage — shop hero', theme: 'modern', steps: ['Product catalog', 'Cart & checkout UI', 'Featured', 'Contact', 'Responsive'] },
    { match: /\b(church|nonprofit|charity)\b/, name: 'Homepage — mission hero', theme: 'warm', steps: ['Programs', 'Donate CTA', 'Events', 'Contact', 'Responsive'] },
    { match: /\b(school|education|tutor|course)\b/, name: 'Homepage — learn hero', theme: 'friendly', steps: ['Courses', 'Enroll CTA', 'About', 'Contact', 'Responsive'] },
    { match: /\b(construction|plumber|roofing|cleaning|auto repair)\b/, name: 'Homepage — services hero', theme: 'professional', steps: ['Services & quotes', 'Gallery / projects', 'Reviews', 'Contact', 'Responsive'] },
    { match: /\b(wedding|event|party planner)\b/, name: 'Homepage — celebrate hero', theme: 'elegant', steps: ['Packages', 'Gallery', 'Book consultation', 'Contact', 'Responsive'] },
    { match: /\b(pet|veterinary|vet)\b/, name: 'Homepage — care hero', theme: 'friendly', steps: ['Services', 'Book visit', 'Gallery', 'Contact', 'Responsive'] },
  ];

  for (const p of plans) {
    if (p.match.test(t)) {
      return {
        name: p.name,
        theme: p.theme,
        steps: p.steps.map((s, i) => `Step ${i + 2}: ${s}`),
      };
    }
  }
  return null;
}

export function defaultPlanForPrompt(prompt: string): string[] {
  const t = prompt.toLowerCase();
  // Blog plan ONLY when the user asked for a blog — never force blogs onto landings/portfolios/crypto
  if (/\b(blog|journal|newsletter)\b/.test(t) && !/\b(crypto|dashboard|saas|marketplace|defi|web3)\b/.test(t)) {
    return [...SIMPLE_BLOG_PLAN];
  }
  if (/\b(portfolio|personal site)\b/.test(t)) {
    return [
      'Step 1: Portfolio site — hero, project grid, about, contact form, responsive CSS/JS — not a blog',
    ];
  }
  if (/\b(landing|simple website|simple site|homepage|marketing site)\b/.test(t)) {
    return [...SIMPLE_LANDING_PLAN];
  }
  const noOrder = /\b(no payment|without ordering|no ordering)\b/.test(t) || /\b,\s*no\b/.test(t);
  const niche = nicheFromPrompt(prompt);

  if (niche) {
    return [`Step 1: ${niche.name}`, ...niche.steps];
  }

  return [...(noOrder ? BEGINNER_WEBSITE_PLAN_NO_ORDER : BEGINNER_WEBSITE_PLAN)];
}

export function defaultGamePlanForPrompt(prompt: string, maxSteps = 4): string[] {
  const t = prompt.toLowerCase();
  const genre = /\b(puzzle|platformer|rpg|shooter|arcade|racing|card|strategy)\b/.exec(t)?.[1] ?? 'arcade';
  const full = [
    'Step 1: Bare Bones — canvas/window, game loop, player movement, placeholder graphics',
    'Step 2: Core Gameplay — main mechanic, enemies or obstacles, scoring',
    'Step 3: UI & States — score, lives, start screen, game over, restart',
    'Step 4: Polish — particles, screen shake, difficulty curve, sound hooks',
  ];
  if (/\b(puzzle|card)\b/.test(t)) {
    full[1] = 'Step 2: Core Gameplay — puzzle rules, grid/cards, win condition';
  }
  if (/\b(rpg|adventure)\b/.test(t)) {
    full[1] = 'Step 2: Core Gameplay — map movement, encounters, inventory stub';
  }
  void genre;
  return full.slice(0, maxSteps);
}

export const WEBSITE_UPDATE_PLAN = [
  'Step 1: Homepage — apply new name, colors, and branding',
  'Step 2: Menu & sections — update per user request',
  'Step 3: Styling — new color theme across CSS',
  'Step 4: Ordering & gallery — keep working, polish if needed',
  'Step 5: Contact & footer — sync with new branding',
  'Step 6: Responsive Design — final mobile polish',
] as const;

export function defaultUpdatePlanForPrompt(prompt: string): string[] {
  const { labels, stepCount } = planIncrementalUpdate(prompt);
  if (stepCount === 1) return [labels[0] ?? 'Apply targeted patch to named files only'];
  return labels.length >= 2 ? labels : [labels[0] ?? 'Patch files', 'Verify & polish touched UI only'];
}
