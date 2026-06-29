import type { TaskType } from './index.js';

export type FeatureCategory =
  | 'chat'
  | 'landing_page'
  | 'image_generation'
  | 'browser_automation'
  | 'cross_post'
  | 'key_creation'
  | 'video_studio'
  | 'deep_research'
  | 'content_blocker'
  | 'job_hunter'
  | 'code_debug';

export interface FeatureRoute {
  category: FeatureCategory;
  taskType: TaskType;
  actionCost: number;
  confidence: number;
  reasoning: string;
  featureId?: string;
  agent?: string;
  systemPrompt?: string;
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
  provider: 'agnes' | 'fal' | 'replicate' | 'cloudflare';
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

export interface VideoStudioOutput {
  type: 'video_studio';
  title: string;
  streamingUrl: string;
  durationSeconds: number;
  actionCost: number;
  screenplay: {
    title: string;
    mood: string;
    scenes: Array<{ number: number; description: string; dialogue: string; durationSeconds: number }>;
  };
  selectedProvider: string;
  reviewScores: { physics: number; lighting: number; consistency: number };
  providersUsed: string[];
  audioTracks: Array<{ type: string; provider: string }>;
}

export interface DeepResearchOutput {
  type: 'deep_research';
  title: string;
  pdfUrl: string;
  sourceCount: number;
  subtopics: string[];
  factCheckIssues: number;
  bibliography: string[];
}

export interface ContentBlockerOutput {
  type: 'content_blocker';
  status: string;
  deviceId: string;
  deviceName: string;
  userId: string;
  dns: {
    provider: string;
    servers: string[];
    setupScript: string;
  };
  onnx: {
    enabled: boolean;
    modelPath: string;
    clientConfig: Record<string, unknown>;
  };
  activatedAt: string;
}

export interface JobHunterOutput {
  type: 'job_hunter';
  projectId: string;
  query: string;
  jobsFound: number;
  applicationsSubmitted: number;
  applications: Array<{
    jobTitle: string;
    company: string;
    url: string;
    submitted: boolean;
    resumeTailored: boolean;
    error?: string;
  }>;
  status: string;
}

export interface CodeDebugOutput {
  type: 'code_debug';
  filename: string;
  fixedCode: string;
  language: string;
  lineCount: number;
  defectsFound: number;
  iterations: number;
  success: boolean;
  zeroDefects: boolean;
}

export type FeatureOutput =
  | LandingPageOutput
  | ImageGenOutput
  | BrowserAutomationOutput
  | CrossPostOutput
  | KeyCreationOutput
  | VideoStudioOutput
  | DeepResearchOutput
  | ContentBlockerOutput
  | JobHunterOutput
  | CodeDebugOutput
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
  video_studio: 50,
  deep_research: 100,
  content_blocker: 1,
  job_hunter: 90,
  code_debug: 15,
};

export const FEATURE_TASK_TYPES: Record<FeatureCategory, TaskType> = {
  chat: 'chat',
  landing_page: 'website',
  image_generation: 'image',
  browser_automation: 'scrape',
  cross_post: 'chat',
  key_creation: 'chat',
  video_studio: 'video',
  deep_research: 'research',
  content_blocker: 'chat',
  job_hunter: 'scrape',
  code_debug: 'code_fix',
};
