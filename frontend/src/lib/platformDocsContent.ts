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
          'Frontend: project-native framework and established repository patterns',
          'Backend: server routes, durable jobs, and integrations required by the outcome',
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
    name: 'Repository comprehension',
    role: 'Understand the existing project before edits',
    usage: 'Automatic',
    tokensPool: 'Relevant files only',
    tasks: 'Entry points, dependencies, tests, and existing patterns',
    cost: 'Context evidence',
  },
  {
    name: 'Implementation',
    role: 'Apply controlled project changes',
    usage: 'Automatic',
    tokensPool: 'Paced capacity',
    tasks: 'Focused code, migrations, configuration, and tests',
    cost: 'Changed-file evidence',
  },
  {
    name: 'Validation and repair',
    role: 'Verify the required outcome and repair failures',
    usage: 'Risk based',
    tokensPool: 'Protected completion capacity',
    tasks: 'Lint, tests, builds, security checks, and targeted repair',
    cost: 'Command and result evidence',
  },
  {
    name: 'Independent review',
    role: 'Review high-risk changes separately',
    usage: 'When required',
    tokensPool: 'Risk gated',
    tasks: 'Authentication, permissions, payments, secrets, and deployment',
    cost: 'Structured findings',
  },
] as const;

export const BUILD_STEPS = [
  'Inspect the current repository and infer acceptance criteria',
  'Research current information when the outcome requires it',
  'Apply focused changes to one controlled project state',
  'Run applicable validation and targeted repair',
  'Push or publish only when requested and return provider evidence',
  'Follow-up prompts update the same connected project',
];

export const NO_HESITATE = [
  { ask: 'Can you build a website?', answer: 'Xroga can implement and validate supported web projects.' },
  { ask: 'Can you build a SaaS?', answer: 'Yes when the required accounts, credentials, and product decisions are available.' },
  { ask: 'Can you build an AI tool?', answer: 'Yes through configured integrations; missing provider setup is reported exactly.' },
  { ask: 'What if publishing is blocked?', answer: 'The project stays intact and Xroga reports the exact external action required.' },
];
