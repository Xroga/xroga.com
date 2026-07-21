/**
 * Creation intelligence — detects what the user built and suggests follow-ups.
 * Deploy is automatic (Vercel + Cloudflare) — no manual deploy chips.
 */

export type CreationType =
  | 'website'
  | 'webapp'
  | 'mobile_app'
  | 'chrome_extension'
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
    type: 'chrome_extension',
    label: 'Chrome extension',
    patterns: [
      /\b(chrome\s*extension|browser\s*extension|mv3|manifest\.json|web\s*extension)\b/i,
    ],
  },
  {
    type: 'mobile_app',
    label: 'Mobile app',
    patterns: [/\b(mobile\s*app|ios\s*app|android\s*app|react\s*native|flutter|app\s*store|testflight|expo)\b/i],
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
      /\b(automate|automation|scrape|scraping|playwright|puppeteer|workflow|cron|schedule|bot)\b/i,
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
    label: 'Desktop app',
    patterns: [/\b(desktop\s*app|electron|software|executable|installer|windows\s*app|mac\s*app)\b/i],
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
    if (/\b(chrome\s*extension|browser\s*extension|mv3)\b/.test(user)) return 'chrome_extension';
    if (/\b(electron|desktop\s*app)\b/.test(user)) return 'software';
    if (/\b(expo|mobile\s*app|android|ios\s*app)\b/.test(user)) return 'mobile_app';
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
  chrome_extension: [
    'Connect CWS credentials in Publish',
    'Add options page',
    'Tighten content-script permissions',
  ],
  game: ['Add sound effects', 'Balance difficulty', 'Add leaderboard'],
  software: ['Add GitHub Releases zip', 'Document unsigned install', 'Add settings panel'],
  api: ['Add rate limiting', 'Write API docs', 'Add monitoring'],
  video: ['Build a landing page instead', 'Ship a product site', 'Add a demo video embed'],
  image: ['Build a site that displays your assets', 'Add an uploads gallery page', 'Ship a portfolio'],
  automation: ['Add Vercel cron scaffold', 'Document agent runner limits', 'Wire webhook callbacks'],
  research: ['Add more sources', 'Create executive summary', 'Add charts'],
  chat: ['Go deeper', 'Show an example', 'Break into steps'],
  unknown: ['Refine this', 'Add more detail'],
};

const FOLLOWUP_BY_TYPE: Record<CreationType, string[]> = {
  website: ['Add a pricing section', 'Add online ordering', 'Make it responsive'],
  webapp: ['Add user login with Supabase', 'Add Lemon Squeezy payments', 'Add analytics dashboard'],
  mobile_app: ['Connect Expo in Publish', 'Add app icon & splash screen', 'Add offline mode'],
  chrome_extension: [
    'Download extension.zip and Load unpacked',
    'Add popup UI',
    'Submit to Chrome Web Store',
  ],
  game: ['Add multiplayer', 'Publish playable demo', 'Add score leaderboard'],
  software: ['Tag v1.0.0 for GitHub Releases', 'Add installer docs', 'Add user settings'],
  api: ['Add Swagger docs', 'Set up staging environment', 'Add webhook endpoints'],
  video: ['Build a marketing site', 'Embed a YouTube demo', 'Ship a waitlist page'],
  image: ['Build a portfolio site', 'Add an assets folder in the repo', 'Ship a landing page'],
  automation: ['Schedule daily cron on Vercel', 'Add Slack webhook docs', 'Export to CSV endpoint'],
  research: ['Expand bibliography', 'Fact-check claims', 'Export as PDF'],
  chat: [
    'Build a landing page',
    'Build a Chrome extension',
    'Build an Electron desktop app',
    'Build an Expo mobile app',
  ],
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
