export type PlanTier = 'spark' | 'pulse' | 'nova' | 'zenith' | 'singularity';

export interface GalacticPlan {
  tier: PlanTier;
  name: string;
  priceLabel: string;
  priceRange: string;
  actionsLabel: string;
  actions: number;
  concurrency: number;
  highlight?: boolean;
}

export const GALACTIC_PLANS: GalacticPlan[] = [
  {
    tier: 'spark',
    name: 'Spark',
    priceLabel: '$10',
    priceRange: '$6–$15',
    actionsLabel: '500–1,000 Actions',
    actions: 1000,
    concurrency: 2,
  },
  {
    tier: 'pulse',
    name: 'Pulse',
    priceLabel: '$29',
    priceRange: '$19–$39',
    actionsLabel: '2,000–4,000 Actions',
    actions: 3000,
    concurrency: 3,
    highlight: true,
  },
  {
    tier: 'nova',
    name: 'Nova',
    priceLabel: '$74',
    priceRange: '$49–$99',
    actionsLabel: '6,000–12,000 Actions',
    actions: 9000,
    concurrency: 5,
  },
  {
    tier: 'zenith',
    name: 'Zenith',
    priceLabel: '$199',
    priceRange: '$150–$249',
    actionsLabel: '20,000–40,000 Actions',
    actions: 30000,
    concurrency: 15,
  },
  {
    tier: 'singularity',
    name: 'Singularity',
    priceLabel: '$749',
    priceRange: '$499–$999',
    actionsLabel: '50,000–100,000 Actions',
    actions: 75000,
    concurrency: 999,
  },
];

export const FREE_TRIAL_ACTIONS = 10;

export const LOGO_URL =
  'https://i.postimg.cc/pLxrn9yP/Green-Minimalist-Summer-Big-Sale-Medium-Banner-10-removebg-preview-(1).png';
