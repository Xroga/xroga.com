/** Full Xroga platform spec — Parts 1–9 for /docs/platform */

export const PLATFORM_PARTS = [
  {
    id: 'part-1',
    title: 'Part 1: What Xroga AI Builds',
    sections: [
      {
        heading: 'Websites',
        items: [
          'Landing pages, marketing sites, portfolios, blogs',
          'E-commerce, membership sites, news sites, directories',
          'Restaurant, real estate, travel, event sites',
        ],
        stack: 'Next.js + Tailwind CSS · Vercel · Cloudflare',
      },
      {
        heading: 'Full-stack applications',
        items: [
          'SaaS, CRM, project management, invoicing, dashboards',
          'Help desks, inventory, task management, booking systems',
        ],
        stack: 'Next.js + Supabase + Edge Functions · Paddle · Vercel',
      },
      {
        heading: 'AI-powered applications',
        items: [
          'Chatbots, content generators, tutors, automation',
          'Image generators, voice assistants, research tools',
        ],
        stack: 'Next.js + DeepSeek/Claude + Supabase · Cloudflare R2',
      },
      {
        heading: 'Mobile-ready PWAs & software tools',
        items: [
          'Social, fitness, food delivery, chat, event apps',
          'Invoice generators, expense trackers, API testers, link shorteners',
        ],
        stack: 'Next.js PWA + Supabase Realtime · Vercel · Cloudflare',
      },
    ],
  },
  {
    id: 'part-2',
    title: 'Part 2: Integrations',
    sections: [
      {
        heading: 'Automatic (zero effort)',
        items: [
          'Supabase — database, auth, realtime, storage',
          'Vercel — frontend deployment',
          'Cloudflare — CDN, DNS, SSL, R2 storage',
          'Paddle — payments (PK/IN friendly)',
          'Brevo — email · GitHub — code repository',
        ],
        stack: 'Click Connect → Authorize → auto-configured',
      },
      {
        heading: 'Optional (technical users)',
        items: ['Stripe', 'PayPal', 'Fly.io', 'Railway', 'Discord', 'Slack', 'Google Analytics', 'Custom webhooks'],
        stack: 'Coming soon — or add custom API keys in vault',
      },
    ],
  },
  {
    id: 'part-3',
    title: 'Part 3: Automatic API key management',
    sections: [
      {
        heading: 'How it works',
        items: [
          'User connects integration → OAuth or API key',
          'Keys encrypted with AES-256-GCM in vault',
          'Referenced as environment variables in generated code',
          'Injected at deploy time — never in logs or source',
        ],
        stack: 'Vault password required to view/copy custom keys',
      },
    ],
  },
  {
    id: 'part-4',
    title: 'Part 4: Code generation',
    sections: [
      {
        heading: 'Every project includes',
        items: [
          'Frontend: Next.js + Tailwind (Claude Sonnet for UI)',
          'Backend: Supabase Edge Functions (DeepSeek Pro)',
          'Database: PostgreSQL schema + RLS (DeepSeek Pro)',
          'Auth: Supabase Auth · Payments: Paddle/Stripe',
          'Deploy: Vercel + Cloudflare · GitHub repo + README',
        ],
        stack: 'Full SaaS folder structure on GitHub',
      },
    ],
  },
  {
    id: 'part-5',
    title: 'Part 5: Non-technical user journey',
    sections: [
      {
        heading: 'Describe → Connect → Live',
        items: [
          'Describe what you want in chat',
          'Connect required services (one-click each)',
          'Xroga generates, deploys, and shows live preview',
          'Never touch API keys, DNS, SSL, or terminal',
        ],
        stack: 'Minutes to live app',
      },
    ],
  },
  {
    id: 'part-6',
    title: 'Part 6: Technical user extras',
    sections: [
      {
        heading: 'Advanced control',
        items: [
          'Custom integrations & API keys',
          'Webhooks · Environment variables',
          'GitHub full repo access · Custom domains',
          'Advanced deployment (Fly.io, Railway)',
        ],
        stack: 'Same AI + more flexibility',
      },
    ],
  },
  {
    id: 'part-7',
    title: 'Part 7: Security model',
    sections: [
      {
        heading: 'Encryption layers',
        items: [
          'TLS 1.3 in transit',
          'AES-256-GCM vault for API keys',
          'Keys injected at runtime only',
          'Redacted logs — keys never exposed',
        ],
        stack: 'Enterprise-grade key management',
      },
    ],
  },
  {
    id: 'part-8',
    title: 'Part 8: Auto-deployment pipeline',
    sections: [
      {
        heading: 'Automatic flow',
        items: [
          'Create GitHub repository & push code',
          'Create Vercel project & inject env vars',
          'Deploy frontend + API routes',
          'Configure Cloudflare CDN + SSL',
          'Assign live URL — no manual Deploy button',
        ],
        stack: 'Vercel + Cloudflare — fully automatic',
      },
    ],
  },
  {
    id: 'part-9',
    title: 'Part 9: After build dashboard',
    sections: [
      {
        heading: 'What users see',
        items: [
          'Live preview (mobile / tablet / desktop)',
          'Live deployment URL',
          'GitHub code access & file tree',
          'Project summary & full instructions',
          'Add features by telling Xroga what to change',
        ],
        stack: 'Preview · Code · Summary · Instructions tabs',
      },
    ],
  },
];

export const MODEL_TABLE = [
  {
    name: 'DeepSeek Flash',
    role: 'Workhorse',
    usage: '34% in · 38% out',
    tokens7M: '2.5M',
    tasks: 'Bulk code, file reads, fixes',
    cost: '$0.14 in / $0.28 out per 1M',
  },
  {
    name: 'DeepSeek Pro',
    role: 'Brain',
    usage: '30% in · 28% out',
    tokens7M: '2.2M',
    tasks: 'Architecture, plan review, repo analysis, updates',
    cost: '$0.435 in / $0.87 out per 1M',
  },
  {
    name: 'Grok 4 Reasoning',
    role: 'Strategist',
    usage: '18% in · 16% out',
    tokens7M: '1.1M',
    tasks: 'Strategy, web research synthesis, hackathon QA',
    cost: '$0.20 in / $0.50 out per 1M',
  },
  {
    name: 'Claude Sonnet 5',
    role: 'Designer',
    usage: '14% in · 14% out',
    tokens7M: '980K',
    tasks: 'UI polish — $5/mo Claude budget cap; falls back to Grok/DeepSeek',
    cost: '$2 in / $10 out per 1M (intro thru Aug 2026)',
  },
  {
    name: 'Claude Opus',
    role: 'Quality gate',
    usage: '4% in · 4% out',
    tokens7M: '280K',
    tasks: 'Crypto final QA only (minimal)',
    cost: '$5 in / $25 out per 1M',
  },
  {
    name: 'Web search (Tavily + SearXNG)',
    role: 'Research',
    usage: 'External API',
    tokens7M: '—',
    tasks: 'Phase 0 — requirements, UI trends, hackathon intel',
    cost: '~$0.016/build',
  },
] as const;

/** 7M = 4.7M input + 2.3M output */
export const QUOTA_7M_BREAKDOWN = {
  inputPool: '4.7M',
  outputPool: '2.3M',
  total: '7M',
  oneBuildApiUsd: '~$0.22–0.26',
  full7mLlmUsd: '~$7–8',
  models: MODEL_TABLE.filter((m) => !m.name.startsWith('Web search')).map((m) => ({
    model: m.name,
    share: m.usage,
    tokens: m.tokens7M,
  })),
  webSearchPipeline: 'engine Phase 0 → webSearch.ts (SearXNG + Tavily) → Grok synthesis',
};

export const BUILD_STEPS = [
  'Phase 0 — Web research (SearXNG + Tavily) + Grok synthesis',
  'Planning (DeepSeek Pro + Grok 4 strategy)',
  'GitHub repo analysis + bulk code (DeepSeek Flash)',
  'UI polish (Claude Sonnet 5)',
  'QA — Grok hackathon / Opus crypto only / Pro otherwise',
  'Auto-deploy to Vercel + GitHub push',
  'Live preview, GitHub Projects continue',
];

export const NO_HESITATE = [
  { ask: 'Can you build a website?', answer: 'YES — any website' },
  { ask: 'Can you build a SaaS?', answer: 'YES — any SaaS' },
  { ask: 'Can you build an AI tool?', answer: 'YES — any AI tool' },
  { ask: 'Can you build anything?', answer: 'YES — ANYTHING. No hesitation.' },
];
