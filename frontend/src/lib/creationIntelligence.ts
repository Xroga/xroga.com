/**
 * Creation intelligence — detects what the user built and suggests
 * the right deploy platform, follow-ups, and automation actions.
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
    patterns: [/\b(mobile\s*app|ios\s*app|android\s*app|react\s*native|flutter|app\s*store|testflight)\b/i],
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
    patterns: [/\b(web\s*app|saas|dashboard|next\.?js|react\s*app|full.?stack|spa)\b/i],
  },
  {
    type: 'software',
    label: 'Software',
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

const DEPLOY_BY_TYPE: Record<CreationType, DeploySuggestion[]> = {
  website: [
    { id: 'vercel', label: 'Deploy to Vercel', platform: 'Vercel', prompt: '[Deploy] Publish my website to Vercel with production settings', accent: '#000' },
    { id: 'netlify', label: 'Deploy to Netlify', platform: 'Netlify', prompt: '[Deploy] Deploy my website to Netlify', accent: '#00c7b7' },
    { id: 'domain', label: 'Add custom domain', platform: 'DNS', prompt: '[Deploy] Connect a custom domain to my website' },
  ],
  webapp: [
    { id: 'vercel', label: 'Deploy frontend → Vercel', platform: 'Vercel', prompt: '[Deploy] Deploy my web app frontend to Vercel' },
    { id: 'fly', label: 'Deploy API → Fly.io', platform: 'Fly.io', prompt: '[Deploy] Deploy my app backend to Fly.io' },
    { id: 'github', label: 'Connect GitHub CI', platform: 'GitHub', prompt: '[Deploy] Set up GitHub Actions CI/CD for my web app' },
  ],
  mobile_app: [
    { id: 'testflight', label: 'Ship to TestFlight', platform: 'Apple', prompt: '[Launch] Build and upload my iOS app to TestFlight' },
    { id: 'playstore', label: 'Publish on Play Store', platform: 'Google Play', prompt: '[Launch] Publish my Android app to Google Play Store' },
    { id: 'expo', label: 'Expo EAS build', platform: 'Expo', prompt: '[Deploy] Create an Expo EAS production build for my mobile app' },
  ],
  game: [
    { id: 'itch', label: 'Publish on itch.io', platform: 'itch.io', prompt: '[Deploy] Publish my game to itch.io with a playable web build' },
    { id: 'webgl', label: 'Host WebGL build', platform: 'Vercel', prompt: '[Deploy] Host my WebGL game build on Vercel' },
    { id: 'steam', label: 'Prepare Steam build', platform: 'Steam', prompt: '[Launch] Package my game for Steam distribution' },
  ],
  software: [
    { id: 'github-release', label: 'GitHub Release', platform: 'GitHub', prompt: '[Deploy] Create a GitHub Release with installers for my desktop app' },
    { id: 'electron', label: 'Package Electron app', platform: 'Electron', prompt: '[Deploy] Package my Electron app for Windows and macOS' },
  ],
  api: [
    { id: 'fly', label: 'Deploy to Fly.io', platform: 'Fly.io', prompt: '[Deploy] Deploy my API to Fly.io with health checks' },
    { id: 'docker', label: 'Docker + deploy', platform: 'Docker', prompt: '[Deploy] Containerize and deploy my API to production' },
  ],
  video: [
    { id: 'export', label: 'Export final MP4', platform: 'Export', prompt: '[Export] Render and export my video as MP4' },
    { id: 'youtube', label: 'Upload to YouTube', platform: 'YouTube', prompt: '[Publish] Prepare my video for YouTube upload with title and description' },
    { id: 'stream', label: 'Stream via CDN', platform: 'Cloudflare', prompt: '[Deploy] Host my video on Cloudflare Stream for embedding' },
  ],
  image: [
    { id: 'cdn', label: 'Upload to CDN', platform: 'Cloudflare R2', prompt: '[Deploy] Upload my image assets to Cloudflare R2 CDN' },
    { id: 'social', label: 'Post to social', platform: 'Social', prompt: '[Post] Share this image to Twitter and LinkedIn' },
  ],
  automation: [
    { id: 'schedule', label: 'Schedule daily runs', platform: 'Cron', prompt: '[Automate] Schedule this browser automation to run daily' },
    { id: 'webhook', label: 'Add webhook trigger', platform: 'Webhook', prompt: '[Automate] Set up a webhook to trigger this automation' },
    { id: 'slack', label: 'Notify on Slack', platform: 'Slack', prompt: '[Automate] Send Slack notifications when this automation completes' },
  ],
  research: [
    { id: 'pdf', label: 'Export as PDF', platform: 'PDF', prompt: '[Export] Export my research report as a polished PDF' },
    { id: 'notion', label: 'Sync to Notion', platform: 'Notion', prompt: '[Export] Sync this research to my Notion workspace' },
  ],
  chat: [],
  unknown: [
    { id: 'vercel', label: 'Deploy to Vercel', platform: 'Vercel', prompt: '[Deploy] Deploy my project to Vercel' },
  ],
};

const REFINE_BY_TYPE: Record<CreationType, string[]> = {
  website: ['Add contact form', 'Improve mobile layout', 'Add SEO meta tags'],
  webapp: ['Add authentication', 'Connect database', 'Optimize performance'],
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
  website: ['Make it responsive', 'Add a pricing section'],
  webapp: ['Add user login', 'Deploy staging preview'],
  mobile_app: ['Build for both platforms', 'Add app icon & splash'],
  game: ['Add multiplayer', 'Publish demo build'],
  software: ['Windows + Mac builds', 'Add installer'],
  api: ['Add Swagger docs', 'Set up staging'],
  video: ['Create storyboard', 'Add voiceover'],
  image: ['Generate 4 variations', 'Remove background'],
  automation: ['Test on live site', 'Run every hour'],
  research: ['Expand bibliography', 'Fact-check claims'],
  chat: ['Build a landing page', 'Help me write code'],
  unknown: ['Tell me more', 'What are next steps?'],
};

export function analyzeCreation(userText: string, aiText: string): CreationSuggestions {
  const creationType = detectCreationType(userText, aiText);
  const creationLabel = getLabel(creationType);
  const deploy = DEPLOY_BY_TYPE[creationType] ?? [];
  const refine = REFINE_BY_TYPE[creationType] ?? [];
  const followUps = FOLLOWUP_BY_TYPE[creationType] ?? [];

  return {
    creationType,
    creationLabel,
    followUps: followUps.slice(0, 3),
    deploy: deploy.slice(0, 3),
    refine: refine.slice(0, 3),
  };
}

export function hasDeployableCreation(userText: string, aiText: string): boolean {
  const type = detectCreationType(userText, aiText);
  return type !== 'chat' && type !== 'unknown' && DEPLOY_BY_TYPE[type].length > 0;
}

export function primaryDeploySuggestion(userText: string, aiText: string): DeploySuggestion | null {
  const { deploy } = analyzeCreation(userText, aiText);
  return deploy[0] ?? null;
}
