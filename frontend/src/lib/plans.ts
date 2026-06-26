export type PlanTier = 'spark' | 'nova' | 'zenith' | 'singularity';

export interface GalacticPlan {
  tier: PlanTier;
  name: string;
  priceLabel: string;
  actionsLabel: string;
  actions: number;
  concurrency: number;
  highlight?: boolean;
}

export const GALACTIC_PLANS: GalacticPlan[] = [
  {
    tier: 'spark',
    name: 'Spark',
    priceLabel: '$19',
    actionsLabel: '500 Actions/mo',
    actions: 500,
    concurrency: 2,
  },
  {
    tier: 'nova',
    name: 'Nova',
    priceLabel: '$49',
    actionsLabel: '2,000 Actions/mo',
    actions: 2000,
    concurrency: 5,
    highlight: true,
  },
  {
    tier: 'zenith',
    name: 'Zenith',
    priceLabel: '$99',
    actionsLabel: '6,000 Actions/mo',
    actions: 6000,
    concurrency: 30,
  },
  {
    tier: 'singularity',
    name: 'Singularity',
    priceLabel: '$999',
    actionsLabel: '50,000 Actions/mo',
    actions: 50000,
    concurrency: 100,
  },
];

export const FREE_TRIAL_ACTIONS = 50;

export { LOGO_URL, DESKTOP_BG, MOBILE_BG } from '@/lib/theme';
