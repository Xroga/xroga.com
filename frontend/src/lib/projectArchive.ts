const KEY = 'xroga_local_projects';

export type LocalProjectType = 'website' | 'app' | 'game' | 'software' | 'video' | 'automation';

export interface LocalProjectEntry {
  id: string;
  name: string;
  type: LocalProjectType;
  prompt: string;
  sourceMessageId?: string;
  createdAt: string;
  updatedAt: string;
}

function load(): LocalProjectEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocalProjectEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(entries: LocalProjectEntry[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(entries.slice(0, 100)));
}

export function loadLocalProjects(): LocalProjectEntry[] {
  return load();
}

export function inferProjectType(prompt: string): LocalProjectType {
  const p = prompt.toLowerCase();
  if (/\b(game|unity|godot|phaser)\b/.test(p)) return 'game';
  if (/\b(video|film|movie|clip)\b/.test(p)) return 'video';
  if (/\b(automate|scrape|workflow|cron)\b/.test(p)) return 'automation';
  if (/\b(app|mobile|ios|android|react native)\b/.test(p)) return 'app';
  if (/\b(software|desktop|electron|tool)\b/.test(p)) return 'software';
  return 'website';
}

export function saveLocalProject(opts: {
  name: string;
  prompt: string;
  type?: LocalProjectType;
  sourceMessageId?: string;
}) {
  const type = opts.type ?? inferProjectType(opts.prompt);
  const now = new Date().toISOString();
  const entry: LocalProjectEntry = {
    id: `proj-${Date.now()}`,
    name: opts.name.slice(0, 64),
    type,
    prompt: opts.prompt,
    sourceMessageId: opts.sourceMessageId,
    createdAt: now,
    updatedAt: now,
  };
  save([entry, ...load()]);
  return entry;
}

export function isBuildPrompt(prompt: string): boolean {
  return /\b(build|create|make|generate|deploy|website|app|game|software|landing|extension)\b/i.test(prompt);
}
