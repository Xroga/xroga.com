import type { HackathonBrief, HackathonPrizeTrack, HackathonSubmissionStep } from './types.js';

export interface HackathonProfileSeed {
  id: string;
  matchPatterns: RegExp[];
  urlPatterns: RegExp[];
  brief: Omit<
    HackathonBrief,
    'sources' | 'recommendedIdeas' | 'recommendedIdea' | 'researchedAt'
  >;
}

const OKX_PRIZE_TRACKS: HackathonPrizeTrack[] = [
  { name: 'Best Product', winners: 3, prize: '$10K / $6K / $4K', criteria: 'Strongest product experience, service completeness, user value' },
  { name: 'Creative Genius', winners: 3, prize: '$10K / $6K / $4K', criteria: 'Best creativity and imagination' },
  { name: 'Revenue Rocket', winners: 3, prize: '$10K / $6K / $4K', criteria: 'Strongest qualified revenue, orders, positive reviews during campaign' },
  { name: 'Finance Copilot', winners: 3, prize: '$2,500 each', criteria: 'Top ASP in Finance category' },
  { name: 'Software Utility', winners: 3, prize: '$2,500 each', criteria: 'Top ASP in Software Services category' },
  { name: 'Lifestyle Companion', winners: 3, prize: '$2,500 each', criteria: 'Top ASP in Lifestyle category' },
  { name: 'Artistic Excellence', winners: 3, prize: '$2,500 each', criteria: 'Top ASP in Art Creation category' },
  { name: 'Social Buzz', winners: 10, prize: '$1,000 each', criteria: 'Strongest social traction and community reach' },
];

const OKX_SUBMISSION: HackathonSubmissionStep[] = [
  {
    order: 1,
    label: 'Build ASP',
    detail: 'Agent Service Provider with a clear real-world use case. Crypto and non-crypto both welcome.',
    required: true,
  },
  {
    order: 2,
    label: 'List on OKX.AI',
    detail: 'Submit ASP for marketplace listing. Must pass OKX review and go live — unlisted = ineligible.',
    required: true,
  },
  {
    order: 3,
    label: 'X participation post',
    detail: 'Post on X with #OKXAI — introduce ASP, explain use case, include ≤90s demo walkthrough.',
    required: true,
  },
  {
    order: 4,
    label: 'Google form',
    detail: 'Submit form before Jul 17, 2026 23:59 UTC with ASP details + X post link.',
    required: true,
  },
];

export const HACKATHON_PROFILES: HackathonProfileSeed[] = [
  {
    id: 'okx-build-x-series',
    matchPatterns: [
      /\b(okx\.?ai|okx\s*ai|build\s*x\s*series|x\s*layer|genesis\s*hackathon|asp\b|agent\s*service\s*provider)\b/i,
      /\b(okx)\b.*\b(hackathon|hack)\b/i,
    ],
    urlPatterns: [/web3\.okx\.com\/xlayer\/build-x-series/i, /okx\.ai/i],
    brief: {
      id: 'okx-build-x-series',
      name: 'OKX.AI Genesis Hackathon — Build X Series',
      sponsor: 'OKX / X Layer',
      ecosystem: 'OKX.AI marketplace + X Layer onchain infrastructure',
      deadline: '2026-07-17T23:59:00Z',
      prizePool: '$100,000 USDT',
      registrationUrl: 'https://web3.okx.com/xlayer/build-x-series',
      listingUrl: 'https://okx.ai',
      productType: 'ASP (Agent Service Provider) — monetizable AI agent/workflow service',
      cryptoRequired: false,
      summary:
        'Launch campaign to onboard high-quality ASPs on OKX.AI. Turn expertise, workflows, tools, data, or services into practical agent-native products users can discover and pay for.',
      judgingCriteria: [
        'Product quality and completeness',
        'Use case strength and real user value',
        'Marketplace fit on OKX.AI',
        'Innovation — novel but practical',
        'Reliability and polish',
        'Long-term potential',
        'Social traction (#OKXAI post)',
      ],
      prizeTracks: OKX_PRIZE_TRACKS,
      submissionSteps: OKX_SUBMISSION,
      sponsorGaps: [
        'First-wave ASP inventory — OKX needs diverse, listable agent services not generic chat wrappers',
        'Monetizable workflows (Finance Copilot, Software Utility, Lifestyle) with clear pay-per-use or subscription',
        'Agent-native UX: task input → agent executes workflow → deliverable output (not static landing pages)',
        'Demo-ready 90-second story: problem → agent action → result → how to list on OKX.AI',
        'Optional X Layer hooks (payments, identity) where they strengthen the ASP — not required for non-crypto ASPs',
        'Revenue Rocket track needs real orders/reviews during campaign — design pricing from day one',
      ],
      rejectReasons: [
        'Idea is old — generic DeFi dashboard, basic chatbot, copy-paste SaaS with no agent workflow',
        'Too advanced but wrong fit — impressive tech that OKX marketplace cannot list or monetize',
        'Does not complete sponsor missing piece — pretty UI with no ASP service model',
        'Fails listing review — incomplete product, no clear use case, or cannot go live on OKX.AI',
        'Ignores submission checklist — no #OKXAI post, no form, or ASP not listed',
      ],
      innovationSweetSpot:
        'Pick a specific professional workflow OKX.AI lacks today. Wrap it as an ASP with agent steps, clear pricing, and a 90s demo. Novel angle + marketplace-ready — not a science project, not a 2023 template.',
    },
  },
  {
    id: 'generic-web3-hackathon',
    matchPatterns: [
      /\b(hackathon|hack\s*athon|devpost|ethglobal|buidl|buildathon|demo\s*day)\b/i,
    ],
    urlPatterns: [/devpost\.com/i, /ethglobal/i],
    brief: {
      id: 'generic-web3-hackathon',
      name: 'Web3 / Builder Hackathon',
      sponsor: 'Event sponsor (infer from page)',
      ecosystem: 'Sponsor toolchain',
      productType: 'Demo-ready product matching sponsor judging criteria',
      cryptoRequired: false,
      summary: 'Build a complete, judge-ready product that fills a sponsor gap — not a generic clone.',
      judgingCriteria: [
        'Working demo',
        'Innovation within sponsor scope',
        'Technical execution',
        'User experience',
        'Presentation and documentation',
      ],
      prizeTracks: [],
      submissionSteps: [
        { order: 1, label: 'Read official rules', detail: 'Parse prize tracks, deadlines, and required integrations.', required: true },
        { order: 2, label: 'Build MVP', detail: 'Complete core flow judges can try in under 3 minutes.', required: true },
        { order: 3, label: 'Submit', detail: 'Follow exact submission format (video, repo, form).', required: true },
      ],
      sponsorGaps: ['Identify what the sponsor sells — build the missing piece in their ecosystem'],
      rejectReasons: [
        'Old idea recycled from past hackathons',
        'Impressive but irrelevant to sponsor requirements',
        'Incomplete demo or missing mandatory integrations',
      ],
      innovationSweetSpot:
        'One sharp workflow that uses sponsor APIs/platform in a way judges have not seen — complete, not experimental.',
    },
  },
];

export function matchHackathonProfile(text: string, urls: string[]): HackathonProfileSeed | null {
  for (const profile of HACKATHON_PROFILES) {
    if (profile.matchPatterns.some((p) => p.test(text))) return profile;
    if (urls.some((u) => profile.urlPatterns.some((p) => p.test(u)))) return profile;
  }
  if (/\b(hackathon|hack\s*athon|build\s*x|asp\b|devpost)\b/i.test(text)) {
    return HACKATHON_PROFILES[HACKATHON_PROFILES.length - 1]!;
  }
  return null;
}
