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
    'Workspace',
    'Xroga AI Workspace — terminal, AI Swarm, browser automation, and Black Hole V∞.',
    '/dashboard'
  ),
  dashboardHome: dashboardPageMetadata(
    'Dashboard',
    'Token usage, XRG balance, billing, and recent activity for your Xroga AI account.',
    '/dashboard/home',
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
    'Community Pool, referrals, token distribution, and builder marketplace.',
    '/dashboard/community',
    ['Xroga community', 'community pool', 'token requests']
  ),
  projects: dashboardPageMetadata(
    'My Projects',
    'Manage websites, apps, games, software, and browser extensions built with Xroga AI Swarm.',
    '/dashboard/projects',
    ['Xroga projects', 'AI built apps']
  ),
  chats: dashboardPageMetadata(
    'Chats & Reports',
    'Conversations, reports, research, documents, and Swarm history — continue any task from Xroga AI.',
    '/dashboard/chats',
    ['Xroga chats', 'AI reports']
  ),
  automation: dashboardPageMetadata(
    'Automation',
    'Running, failed, and browser automations — continue or review past Xroga AI automation runs.',
    '/dashboard/automation'
  ),
  analytics: dashboardPageMetadata(
    'Analytics',
    'Usage stats and build analytics for your Xroga AI account and Swarm activity.',
    '/dashboard/analytics'
  ),
  integrations: dashboardPageMetadata(
    'Integrations',
    'Connect GitHub, GitLab, Slack, databases, and 710+ tools to your Xroga AI workspace.',
    '/dashboard/integrations',
    ['Xroga integrations', 'GitHub AI', 'GitLab AI']
  ),
  billing: dashboardPageMetadata(
    'Billing',
    'Plans, invoices, action spend, pause or cancel subscription, and top-ups for Xroga AI.',
    '/dashboard/billing',
    ['Xroga billing', 'action fuel', 'pause subscription']
  ),
  media: dashboardPageMetadata(
    'AI Media',
    'Images, videos, and audio generated or uploaded in your Xroga AI media library.',
    '/dashboard/media',
    ['Xroga AI media', 'AI images', 'AI video']
  ),
  settings: dashboardPageMetadata(
    'Settings',
    'Theme, terminal skin, account, privacy, Plan & Billing, and preferences for Xroga AI.',
    '/settings'
  ),
} as const;
