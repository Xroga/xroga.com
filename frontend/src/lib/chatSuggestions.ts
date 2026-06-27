import { QUICK_ACTIONS } from './quickActions';

export interface ChatSuggestion {
  id: string;
  kind: 'idea' | 'sentence' | 'word';
  label: string;
  text: string;
  color: string;
}

const TYPO_MAP: Record<string, string> = {
  buidl: 'build',
  bild: 'build',
  websit: 'website',
  webstie: 'website',
  automtion: 'automation',
  automations: 'automation',
  deplo: 'deploy',
  deply: 'deploy',
  intergration: 'integration',
  intergrations: 'integrations',
  gam: 'game',
  movei: 'movie',
  moive: 'movie',
  reserch: 'research',
  serach: 'search',
  serch: 'search',
  debg: 'debug',
  debbug: 'debug',
  imge: 'image',
  iamge: 'image',
  vidoe: 'video',
  andriod: 'android',
  ios: 'iOS',
  api: 'API',
  saas: 'SaaS',
  tehm: 'them',
  thier: 'their',
  recieve: 'receive',
  occure: 'occur',
};

const IDEA_STARTERS = [
  'Build a SaaS dashboard with auth and billing',
  'Create a 2D platformer with pixel art',
  'Automate my daily social media posts',
  'Design a landing page for my startup',
  'Debug this React component and fix errors',
  'Research competitors and write a summary',
  'Generate product images for my store',
  'Write a short film script with storyboard',
];

const SENTENCE_TEMPLATES = [
  'Build {topic} with modern UI and deploy to production',
  'Automate {topic} workflow end-to-end',
  'Create {topic} with tests and documentation',
  'Research {topic} and summarize key findings',
  'Fix bugs in {topic} and optimize performance',
];

const KEYWORD_MAP: Record<string, string[]> = {
  'build-app': ['app', 'build', 'saas', 'dashboard', 'api'],
  'make-movie': ['movie', 'film', 'cinematic', 'video', 'trailer'],
  automate: ['automate', 'workflow', 'cron', 'bot', 'scrape'],
  games: ['game', '3d', '2d', 'unity', 'godot', 'play'],
  website: ['website', 'web', 'landing', 'portfolio', 'shop'],
  media: ['image', 'photo', 'video', 'thumbnail', 'graphic'],
  movies: ['drama', 'script', 'screenplay', 'series', 'episode'],
  debug: ['debug', 'fix', 'error', 'bug', 'crash', 'broken'],
  research: ['research', 'search', 'find', 'summarize', 'analyze'],
  '3d-models': ['model', '3d', 'blender', 'mesh', 'asset'],
  voice: ['voice', 'tts', 'speech', 'audio', 'clone'],
  'mobile-games': ['android', 'ios', 'mobile', 'app store', 'flutter'],
};

function scoreAction(actionId: string, query: string): number {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const keys = KEYWORD_MAP[actionId] ?? [];
  let score = 0;
  for (const w of words) {
    if (keys.some((k) => k.includes(w) || w.includes(k))) score += 3;
  }
  return score;
}

/** Lightweight autocorrect for common builder typos */
export function autocorrectText(input: string): string {
  return input
    .split(/(\s+)/)
    .map((token) => {
      if (!token.trim()) return token;
      const lower = token.toLowerCase();
      const fix = TYPO_MAP[lower];
      if (!fix) return token;
      const capped = token[0] === token[0].toUpperCase();
      return capped ? fix.charAt(0).toUpperCase() + fix.slice(1) : fix;
    })
    .join('');
}

export function getChatSuggestions(prompt: string, limit = 6): ChatSuggestion[] {
  const q = prompt.trim();
  const lower = q.toLowerCase();
  const lastWord = q.split(/\s+/).pop()?.toLowerCase() ?? '';
  const results: ChatSuggestion[] = [];

  if (q.length < 1) {
    return QUICK_ACTIONS.slice(0, 4).map((a) => ({
      id: `idea-${a.id}`,
      kind: 'idea' as const,
      label: a.label,
      text: a.prompt,
      color: a.color,
    }));
  }

  // Word completions matching last typed fragment
  const wordPool = ['build', 'deploy', 'automate', 'website', 'game', 'movie', 'API', 'integration', 'debug', 'research'];
  for (const w of wordPool) {
    if (w.toLowerCase().startsWith(lastWord) && w.toLowerCase() !== lastWord && lastWord.length >= 2) {
      const prefix = q.slice(0, q.length - lastWord.length);
      results.push({
        id: `word-${w}`,
        kind: 'word',
        label: 'Complete',
        text: prefix + w,
        color: '#4a7aff',
      });
    }
  }

  // Sentence suggestions from templates
  const topic = q.length > 3 ? q : 'my project';
  for (const tpl of SENTENCE_TEMPLATES) {
    if (results.length >= limit) break;
    const text = tpl.replace('{topic}', topic);
    if (!lower.includes(text.toLowerCase().slice(0, 20))) {
      results.push({
        id: `sent-${tpl.slice(0, 12)}`,
        kind: 'sentence',
        label: 'Try',
        text,
        color: '#06b6d4',
      });
    }
  }

  // Idea suggestions from quick actions + starters
  const ranked = QUICK_ACTIONS.map((a) => ({ action: a, score: scoreAction(a.id, q) }))
    .sort((a, b) => b.score - a.score);
  const pool = ranked.some((x) => x.score > 0) ? ranked.filter((x) => x.score > 0).map((x) => x.action) : QUICK_ACTIONS;
  const tail = q.endsWith(':') || q.endsWith(' ') ? '' : ` ${q}`;

  for (const a of pool.slice(0, 3)) {
    results.push({
      id: `idea-${a.id}`,
      kind: 'idea',
      label: a.label,
      text: a.prompt + tail,
      color: a.color,
    });
  }

  for (const idea of IDEA_STARTERS) {
    if (results.length >= limit) break;
    if (idea.toLowerCase().includes(lastWord) || lower.split(' ').some((w) => idea.toLowerCase().includes(w))) {
      results.push({
        id: `idea-${idea.slice(0, 16)}`,
        kind: 'idea',
        label: 'Idea',
        text: idea,
        color: '#a855f7',
      });
    }
  }

  const seen = new Set<string>();
  return results.filter((r) => {
    if (seen.has(r.text)) return false;
    seen.add(r.text);
    return true;
  }).slice(0, limit);
}
