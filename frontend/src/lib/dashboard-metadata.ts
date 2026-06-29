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
    'Dashboard',
    'Xroga AI Dashboard — terminal, AI Swarm, browser automation, and Black Hole V∞ in one workspace.',
    '/dashboard'
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
