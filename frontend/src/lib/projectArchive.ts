const KEY = 'xroga_local_projects';

export type LocalProjectType = 'website' | 'app' | 'game' | 'software';

/** Types shown in Projects — websites, apps, games, software only. */
export const PROJECT_SECTION_TYPES: LocalProjectType[] = ['website', 'app', 'game', 'software'];

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
  if (/\b(app|mobile|ios|android|react native)\b/.test(p)) return 'app';
  if (/\b(software|desktop|electron|tool)\b/.test(p)) return 'software';
  return 'website';
}

/** Only save build-related prompts — not chats, images, or videos. */
export function shouldSaveToProjects(prompt: string): boolean {
  const p = prompt.toLowerCase();
  if (/\b(generate|create|make|draw|design)\b.{0,40}\b(image|picture|photo|logo|icon|thumbnail|poster|banner)\b/i.test(prompt)) {
    return false;
  }
  if (/\b(video|clip|animation|movie|film|reel)\b/i.test(p) && /\b(generate|create|make|produce|render)\b/i.test(p)) {
    return false;
  }
  if (/\b(report|document|doc|pdf|summary|analysis|research)\b/i.test(p) && !/\b(build|website|app|game|software)\b/i.test(p)) {
    return false;
  }
  return /\b(website|web app|landing page|saas|store|shop|game|software|mobile app|build|deploy|extension)\b/i.test(p);
}

export function removeLocalProject(id: string): void {
  save(load().filter((p) => p.id !== id));
}

export function filterProjectsForSection(entries: LocalProjectEntry[]): LocalProjectEntry[] {
  return entries.filter((e) => PROJECT_SECTION_TYPES.includes(e.type));
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
