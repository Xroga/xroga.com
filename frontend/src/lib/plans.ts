export type PlanTier = 'spark' | 'pulse' | 'nova' | 'zenith' | 'singularity';

export interface GalacticPlan {
  tier: PlanTier;
  name: string;
  priceLabel: string;
  actionsLabel: string;
  actions: number;
  concurrency: number;
  highlight?: boolean;
  tagline?: string;
}

export const GALACTIC_PLANS: GalacticPlan[] = [
  {
    tier: 'spark',
    name: 'Spark',
    priceLabel: '$19',
    actionsLabel: '1,500 Actions/mo',
    actions: 1500,
    concurrency: 2,
    tagline: 'Solo builders & side projects',
  },
  {
    tier: 'pulse',
    name: 'Pulse',
    priceLabel: '$29',
    actionsLabel: '5,000 Actions/mo',
    actions: 5000,
    concurrency: 8,
    highlight: true,
    tagline: 'Most popular — daily swarm power',
  },
  {
    tier: 'nova',
    name: 'Nova',
    priceLabel: '$49',
    actionsLabel: '10,000 Actions/mo',
    actions: 10000,
    concurrency: 12,
    tagline: 'Teams shipping every week',
  },
  {
    tier: 'zenith',
    name: 'Zenith',
    priceLabel: '$99',
    actionsLabel: '6,000 Actions/mo',
    actions: 6000,
    concurrency: 30,
    tagline: 'High concurrency & priority',
  },
  {
    tier: 'singularity',
    name: 'Singularity',
    priceLabel: '$999',
    actionsLabel: '50,000 Actions/mo',
    actions: 50000,
    concurrency: 100,
    tagline: 'Enterprise-scale swarm',
  },
];

export const COMING_SOON_PLANS = [
  { name: 'Micro', price: '$6', label: 'Coming soon' },
  { name: 'Lite', price: '$9', label: 'Coming soon' },
  { name: 'Essential', price: '$10', label: 'Coming soon' },
];

export const FREE_TRIAL_ACTIONS = 50;

export { LOGO_URL, DESKTOP_BG, MOBILE_BG } from '@/lib/theme';
