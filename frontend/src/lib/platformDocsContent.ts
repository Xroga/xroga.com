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
        stack: 'Next.js + Supabase + Edge Functions · Lemon Squeezy · Vercel',
      },
      {
        heading: 'AI-powered applications',
        items: [
          'Chatbots, content generators, tutors, automation',
          'Image generators, voice assistants, research tools',
        ],
        stack: 'Next.js + Black Hole V∞ swarm + Supabase · Cloudflare R2',
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
          'Lemon Squeezy — payments & subscriptions',
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
          'Frontend: Next.js + Tailwind (Black Hole V∞ Apex / Horizon)',
          'Backend: Supabase Edge Functions (Forge / Pulse)',
          'Database: PostgreSQL schema + RLS',
          'Auth: Supabase Auth · Payments: Lemon Squeezy/Stripe',
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
          'Connect GitHub + Vercel early (optional Supabase) — before long builds finish',
          'Xroga generates, deploys, and shows live preview',
          'First ship remembers sticky repo — later prompts update the same live product',
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
    name: 'Xroga Apex',
    role: 'Chief Architect',
    usage: 'Flagship core',
    tokensPool: '889K',
    tasks: 'Complex full-stack, crypto, long-horizon builds',
    cost: 'Inside Black Hole V∞',
  },
  {
    name: 'Xroga Horizon',
    role: 'Project Engineer',
    usage: 'Long-context core',
    tokensPool: '2.0M',
    tasks: 'Whole-repo engineering, large codebases',
    cost: 'Inside Black Hole V∞',
  },
  {
    name: 'Xroga Forge',
    role: 'Deep Executor',
    usage: 'Volume core',
    tokensPool: '1.5M',
    tasks: 'Agent tasks, knowledge work, shipping',
    cost: 'Inside Black Hole V∞',
  },
  {
    name: 'Xroga Pulse',
    role: 'Converter',
    usage: 'Fast core',
    tokensPool: '1.0M',
    tasks: 'Prompt → builder brief, high-volume chat',
    cost: 'Inside Black Hole V∞',
  },
  {
    name: 'Xroga Live',
    role: 'Real-Time Intel',
    usage: 'Live core',
    tokensPool: '250K',
    tasks: 'Web + X live search, news, research synthesis',
    cost: 'Inside Black Hole V∞',
  },
  {
    name: 'Xroga Lens',
    role: 'Document Mind',
    usage: 'Vision/docs core',
    tokensPool: '533K',
    tasks: 'Files, PDFs, vision, backup context',
    cost: 'Inside Black Hole V∞',
  },
] as const;

/** Spark monthly pool — matches backend MONTHLY_TOTAL_TOKENS */
export const QUOTA_SPARK_BREAKDOWN = {
  inputPool: '~3.09M',
  outputPool: '~3.09M',
  total: '6.17M',
  oneBuildApiUsd: 'varies by core',
  models: MODEL_TABLE.map((m) => ({
    model: m.name,
    share: m.usage,
    tokens: m.tokensPool,
  })),
  webSearchPipeline: 'Xroga Live (native web + X firehose) → Tavily/SearXNG fallback',
};

/** @deprecated alias — Spark is 6.17M */
export const QUOTA_7M_BREAKDOWN = QUOTA_SPARK_BREAKDOWN;

export const BUILD_STEPS = [
  'Live research — Xroga Live (web + X) when needed',
  'Convert prompt → builder brief (Pulse)',
  'Architect + generate (Apex / Horizon / Forge)',
  'QA + compile validate',
  'Push GitHub + deploy Vercel (sticky repo)',
  'Follow-up prompts update the same live product',
];

export const NO_HESITATE = [
  { ask: 'Can you build a website?', answer: 'YES — any website' },
  { ask: 'Can you build a SaaS?', answer: 'YES — any SaaS' },
  { ask: 'Can you build an AI tool?', answer: 'YES — any AI tool' },
  { ask: 'Do I wait for a new model?', answer: 'NO — Black Hole V∞ updates continuously' },
];
