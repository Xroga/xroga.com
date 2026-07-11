/**
 * Creation intelligence — detects what the user built and suggests follow-ups.
 * Deploy is automatic (Vercel + Cloudflare) — no manual deploy chips.
 */

export type CreationType =
  | 'website'
  | 'webapp'
  | 'mobile_app'
  | 'game'
  | 'software'
  | 'api'
  | 'video'
  | 'image'
  | 'automation'
  | 'research'
  | 'chat'
  | 'unknown';

export interface DeploySuggestion {
  id: string;
  label: string;
  platform: string;
  prompt: string;
  accent?: string;
}

export interface CreationSuggestions {
  creationType: CreationType;
  creationLabel: string;
  followUps: string[];
  deploy: DeploySuggestion[];
  refine: string[];
}

const TYPE_PATTERNS: Array<{ type: CreationType; label: string; patterns: RegExp[] }> = [
  {
    type: 'game',
    label: 'Game',
    patterns: [
      /\b(game|unity|godot|unreal|phaser|webgl|itch\.?io|steam|2d\s*game|3d\s*game|platformer|rpg)\b/i,
    ],
  },
  {
    type: 'mobile_app',
    label: 'Mobile app',
    patterns: [/\b(mobile\s*app|ios\s*app|android\s*app|react\s*native|flutter|app\s*store|testflight|pwa)\b/i],
  },
  {
    type: 'video',
    label: 'Video',
    patterns: [/\b(video|movie|trailer|clip|animation|mp4|youtube|render|footage|cinematic)\b/i],
  },
  {
    type: 'image',
    label: 'Image',
    patterns: [/\b(image|logo|illustration|artwork|poster|thumbnail|png|svg|graphic|design)\b/i],
  },
  {
    type: 'automation',
    label: 'Automation',
    patterns: [
      /\b(automate|automation|scrape|scraping|playwright|puppeteer|browser|workflow|cron|schedule|bot)\b/i,
    ],
  },
  {
    type: 'api',
    label: 'API / Backend',
    patterns: [/\b(api|backend|rest|graphql|express|fastapi|server|endpoint|microservice|fly\.io)\b/i],
  },
  {
    type: 'website',
    label: 'Website',
    patterns: [/\b(landing\s*page|website|web\s*page|homepage|marketing\s*site|portfolio)\b/i],
  },
  {
    type: 'webapp',
    label: 'Web app',
    patterns: [/\b(web\s*app|saas|dashboard|next\.?js|react\s*app|full.?stack|spa|crm)\b/i],
  },
  {
    type: 'software',
    label: 'Software',
    patterns: [/\b(desktop\s*app|electron|software|executable|installer|windows\s*app|mac\s*app|tool)\b/i],
  },
  {
    type: 'research',
    label: 'Research',
    patterns: [/\b(research|report|analysis|whitepaper|study|survey|pdf\s*report)\b/i],
  },
];

export function detectCreationType(userText: string, aiText: string): CreationType {
  const user = userText.toLowerCase();
  if (/\b(build|create|make|design)\b/.test(user)) {
    if (/\b(website|web\s*page|landing|site|coffee|shop|restaurant|store)\b/.test(user)) {
      return 'website';
    }
    if (/\b(web\s*app|saas|dashboard|next\.?js|react\s*app)\b/.test(user)) return 'webapp';
    if (/\b(game|unity|godot)\b/.test(user)) return 'game';
    if (/\b(video|movie|clip|trailer)\b/.test(user) && !/\bwebsite\b/.test(user)) return 'video';
  }

  const combined = `${userText} ${aiText}`.toLowerCase();
  for (const { type, patterns } of TYPE_PATTERNS) {
    if (patterns.some((p) => p.test(combined))) return type;
  }
  if (/\b(build|create|make|generate)\b/i.test(userText)) return 'website';
  return 'chat';
}

function getLabel(type: CreationType): string {
  return TYPE_PATTERNS.find((t) => t.type === type)?.label ?? 'Project';
}

const REFINE_BY_TYPE: Record<CreationType, string[]> = {
  website: ['Add contact form', 'Improve mobile layout', 'Add SEO meta tags'],
  webapp: ['Add user authentication', 'Add admin dashboard', 'Connect Supabase database'],
  mobile_app: ['Add push notifications', 'Improve onboarding', 'Add dark mode'],
  game: ['Add sound effects', 'Balance difficulty', 'Add leaderboard'],
  software: ['Add auto-updater', 'Code signing', 'Add crash reporting'],
  api: ['Add rate limiting', 'Write API docs', 'Add monitoring'],
  video: ['Add subtitles', 'Shorten to 60s clip', 'Change music'],
  image: ['Upscale resolution', 'Try different style', 'Generate variations'],
  automation: ['Run in headless browser', 'Add error retry', 'Export results to CSV'],
  research: ['Add more sources', 'Create executive summary', 'Add charts'],
  chat: ['Go deeper', 'Show an example', 'Break into steps'],
  unknown: ['Refine this', 'Add more detail'],
};

const FOLLOWUP_BY_TYPE: Record<CreationType, string[]> = {
  website: ['Add a pricing section', 'Add online ordering', 'Make it responsive'],
  webapp: ['Add user login with Supabase', 'Add Paddle payments', 'Add analytics dashboard'],
  mobile_app: ['Build as PWA', 'Add app icon & splash screen', 'Add offline mode'],
  game: ['Add multiplayer', 'Publish playable demo', 'Add score leaderboard'],
  software: ['Windows + Mac builds', 'Add installer', 'Add user settings'],
  api: ['Add Swagger docs', 'Set up staging environment', 'Add webhook endpoints'],
  video: ['Create storyboard', 'Add voiceover', 'Export as GIF'],
  image: ['Generate 4 variations', 'Remove background', 'Create logo pack'],
  automation: ['Schedule daily runs', 'Add Slack notifications', 'Export to CSV'],
  research: ['Expand bibliography', 'Fact-check claims', 'Export as PDF'],
  chat: ['Build a landing page', 'Build a SaaS app', 'Generate an image'],
  unknown: ['Add another feature', 'Improve the design', 'Tell me next steps'],
};

export function analyzeCreation(userText: string, aiText: string): CreationSuggestions {
  const creationType = detectCreationType(userText, aiText);
  const creationLabel = getLabel(creationType);
  const refine = REFINE_BY_TYPE[creationType] ?? [];
  const followUps = FOLLOWUP_BY_TYPE[creationType] ?? [];

  return {
    creationType,
    creationLabel,
    followUps: followUps.slice(0, 4),
    deploy: [],
    refine: refine.slice(0, 3),
  };
}

export function hasDeployableCreation(userText?: string, aiText?: string): boolean {
  void userText;
  void aiText;
  return false;
}

export function primaryDeploySuggestion(userText?: string, aiText?: string): DeploySuggestion | null {
  void userText;
  void aiText;
  return null;
}
