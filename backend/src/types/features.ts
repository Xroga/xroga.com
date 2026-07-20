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
  /** True when deployUrl was HTTP-verified before showing to the user */
  deployVerified?: boolean;
  vercelDeploymentId?: string;
  githubRepoUrl?: string;
  githubRepoName?: string;
  /** Beginner-friendly summary card fields */
  projectName?: string;
  pages?: string[];
  features?: string[];
  designTheme?: string;
  needsPayment?: boolean;
  memoryNote?: string;
  summary?: string;
  vercelPreviewUrl?: string;
  netlifyPreviewUrl?: string;
  followUps?: string[];
  generatedFiles?: string[];
  fileCount?: number;
  /** True only after a successful GitHub push — prevents false "already pushed" skips */
  githubPushConfirmed?: boolean;
  /** Original user request for summary card */
  userPrompt?: string;
  /** True when this output is an incremental GitHub patch (not a full rebuild) */
  isUpdate?: boolean;
  /** Repo paths patched on GitHub for update builds */
  updatedFiles?: string[];
  /** Short bullets for the update turn (Plan A) */
  changesSummary?: string[];
  /** Expandable before/after diffs for the terminal file trail */
  fileTrail?: Array<{
    path: string;
    before: string;
    after: string;
    added: number;
    removed: number;
  }>;
  /** Prior file contents for one-click rollback */
  previousFiles?: Array<{ path: string; content: string }>;
  /** Tip commit SHA after push */
  commitSha?: string;
  githubBranch?: string;
  /** AI/API endpoints integrated or recommended for this build */
  integratedAi?: Array<{
    id: string;
    name: string;
    freeTier: boolean;
    requiresApiKey: boolean;
    endpoint: string;
    signupUrl?: string;
    topUpUrl?: string;
    userGuidance: string;
    xrogaProvided?: boolean;
  }>;
}

export interface ImageBlockedOutput {
  type: 'image_blocked';
  prompt: string;
  reason: 'prompt_blocked' | 'image_blocked' | 'verification_failed';
  detail?: string;
  safety: {
    title: string;
    quranArabic: string;
    quranTranslation: string;
    quranReference: string;
    guidance: string[];
    leakFallback: string;
    creativeAlternatives: string[];
  };
  followUps?: string[];
}

export interface ImageGenOutput {
  type: 'image';
  imageUrl: string;
  provider: 'agnes' | 'fal' | 'replicate' | 'cloudflare' | 'luma' | 'runway' | 'hailuo' | 'comfyui' | 'openai' | 'gemini';
  prompt: string;
  enhancedPrompt?: string;
  /** Short Groq-refined prompt shown in the UI */
  concisePrompt?: string;
  /** Text to render on thumbnails/posters */
  overlayText?: string;
  followUps?: string[];
  pros?: string[];
  cons?: string[];
  matchScore?: number;
  verified?: boolean;
  rejectedImages?: Array<{
    imageUrl: string;
    provider: string;
    matchScore: number;
    issues?: string[];
  }>;
  /** Every provider image from this prompt (winner + alternates) */
  allAttempts?: Array<{
    imageUrl: string;
    provider: string;
    matchScore: number;
    issues?: string[];
    selected?: boolean;
    scoresByVerifier?: Record<string, number>;
    variantLabel?: string;
    variantIndex?: number;
    userVoted?: boolean;
    failed?: boolean;
    blocked?: boolean;
  }>;
  variantCount?: number;
  isStyleTransfer?: boolean;
  sourceImageUrl?: string;
  aspectFormat?: '1:1' | '4:5' | '16:9' | '9:16' | '3:4' | '4:3';
  contentType?: string;
  styleVibe?: string;
  thumbnailUrl?: string;
  isYoutubeThumbnail?: boolean;
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
  sceneCount?: number;
  scriptProvider?: string;
  videoFormat?: 'shorts_reels' | 'youtube_video';
  characters?: Array<{ name: string; faceImageUrl?: string }>;
  healingSteps?: string[];
  qcScore?: number;
  omniReality?: {
    storyboardProvider?: string;
    moodTone?: string;
    continuityLocks?: string[];
    sceneCount?: number;
    trinity?: { deepseek: boolean; gemini: boolean; groq: boolean };
  };
  pros?: string[];
  cons?: string[];
  followUps?: string[];
  /** Chat image-to-video reference frame */
  sourceImageUrl?: string;
  outputFormat?: 'mp4' | 'gif';
  /** Up to 3 parallel AI renders from one prompt */
  variants?: Array<{
    streamingUrl: string;
    provider: string;
    label?: string;
  }>;
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
  | ImageBlockedOutput
  | BrowserAutomationOutput
  | CrossPostOutput
  | KeyCreationOutput
  | VideoStudioOutput
  | DeepResearchOutput
  | ContentBlockerOutput
  | JobHunterOutput
  | CodeDebugOutput
  | { type: 'chat'; content: string; webSources?: Array<{ title: string; url: string; snippet: string; source: string; thumbnailUrl?: string }>; hackathonBrief?: unknown };

export interface SwarmProgressEvent {
  runId: string;
  agent: string;
  status: string;
  message: string;
  iteration?: number;
  timestamp: string;
  imageStep?: string;
  videoStep?: string;
  omniPhase?: string;
  omniDetail?: string;
  imageAttempt?: {
    imageUrl: string;
    provider: string;
    matchScore: number;
    issues?: string[];
  };
  /** Hybrid swarm: elite council vs OSS reserve vs black hole synthesis */
  councilLayer?: 'elite' | 'reserve' | 'blackhole';
  /** 7-phase AI Swarm Logic (0–7) */
  negotiationPhase?: number;
  /** User-visible phase: 1 Discovery, 3 Build, 4 Verify, 5 Deploy (Phase 2 planning is silent) */
  userFacingPhase?: number;
  swarmLogic?: boolean;
  /** Step-by-step XROGA todo list for build UI */
  swarmTodos?: Array<{ id: string; label: string; status: 'done' | 'active' | 'pending' | 'skipped' }>;
  swarmStatusLabel?: string;
  swarmAnalysis?: string;
  /** Live branded activity line for processing animation */
  swarmActivity?: string;
  /** Stream keepalive only — not real progress (client must not reset stall timers) */
  keepalive?: boolean;
  /** Build blocked until GitHub OAuth completes */
  needsGitHub?: boolean;
  needsVercel?: boolean;
  /** Structured hackathon brief for requirement-aligned builds */
  hackathonBrief?: unknown;
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
