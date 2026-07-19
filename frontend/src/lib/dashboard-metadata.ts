import type { Metadata } from 'next';
import { buildMetadata } from './seo';

const PALESTINE_KEYWORDS = ['We stand with Palestine', 'Palestine support', 'Free Palestine'];

export function dashboardPageMetadata(
  title: string,
  description: string,
  path: string,
  extraKeywords: string[] = []
): Metadata {
  return buildMetadata({
    title,
    description,
    path,
    keywords: [...extraKeywords, ...PALESTINE_KEYWORDS, 'Xroga dashboard', 'Xroga AI workspace'],
  });
}

export const PAGE_SEO = {
  dashboard: dashboardPageMetadata(
    'Workspace — #1 Coding Agent',
    'Xroga AI Workspace: the #1 coding agent for developers and non-developers. Build web apps from a prompt, push working code to your GitHub, deploy on your Vercel, sync API keys securely into Vercel env, and update the same repo (edit/delete) without starting over. No coding knowledge required to start.',
    '/workspace',
    [
      'Xroga workspace',
      'AI coding agent workspace',
      'build website no code',
      'GitHub Vercel AI workspace',
      'update GitHub repo AI',
    ]
  ),
  dashboardHome: dashboardPageMetadata(
    'Dashboard',
    'Token usage, XRG balance, billing, and recent activity for your Xroga AI account.',
    '/dashboard',
    ['Xroga tokens', 'XRG balance', 'usage dashboard']
  ),
  terminalHistory: dashboardPageMetadata(
    'Terminal History',
    'All saved workspace chats, code projects, and business conversations — restore any session in the terminal.',
    '/dashboard/history',
    ['terminal history', 'saved chats', 'code projects']
  ),
  tasks: dashboardPageMetadata(
    'Earn XRG',
    'Complete daily, weekly, and monthly tasks to earn XRG tokens and boost your monthly quota.',
    '/dashboard/tasks',
    ['Xroga tasks', 'earn tokens', 'XRG rewards']
  ),
  referrals: dashboardPageMetadata(
    'Refer & Earn',
    'Share your referral link — both earn 250K AI tokens + 5,000 XRG instantly when friends subscribe.',
    '/dashboard/referrals',
    ['Xroga referral', 'refer and earn', 'XRG referral']
  ),
  community: dashboardPageMetadata(
    'Community',
    'Community Pool, live marketplace, auto token distribution, and referrals.',
    '/dashboard/community',
    ['Xroga community', 'community pool', 'token requests', 'marketplace']
  ),
  influencer: dashboardPageMetadata(
    'Influencer Program',
    'Earn 2–10% commission on subscription revenue plus higher AI and XRG token bonuses for every referral.',
    '/dashboard/influencer',
    ['Xroga influencer', 'creator program', 'referral commission']
  ),
  projects: dashboardPageMetadata(
    'My Projects',
    'Manage websites, web apps, and games you built with Xroga AI — linked to your GitHub repos and Vercel deploys.',
    '/dashboard/projects',
    ['Xroga projects', 'AI built web apps', 'GitHub projects AI']
  ),
  chats: dashboardPageMetadata(
    'Chats & Reports',
    'Conversations, reports, research, and coding-agent history — continue any build from Xroga AI Workspace.',
    '/dashboard/chats',
    ['Xroga chats', 'AI coding agent history']
  ),
  automation: dashboardPageMetadata(
    'Build Runs',
    'Build run history for Xroga AI coding agent — continue Workspace builds, GitHub pushes, and Vercel deploys.',
    '/dashboard/automation',
    ['Xroga build runs', 'coding agent history']
  ),
  analytics: dashboardPageMetadata(
    'Analytics',
    'Usage stats and build analytics for your Xroga AI coding agent account.',
    '/dashboard/analytics'
  ),
  integrations: dashboardPageMetadata(
    'Integrations',
    'Connect GitHub and Vercel to Xroga AI Workspace. Sync product API keys securely into Vercel env.',
    '/dashboard/integrations',
    ['Xroga integrations', 'GitHub AI', 'Vercel AI', 'sync API keys']
  ),
  publish: dashboardPageMetadata(
    'Publish',
    'Publish on your accounts: GitHub + Vercel for web, Expo/EAS for Android and iOS. Store fees are yours — Xroga never pays App Store or Play Store for you.',
    '/dashboard/publish',
    ['publish app', 'Expo EAS', 'Vercel deploy', 'App Store guide', 'Play Store guide']
  ),
  billing: dashboardPageMetadata(
    'Billing',
    'Plans, invoices, action spend, pause or cancel subscription, and top-ups for Xroga AI.',
    '/dashboard/billing',
    ['Xroga billing', 'action fuel', 'pause subscription']
  ),
  media: dashboardPageMetadata(
    'AI Media',
    'Images and audio generated or uploaded in your Xroga AI media library.',
    '/dashboard/media',
    ['Xroga AI media', 'AI images']
  ),
  settings: dashboardPageMetadata(
    'Settings',
    'Theme, terminal skin, account, privacy, Plan & Billing, and preferences for Xroga AI.',
    '/settings'
  ),
} as const;
