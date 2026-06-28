export interface UserFeedback {
  id: string;
  emoji: string;
  rating: number;
  experience: string;
  featuresWanted: string;
  author: string;
  createdAt: string;
}

const KEY = 'xroga_user_feedback';

const SEED: UserFeedback[] = [
  {
    id: 'seed-1',
    emoji: '🚀',
    rating: 5,
    experience: 'Xroga built my entire landing page in one prompt. The swarm feels like a real dev team.',
    featuresWanted: 'More game templates and Unity export.',
    author: 'Amina K.',
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: 'seed-2',
    emoji: '✨',
    rating: 4,
    experience: 'Browser automation saved hours on research. Safe search is a huge plus for my team.',
    featuresWanted: 'Community marketplace for sharing automations.',
    author: 'James R.',
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
  },
  {
    id: 'seed-3',
    emoji: '💡',
    rating: 5,
    experience: 'Black Hole V∞ is the only model I need. Action pricing is honest — I always know the cost.',
    featuresWanted: 'Mobile app when iOS launches!',
    author: 'Sara M.',
    createdAt: new Date(Date.now() - 86400000 * 8).toISOString(),
  },
];

function load(): UserFeedback[] {
  if (typeof window === 'undefined') return SEED;
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '[]') as UserFeedback[];
    const ids = new Set(stored.map((f) => f.id));
    return [...stored, ...SEED.filter((s) => !ids.has(s.id))];
  } catch {
    return SEED;
  }
}

function save(items: UserFeedback[]) {
  if (typeof window === 'undefined') return;
  const userOnly = items.filter((f) => !f.id.startsWith('seed-'));
  localStorage.setItem(KEY, JSON.stringify(userOnly));
}

export function listFeedback(): UserFeedback[] {
  return load().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function addFeedback(entry: Omit<UserFeedback, 'id' | 'createdAt'>) {
  const items = load();
  const next: UserFeedback = {
    ...entry,
    id: `fb-${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
  const userItems = items.filter((f) => !f.id.startsWith('seed-'));
  save([next, ...userItems]);
  return next;
}
