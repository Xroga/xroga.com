/** Beginner-friendly 6-step website plans — any niche, not coffee-only */

export const BEGINNER_WEBSITE_PLAN = [
  'Step 1: Homepage — hero, header, navigation',
  'Step 2: Services / Menu / Products — items and pricing',
  'Step 3: Booking or Ordering — cart, form, or CTA',
  'Step 4: Gallery — photo grid or portfolio',
  'Step 5: Contact — form, map, footer',
  'Step 6: Responsive Design — mobile-first polish',
] as const;

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
  const plans: Array<{ match: RegExp; name: string; theme: string; steps: string[] }> = [
    { match: /\bcoffee|caf[eé]|espresso\b/, name: 'Homepage — cozy hero, warm branding', theme: 'warm', steps: ['Menu — drinks & pastries', 'Ordering — cart UI', 'Gallery', 'Contact', 'Responsive'] },
    { match: /\brestaurant|bistro|dining|pizza\b/, name: 'Homepage — hero, reservations CTA', theme: 'elegant', steps: ['Menu — dishes & prices', 'Reservations / ordering', 'Gallery', 'Contact & hours', 'Responsive'] },
    { match: /\bbakery|pastry|bread\b/, name: 'Homepage — fresh baked hero', theme: 'pastel', steps: ['Product menu', 'Order online', 'Gallery', 'Contact', 'Responsive'] },
    { match: /\bsalon|spa|beauty|barber\b/, name: 'Homepage — services hero', theme: 'luxury', steps: ['Services & pricing', 'Book appointment', 'Gallery', 'Contact', 'Responsive'] },
    { match: /\bgym|fitness|yoga|crossfit\b/, name: 'Homepage — transform hero', theme: 'bold', steps: ['Classes & membership', 'Schedule / join', 'Trainers gallery', 'Contact', 'Responsive'] },
    { match: /\bdental|clinic|medical|doctor|health\b/, name: 'Homepage — trust hero', theme: 'clean', steps: ['Services', 'Book appointment', 'Team', 'Contact', 'Responsive'] },
    { match: /\blawyer|legal|attorney\b/, name: 'Homepage — professional hero', theme: 'corporate', steps: ['Practice areas', 'Consultation CTA', 'About', 'Contact', 'Responsive'] },
    { match: /\breal estate|realtor|property\b/, name: 'Homepage — listings hero', theme: 'modern', steps: ['Featured listings', 'Search / filters', 'About agent', 'Contact', 'Responsive'] },
    { match: /\bhotel|resort|hospitality\b/, name: 'Homepage — stay hero', theme: 'luxury', steps: ['Rooms & rates', 'Book now', 'Gallery', 'Contact', 'Responsive'] },
    { match: /\bportfolio|photographer|designer|freelance\b/, name: 'Homepage — showcase hero', theme: 'minimal', steps: ['Portfolio grid', 'About', 'Services', 'Contact', 'Responsive'] },
    { match: /\becommerce|online store|retail|boutique\b/, name: 'Homepage — shop hero', theme: 'modern', steps: ['Product catalog', 'Cart & checkout UI', 'Featured', 'Contact', 'Responsive'] },
    { match: /\bchurch|nonprofit|charity\b/, name: 'Homepage — mission hero', theme: 'warm', steps: ['Programs', 'Donate CTA', 'Events', 'Contact', 'Responsive'] },
    { match: /\bschool|education|tutor|course\b/, name: 'Homepage — learn hero', theme: 'friendly', steps: ['Courses', 'Enroll CTA', 'About', 'Contact', 'Responsive'] },
    { match: /\bconstruction|plumber|roofing|cleaning|auto repair\b/, name: 'Homepage — services hero', theme: 'professional', steps: ['Services & quotes', 'Gallery / projects', 'Reviews', 'Contact', 'Responsive'] },
    { match: /\bwedding|event|party planner\b/, name: 'Homepage — celebrate hero', theme: 'elegant', steps: ['Packages', 'Gallery', 'Book consultation', 'Contact', 'Responsive'] },
    { match: /\bpet|veterinary|vet\b/, name: 'Homepage — care hero', theme: 'friendly', steps: ['Services', 'Book visit', 'Gallery', 'Contact', 'Responsive'] },
    { match: /\b(crm|contacts list|deals pipeline|sales pipeline|sales dashboard)\b/, name: 'CRM Dashboard — corporate header, sidebar navigation', theme: 'corporate clean blue/slate', steps: [
      'Contacts list — searchable table, company names, avatars',
      'Deals pipeline — kanban columns (Lead, Proposal, Negotiation, Won)',
      'Tasks board — priority todos, due dates, checkboxes',
      'Analytics — KPI cards and bar/line charts (revenue, deals, tasks)',
      'Responsive Design — mobile-friendly dashboard layout',
    ] },
    { match: /\bstartup|saas|tech|software company\b/, name: 'Homepage — product hero', theme: 'tech', steps: ['Features', 'Pricing', 'Testimonials', 'Contact / demo', 'Responsive'] },
    { match: /\b(crypto|blockchain|web3|defi|nft|token|wallet|dao|dapp|exchange|staking)\b/, name: 'Web3 Dashboard — wallet connect hero, dark theme', theme: 'crypto dark gradient', steps: [
      'Token metrics — price, volume, market cap cards',
      'Wallet connect UI — MetaMask / WalletConnect stub',
      'Swap / stake interface — form, charts, APY display',
      'Transaction history table — hash, status, amount',
      'Security & docs section — audit badges, FAQ',
      'Responsive Design — mobile-first DeFi layout',
    ] },
    { match: /\b(chatbot|chat bot|ai assistant|ai agent|support bot|customer support)\b/, name: 'Chatbot App — conversation UI shell', theme: 'modern AI assistant', steps: [
      'Chat window — message bubbles, typing indicator',
      'Input bar — send, attach, voice stub',
      'Sidebar — conversation history, new chat',
      'Settings panel — model, tone, API key placeholder',
      'Embed widget preview — floating launcher button',
      'Responsive Design — mobile chat layout',
    ] },
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

export function defaultUpdatePlanForPrompt(_prompt: string): string[] {
  return [...WEBSITE_UPDATE_PLAN];
}
