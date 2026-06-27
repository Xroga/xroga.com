import { QUICK_ACTIONS } from './quickActions';

export interface ChatSuggestion {
  id: string;
  label: string;
  text: string;
  color: string;
}

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

export function getChatSuggestions(prompt: string, limit = 5): ChatSuggestion[] {
  const q = prompt.trim();
  if (q.length < 1) {
    return QUICK_ACTIONS.slice(0, limit).map((a) => ({
      id: a.id,
      label: a.label,
      text: a.prompt,
      color: a.color,
    }));
  }

  const ranked = QUICK_ACTIONS.map((a) => ({
    action: a,
    score: scoreAction(a.id, q),
  }))
    .sort((a, b) => b.score - a.score)
    .filter((x) => x.score > 0);

  const pool = ranked.length > 0 ? ranked.map((x) => x.action) : QUICK_ACTIONS;
  const tail = q.endsWith(':') || q.endsWith(' ') ? '' : ` ${q}`;

  return pool.slice(0, limit).map((a) => ({
    id: a.id,
    label: a.label,
    text: a.prompt + tail,
    color: a.color,
  }));
}
