import type { TaskType } from './index.js';

export type FeatureCategory =
  | 'chat'
  | 'landing_page'
  | 'image_generation'
  | 'browser_automation'
  | 'cross_post'
  | 'key_creation';

export interface FeatureRoute {
  category: FeatureCategory;
  taskType: TaskType;
  actionCost: number;
  confidence: number;
  reasoning: string;
}

export interface LandingPageOutput {
  type: 'landing_page';
  html: string;
  css: string;
  js: string;
  heroImageUrl: string;
  deployUrl: string;
  vercelDeploymentId?: string;
}

export interface ImageGenOutput {
  type: 'image';
  imageUrl: string;
  provider: 'replicate' | 'cloudflare';
  prompt: string;
}

export interface BrowserAutomationOutput {
  type: 'browser_automation';
  screenshotUrl?: string;
  scrapedData?: Record<string, unknown>;
  script: string;
  pagesProcessed: number;
}

export interface CrossPostOutput {
  type: 'cross_post';
  platforms: Array<{
    platform: 'twitter' | 'linkedin' | 'instagram' | 'facebook';
    success: boolean;
    postId?: string;
    formattedContent: string;
    error?: string;
  }>;
}

export interface KeyCreationOutput {
  type: 'key_creation';
  service: string;
  success: boolean;
  integrationId?: string;
  message: string;
}

export type FeatureOutput =
  | LandingPageOutput
  | ImageGenOutput
  | BrowserAutomationOutput
  | CrossPostOutput
  | KeyCreationOutput
  | { type: 'chat'; content: string };

export interface SwarmProgressEvent {
  runId: string;
  agent: string;
  status: string;
  message: string;
  iteration?: number;
  timestamp: string;
}

export const FEATURE_ACTION_COSTS: Record<FeatureCategory, number> = {
  chat: 1,
  landing_page: 25,
  image_generation: 4,
  browser_automation: 5,
  cross_post: 1,
  key_creation: 5,
};

export const FEATURE_TASK_TYPES: Record<FeatureCategory, TaskType> = {
  chat: 'chat',
  landing_page: 'website',
  image_generation: 'image',
  browser_automation: 'scrape',
  cross_post: 'chat',
  key_creation: 'chat',
};
